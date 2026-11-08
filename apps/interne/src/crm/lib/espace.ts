import "server-only";
import { alerterEquipe } from "@/lib/alertes-equipe";
import { q1 } from "./db";
import { nomClient } from "./format";

/*
 * Le CRM et l'espace client : un dossier, deux faces (migration 0012).
 *
 * Après chaque changement d'un dossier, le CRM le projette vers son espace
 * client, s'il en a un : le client y retrouve aussitôt ses devis, ses
 * factures, ses dates. La projection est une fonction de la base, appelée
 * par le pool du CRM ; sans espace lié, elle ne fait rien.
 *
 * Elle ne bloque jamais le CRM : si elle échoue (base injoignable, migration
 * 0012 pas encore appliquée), l'action du CRM a eu lieu, et l'erreur se lit
 * dans le journal du serveur. La prochaine action la rattrapera.
 */
export async function projeterEspace(dossierId: number | null | undefined) {
  if (!dossierId) return;
  try {
    await q1("select public.ec_projeter_dossier_crm($1)", [dossierId]);
  } catch (e) {
    console.error(`BaillyCRM : projection du dossier ${dossierId} vers l'espace client impossible`, e instanceof Error ? e.message : e);
  }
  // La visite technique (migration 0015) : créneaux proposés, visites, comptes-rendus signés.
  try {
    await q1("select public.ec_projeter_visites_crm($1)", [dossierId]);
  } catch (e) {
    console.error(`BaillyCRM : projection des visites du dossier ${dossierId} vers l'espace client impossible`, e instanceof Error ? e.message : e);
  }
}

export type IssueSignature = "signe" | "deja_signe" | "autre_signe" | "ferme" | "inconnu";

/**
 * La signature d'un devis : la même règle que l'espace client (un seul devis
 * signé par dossier), tenue par la base. `origine` dit d'où elle vient, pour
 * le fil d'activité : « lien » (la page /signature) ou « equipe ».
 */
export async function signerDevisUnique(
  devisId: number,
  origine: "lien" | "equipe",
  options: { utilisateurId?: number | null; ip?: string | null; userAgent?: string | null } = {},
): Promise<IssueSignature> {
  const r = await q1<{ issue: IssueSignature }>("select public.ec_signer_devis_crm($1, $2, $3, $4, $5) as issue", [
    devisId, origine, options.utilisateurId ?? null, options.ip ?? null, options.userAgent ?? null,
  ]);
  if (r?.issue === "signe") await alerterDevisSigne(devisId, origine);
  return r?.issue ?? "inconnu";
}

/** L'alerte de l'équipe « Devis signé », à ses abonnés (Relances › Alertes de l'équipe). */
async function alerterDevisSigne(devisId: number, origine: "lien" | "equipe") {
  const v = await q1<{ numero: string; dossier_id: number; ref: string; nom: string | null; prenom: string | null; societe: string | null; commercial: string | null }>(
    `select v.numero, v.dossier_id, d.ref, c.nom, c.prenom, c.societe, u.email as commercial
       from devis v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id left join utilisateurs u on u.id = d.commercial_id where v.id = $1`,
    [devisId],
  ).catch(() => undefined);
  if (!v) return;
  await alerterEquipe("devis_signe", {
    evenement: `crm-devis-${devisId}`, reference: v.ref, conseillers: [v.commercial],
    vars: { client: nomClient(v), reference: v.ref, numero: v.numero, origine: origine === "lien" ? "par le lien de signature" : "par l'équipe" },
    lien: { chemin: `/dossiers/${v.dossier_id}`, libelle: "Ouvrir le dossier" },
  });
}
