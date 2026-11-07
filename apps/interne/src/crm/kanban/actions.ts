"use server";
import { revalidatePath } from "next/cache";
import * as A from "@/crm/actions";
import * as B from "@/crm/actions2";
import { currentUser } from "@/crm/lib/auth";
import { q, q1 } from "@/crm/lib/db";
import { projeterEspace } from "@/crm/lib/espace";
import { carteKanban } from "./donnees";
import { NOM, estStatut, verdict, type Statut } from "./regles";

/*
 * Le dépôt d'un dossier dans une colonne du Kanban.
 *
 * Les règles (regles.ts) sont rejouées ici sur l'état réel du dossier, relu
 * en base : l'écran a pu vieillir (un collègue a signé entre-temps). Puis le
 * geste appelle l'action du métier que la fiche du dossier utilise déjà
 * (actions.ts, actions2.ts) : c'est elle qui change le statut, inscrit
 * l'activité et projette l'espace client. Enfin, le statut est relu : un
 * dépôt qui n'a rien changé est signalé, jamais annoncé comme fait.
 *
 * Seule exception, la visite : l'action du planning (creerRdv) renvoie vers
 * le planning une fois le rendez-vous créé ; on en reprend ici les mêmes
 * écritures, sans la redirection.
 */

export type Choix = {
  devisId?: number;
  /** Envoyer le devis avec un lien de signature électronique (actions2.ts, envoyerPourSignature). */
  signature?: boolean;
  dateChargement?: string;
  dateLivraison?: string;
  factureId?: number;
  /** Le rendez-vous de visite : l'instant de début (ISO), le type, le commercial. */
  visite?: { debut: string; type: "phys" | "visio"; commercialId: number; dureeMin: number };
};

export type Issue = { ok: true; message: string } | { ok: false; erreur: string };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

function formulaire(champs: Record<string, string | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) if (v) f.set(k, v);
  return f;
}

export async function deplacerDossier(id: number, vers: string, choix: Choix = {}): Promise<Issue> {
  const u = await currentUser();
  if (!estStatut(vers)) return { ok: false, erreur: "Colonne inconnue." };
  const carte = await carteKanban(id);
  if (!carte) return { ok: false, erreur: "Ce dossier n'existe plus." };
  const v = verdict(carte, vers);
  if (!v) return { ok: true, message: "Le dossier est déjà dans cette colonne." };
  if (!v.ok) return { ok: false, erreur: v.raison };

  const g = v.geste;
  const devisChoisi = "devis" in g ? g.devis.find((d) => d.id === choix.devisId) : undefined;
  try {
    switch (g.genre) {
      case "perdre":
        await A.marquerPerdu(id);
        break;
      case "rouvrir":
        await A.rouvrir(id);
        break;
      case "generer":
        await A.genererDevis(id);
        break;
      case "envoyer":
        if (!devisChoisi) return { ok: false, erreur: "Choisissez le devis à envoyer." };
        if (choix.signature) await B.envoyerPourSignature(id, devisChoisi.id);
        else await A.envoyerDevis(id, devisChoisi.id);
        break;
      case "signer":
        if (!devisChoisi) return { ok: false, erreur: "Choisissez le devis signé par le client." };
        await A.signerDevis(id, devisChoisi.id);
        break;
      case "sansDevis":
        await A.commandeSansDevis(id);
        break;
      case "planifier": {
        if (!choix.dateChargement || !JOUR.test(choix.dateChargement)) return { ok: false, erreur: "La date de chargement est obligatoire." };
        if (choix.dateLivraison && !JOUR.test(choix.dateLivraison)) return { ok: false, erreur: "La date de livraison n'est pas valide." };
        if (choix.dateLivraison && choix.dateLivraison < choix.dateChargement) return { ok: false, erreur: "La livraison ne peut pas précéder le chargement." };
        await A.planifierDemenagement(id, formulaire({ date_chargement: choix.dateChargement, date_livraison: choix.dateLivraison }));
        break;
      }
      case "regler": {
        const f = g.factures.find((x) => x.id === choix.factureId);
        if (!f) return { ok: false, erreur: "Choisissez la facture réglée." };
        await A.facturePayee(id, f.id);
        break;
      }
      case "visite": {
        const r = choix.visite;
        const debut = r ? new Date(r.debut) : null;
        if (!r || !debut || Number.isNaN(debut.getTime())) return { ok: false, erreur: "Indiquez la date et l'heure de la visite." };
        if (!(await q1("select 1 from utilisateurs where id=$1", [r.commercialId]))) return { ok: false, erreur: "Choisissez le commercial qui fera la visite." };
        const lieu = (await q1<{ adresse: string | null }>("select adresse from etapes_trajet where dossier_id=$1 and genre='depart' order by ordre limit 1", [id]))?.adresse ?? null;
        // Les écritures de creerRdv (actions.ts), sans la redirection vers le planning.
        await q("insert into rendez_vous(commercial_id,dossier_id,type,titre,lieu,debut,duree_min) values($1,$2,$3,$4,$5,$6,$7)", [
          r.commercialId, id, r.type, `Visite technique · ${carte.client}`, r.type === "visio" ? "Visio" : lieu, debut.toISOString(), Math.min(480, Math.max(15, r.dureeMin || 60)),
        ]);
        await q("update dossiers set statut='visite' where id=$1 and statut='prospect'", [id]);
        await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [id, u.id, `${r.type === "visio" ? "Visio" : "Visite"} planifiée`]);
        await q("update dossiers set maj_le=now() where id=$1", [id]);
        await projeterEspace(id);
        revalidatePath("/(crm)", "layout");
        break;
      }
    }
  } catch (e) {
    console.error(`Kanban : dépôt du dossier ${id} vers ${vers} impossible`, e instanceof Error ? e.message : e);
    return { ok: false, erreur: "L'action n'a pas pu être enregistrée. Réessayez dans un instant." };
  }

  // Le statut est relu : seul un changement réel est annoncé.
  const apres = (await q1<{ statut: Statut }>("select statut from dossiers where id=$1", [id]))?.statut;
  if (apres !== vers) {
    return {
      ok: false,
      erreur:
        g.genre === "signer"
          ? "La signature n'a pas été enregistrée : ce devis n'est plus ouvert, ou un autre devis du dossier est déjà signé."
          : `Le dossier n'est pas passé en « ${NOM[vers]} » : rechargez la page pour voir son état actuel.`,
    };
  }
  const message: Record<string, string> = {
    perdre: `${carte.client} est marqué perdu.`,
    rouvrir: `${carte.client} est rouvert : visite à faire.`,
    generer: `Les 3 formules de ${carte.client} sont établies en brouillon.`,
    envoyer: `Devis ${devisChoisi?.numero ?? ""} marqué envoyé${choix.signature ? ", avec son lien de signature" : ""}.`,
    signer: `Devis ${devisChoisi?.numero ?? ""} signé : ${carte.client} passe en commande.`,
    sansDevis: `${carte.client} passe en commande sans devis.`,
    planifier: `Déménagement de ${carte.client} planifié.`,
    regler: `Facture réglée : le dossier de ${carte.client} est terminé.`,
    visite: `Visite de ${carte.client} planifiée.`,
  };
  return { ok: true, message: message[g.genre] };
}
