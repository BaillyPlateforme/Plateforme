import "server-only";
import { noterDansLeCrm } from "./crm";
import { editionEquipe } from "./session";
import type { Dossier } from "./types";

/*
 * L'édition de l'espace d'un client par l'équipe (apercu.ts, session.ts) :
 * chaque geste qui passe est l'acte d'un membre de l'équipe, pas du client.
 *
 *   - une ligne au fil d'activité du dossier du CRM, toujours :
 *     « <geste> dans l'espace client, par <nom> (édition équipe) » ;
 *   - la marque de l'équipe dans l'enregistrement lui-même, quand il a de
 *     quoi la porter sans changer de schéma : `marqueEquipe` pour le
 *     navigateur des acceptations (ec_acceptations.user_agent), l'auteur
 *     d'une pièce (ec_documents.created_by), la saisie d'une déclaration
 *     (ec_declarations_valeurs.contenu.saisie_equipe).
 *
 * Hors édition, rien de tout cela : un geste du client reste le sien.
 */

/** La marque de l'équipe, à poser dans un champ texte de l'enregistrement. */
export const marqueEquipe = (e: { par: string; email: string }) => `Édition par l'équipe : ${e.par} <${e.email}>`;

/**
 * Note le geste au fil d'activité du dossier du CRM, s'il est fait en
 * édition par l'équipe. Jamais bloquant (noterDansLeCrm). Un espace sans
 * dossier du CRM est noté dans le journal du serveur.
 */
export async function tracerEdition(dossier: Pick<Dossier, "crm_dossier_id" | "reference">, geste: string): Promise<void> {
  const e = await editionEquipe();
  if (!e) return;
  const libelle = `${geste} dans l'espace client, par ${e.par} (édition équipe)`;
  if (typeof dossier.crm_dossier_id === "number") await noterDansLeCrm(dossier.crm_dossier_id, libelle);
  else console.info(`Espace client ${dossier.reference} : ${libelle} (sans dossier du CRM où le noter).`);
}
