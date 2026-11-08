"use server";

import { ecrireJournal } from "@/lib/journal";
import { emailEquipe } from "@/lib/espace-client/config";
import { ajouterMessage, avisRecent, versVue } from "@/lib/espace-client/discussion";
import { LONGUEUR_MAX, type MessageVue } from "@/lib/espace-client/discussion-vue";
import { cheminFichier, deposerFichier, octets, PORTE_FICHIERS_CLIENT } from "@/lib/espace-client/fichiers";
import { nomClient } from "@/lib/espace-client/format";
import { conseillerDe } from "@/lib/espace-client/lectures";
import { notifier } from "@/lib/espace-client/notifier";
import { TYPES_DOCUMENTS, verifierFichier } from "@/lib/espace-client/schemas";
import { exigerClientPourAgir, lireDonneesClient, refuserEnApercu } from "@/lib/espace-client/session";

/*
 * Le client écrit à son conseiller, depuis la bulle « Une question ? » ou la
 * page « Mon conseiller » : un message, une pièce jointe (photo ou PDF), ou
 * les deux. Le chemin des actions du client (actions/espace-client.ts) :
 *   1. refusé pendant tout aperçu de l'équipe, édition comprise — un message
 *      signé du client, l'équipe ne l'écrit pas à sa place (elle répond en
 *      son nom, depuis le CRM) ;
 *   2. la session, puis la propriété du dossier, cherché dans ce que la RLS
 *      rend au client ;
 *   3. le contenu, contrôlé ici comme dans le navigateur ;
 *   4. l'écriture par la clé de service, puis l'avis au conseiller et le
 *      journal des gestes. Ni l'avis ni le journal ne font échouer l'envoi.
 *
 * L'avis au conseiller reprend l'e-mail « message au conseiller », avec le
 * lien de la discussion dans le CRM — au plus un par dossier toutes les dix
 * minutes : trois messages de suite, un seul e-mail.
 */

export type IssueEnvoi = { ok: true; message: MessageVue } | { ok: false; erreur: string };

export async function envoyerAuConseiller(reference: string, fd: FormData): Promise<IssueEnvoi> {
  try {
    await refuserEnApercu();
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Aperçu de l'équipe : rien ne s'écrit au nom du client." };
  }
  const client = await exigerClientPourAgir();
  const d = await lireDonneesClient();
  const dossier = d.dossiers.find((x) => x.reference === reference && x.client_id === client.id);
  if (!dossier) return { ok: false, erreur: "Dossier introuvable." };
  const conseiller = conseillerDe(d, client.conseiller_id);

  const corps = String(fd.get("message") ?? "").replace(/\r\n/g, "\n").trim();
  const f = fd.get("piece");
  const fichier = f instanceof File && f.size > 0 ? f : null;
  if (!corps && !fichier) return { ok: false, erreur: "Écrivez votre message, ou joignez une photo ou un PDF." };
  if (corps.length > LONGUEUR_MAX) return { ok: false, erreur: `Votre message dépasse ${LONGUEUR_MAX} caractères : coupez-le en deux.` };
  const erreur = verifierFichier(fichier, TYPES_DOCUMENTS, false);
  if (erreur) return { ok: false, erreur };

  let piece = {};
  if (fichier) {
    const chemin = cheminFichier(dossier.id, fichier.name, "messages");
    await deposerFichier(chemin, await octets(fichier), fichier.type);
    piece = { piece_chemin: chemin, piece_nom: fichier.name.slice(-120), piece_mime: fichier.type, piece_taille: fichier.size };
  }
  const nom = [client.prenom, client.nom].filter(Boolean).join(" ").trim() || client.email;
  const ligne = await ajouterMessage({ dossier_id: dossier.id, auteur: "client", client_id: client.id, equipe_id: null, auteur_nom: nom, corps, ...piece });

  // L'avis au conseiller, regroupé : rien s'il en est déjà parti un pour ce dossier il y a moins de dix minutes.
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
          piece: fichier?.name ?? null,
          // Un avis de la discussion (le regroupement le reconnaît à cette marque) et le lien du fil dans le CRM.
          fil: true,
          chemin: `/dashboard/espace-client/messages?dossier=${dossier.id}`,
          signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone },
        },
      });
      notification = n.id;
    }
  } catch (e) {
    console.error("Discussion : avis au conseiller impossible", e instanceof Error ? e.message : e);
  }

  // Le journal des gestes : jamais le texte du message, seulement qu'il y en a un.
  await ecrireJournal(
    {
      action: "message_client.recu",
      libelle: `Message de ${nom} dans son espace client (${dossier.reference})${fichier ? ", avec une pièce jointe" : ""}`,
      objet: { type: "discussion", id: dossier.id },
      dossierId: typeof dossier.crm_dossier_id === "number" ? dossier.crm_dossier_id : null,
      requestId: dossier.request_id,
      details: { reference: dossier.reference, message_id: ligne.id, piece_jointe: fichier ? true : null, notification_id: notification, avis: notification ? "e-mail au conseiller" : "regroupé avec le précédent" },
    },
    { type: "client", nom, email: client.email },
  );

  return { ok: true, message: versVue(ligne, PORTE_FICHIERS_CLIENT) };
}
