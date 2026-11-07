import "server-only";
import { q1 } from "./db";

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
  return r?.issue ?? "inconnu";
}
