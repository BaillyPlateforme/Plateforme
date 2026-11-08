"use server";
import { currentUser } from "@/crm/lib/auth";
import { chercherDossiers } from "./donnees";

/*
 * La recherche du dossier de destination d'une duplication (un devis, une
 * facture, dans un autre dossier). Elle revérifie la session, comme toute
 * action du CRM. Les duplications elles-mêmes vivent dans leur module :
 * devis (src/crm/devis/actions.ts), facture (src/crm/facturation/actions.ts),
 * client (src/crm/clients/actions.ts), dossier (creerDossier, avec
 * src/crm/duplication/dossier.ts).
 */
export async function chercherDossiersCible(texte: string, sauf?: number | null) {
  await currentUser();
  return chercherDossiers(String(texte ?? ""), typeof sauf === "number" ? sauf : null);
}
