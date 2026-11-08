"use server";

import { revalidatePath } from "next/cache";
import { ecrireJournal } from "@/lib/journal";
import { emailEquipe } from "@/lib/espace-client/config";
import { noterDansLeCrm } from "@/lib/espace-client/crm";
import { depot } from "@/lib/espace-client/depot";
import { corpsReponse, suiviDesReponses, type GesteDevis } from "@/lib/espace-client/devis-reponses";
import { ajouterMessage, avisRecent, lireFil } from "@/lib/espace-client/discussion";
import { aujourdhui, nomClient } from "@/lib/espace-client/format";
import { conseillerDe } from "@/lib/espace-client/lectures";
import { notifier } from "@/lib/espace-client/notifier";
import { erreursDe, lireReponseDevis, reponseDevisSchemas } from "@/lib/espace-client/schemas";
import { exigerClientPourAgir, lireDonneesClient, refuserEnApercu } from "@/lib/espace-client/session";
import type { EtatFormulaire } from "./espace-client";

/*
 * Le client répond à un devis, depuis « Mes devis » : il ne retient pas une
 * formule, il demande une modification, ou — le devis expiré — un nouveau
 * devis. Le chemin des actions du client (espace-client.ts) :
 *
 *   1. refusé pendant tout aperçu de l'équipe, édition comprise : c'est un
 *      message écrit au nom du client (l'équipe répond en son nom, depuis le
 *      CRM) ;
 *   2. la session, puis la propriété du dossier et du devis, cherchés dans ce
 *      que la RLS rend au client ; le devis doit attendre cette réponse ;
 *   3. le texte, contrôlé par le même schéma que dans le navigateur ;
 *   4. le message, posté dans la discussion du dossier (ec_messages) : la
 *      conversation continue là, et le conseiller y répond depuis le CRM ;
 *   5. l'avis au conseiller, par le chemin de la discussion — l'e-mail
 *      « message au conseiller » avec le lien du fil, au plus un par dossier
 *      toutes les dix minutes ;
 *   6. une ligne au fil d'activité du dossier dans le CRM, et au journal des
 *      gestes (le Feed), reliées l'une à l'autre.
 *
 * « Je ne retiens pas » ne change pas le statut du devis dans le CRM : aucune
 * fonction de l'espace ne le fait sans risque (seul « Retirer une formule »,
 * geste de l'équipe, le pose). Le conseiller le lit et retire la formule ;
 * la projection la montre alors « non retenue ». Les autres formules ne
 * bougent pas. Un devis propre à l'espace (sans CRM), lui, passe aussitôt à
 * « non retenu ».
 */

const LIBELLE_CRM: Record<GesteDevis, (numero: string) => string> = {
  refus: (n) => `Devis ${n} non retenu par le client (espace client)`,
  modification: (n) => `Modification du devis ${n} demandée par le client (espace client)`,
  renouvellement: (n) => `Nouveau devis demandé par le client : le devis ${n} a expiré (espace client)`,
};

const ACTION_JOURNAL: Record<GesteDevis, string> = {
  refus: "devis_client.non_retenu",
  modification: "devis_client.modification",
  renouvellement: "devis_client.renouvellement",
};

async function repondre(geste: GesteDevis, reference: string, devisId: string, fd: FormData): Promise<EtatFormulaire> {
  try {
    await refuserEnApercu();
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Aperçu de l'équipe : rien ne s'écrit au nom du client." };
  }
  const client = await exigerClientPourAgir();
  const d = await lireDonneesClient();
  const dossier = d.dossiers.find((x) => x.reference === reference && x.client_id === client.id);
  if (!dossier) return { message: "Dossier introuvable." };
  if (client.masquer_devis) return { message: "Les devis de votre dossier sont suivis directement avec votre conseiller." };
  const devis = d.devis.find((x) => x.id === devisId && x.dossier_id === dossier.id);
  if (!devis) return { message: "Ce devis n'est plus disponible : rechargez la page." };

  // Un devis en attente se refuse ou se modifie ; un devis expiré se renouvelle.
  const expire = devis.statut === "expire" || (devis.statut === "envoye" && devis.valide_jusqu_au < aujourdhui());
  const enAttente = devis.statut === "envoye" && !expire;
  if (geste === "renouvellement" ? !expire : !enAttente) {
    return { message: geste === "renouvellement" ? "Ce devis est encore valable : vous pouvez y répondre directement." : "Ce devis n'attend plus de réponse : rechargez la page." };
  }

  const r = reponseDevisSchemas[geste].safeParse(lireReponseDevis(fd));
  if (!r.success) return { erreurs: erreursDe(r.error) };
  const texte = r.data.texte;

  // Une seule fois par devis : « je ne retiens pas » et « un nouveau devis » (un double clic, deux onglets).
  const fil = await lireFil(dossier.id, "service").catch(() => []);
  const suivi = suiviDesReponses(fil.map((m) => ({ auteur: m.auteur, corps: m.corps, le: m.created_at })), [devis])[devis.id];
  if ((geste === "refus" && suivi.refus) || (geste === "renouvellement" && suivi.renouvellement)) return { ok: true };

  const nom = [client.prenom, client.nom].filter(Boolean).join(" ").trim() || client.email;
  const corps = corpsReponse(geste, devis, texte);
  let ligne;
  try {
    ligne = await ajouterMessage({ dossier_id: dossier.id, auteur: "client", client_id: client.id, equipe_id: null, auteur_nom: nom, corps });
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Votre réponse n'est pas partie : réessayez dans un instant." };
  }

  // Un devis propre à l'espace (sans CRM) : non retenu tout de suite. Les autres ne bougent pas.
  if (geste === "refus" && typeof devis.crm_devis_id !== "number") {
    await depot().modifier("devis", devis.id, { statut: "refuse" }, { statut: "envoye" });
  }

  // L'avis au conseiller : celui de la discussion, regroupé (rien s'il en est parti un il y a moins de dix minutes).
  const conseiller = conseillerDe(d, client.conseiller_id);
  let notification: string | null = null;
  try {
    if (!(await avisRecent(dossier.id, "message_conseiller"))) {
      const n = await notifier.envoyer({
        dossier_id: dossier.id,
        canal: "email",
        modele: "message_conseiller",
        destinataire: conseiller.email || emailEquipe(conseiller.email),
        payload: {
          client: nomClient(client),
          email: client.email,
          reference: dossier.reference,
          message: corps,
          piece: null,
          fil: true,
          chemin: `/dashboard/espace-client/messages?dossier=${dossier.id}`,
          signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone },
        },
      });
      notification = n.id;
    }
  } catch (e) {
    console.error("Devis : avis au conseiller impossible", e instanceof Error ? e.message : e);
  }

  // Le fil du dossier dans le CRM, et le journal des gestes relié à cette ligne (le Feed n'en montre qu'une).
  const libelle = LIBELLE_CRM[geste](devis.numero);
  const crmDossier = typeof dossier.crm_dossier_id === "number" ? dossier.crm_dossier_id : null;
  await noterDansLeCrm(crmDossier, libelle);
  await ecrireJournal(
    {
      action: ACTION_JOURNAL[geste],
      libelle,
      objet: { type: "discussion", id: dossier.id },
      dossierId: crmDossier,
      requestId: dossier.request_id,
      activite: crmDossier ? libelle : null,
      // Jamais le texte du client : il est dans la discussion.
      details: {
        reference: dossier.reference, devis: devis.numero, formule: devis.formule, crm_devis_id: devis.crm_devis_id ?? null,
        message_id: ligne.id, avec_texte: texte ? true : null, notification_id: notification,
        avis: notification ? "e-mail au conseiller" : "regroupé avec le précédent",
      },
    },
    { type: "client", nom, email: client.email },
  );

  revalidatePath(`/espace-client/${reference}`, "layout");
  return { ok: true };
}

/** « Je ne retiens pas ce devis », avec un motif facultatif. */
export async function refuserDevis(reference: string, devisId: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return repondre("refus", reference, devisId, fd);
}

/** « Demander une modification » : ce qu'il faut changer, en clair. */
export async function demanderModificationDevis(reference: string, devisId: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return repondre("modification", reference, devisId, fd);
}

/** Le devis a expiré : « Demander un nouveau devis », avec une précision facultative. */
export async function demanderNouveauDevis(reference: string, devisId: string, _: EtatFormulaire, fd: FormData): Promise<EtatFormulaire> {
  return repondre("renouvellement", reference, devisId, fd);
}
