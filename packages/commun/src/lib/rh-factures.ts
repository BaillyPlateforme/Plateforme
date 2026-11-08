import "server-only";
import { depot } from "@/lib/espace-client/depot";
import { pdfFacture, reponsePdf } from "@/lib/espace-client/pdf";
import type { EspacePro } from "@/lib/espaces";
import { lireEspaceRh } from "@/lib/rh";
import { createServiceClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/types";

/**
 * Le PDF d'une facture, pour les RH de l'entreprise : seulement si elle est
 * dans son périmètre — la même lecture que l'écran, lireEspaceRh — et qu'elle
 * a sa version dans l'espace client du collaborateur : le document qu'il
 * télécharge lui-même (nom, villes, référence du dossier ; pas d'adresse).
 * Même réponse qu'elle n'existe pas ou qu'elle ne soit pas à l'entreprise.
 */
export async function pdfFactureRh(
  espace: Pick<EspacePro, "id" | "slug" | "nom" | "rh_couts">,
  factureId: number,
  settings: Pick<SettingsRow, "entreprise_email">,
): Promise<Response> {
  const introuvable = () => new Response("Facture introuvable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!espace.rh_couts || !Number.isInteger(factureId) || factureId <= 0) return introuvable();
  const { factures } = await lireEspaceRh(espace, settings);
  if (!factures.some((x) => x.id === factureId && x.pdf)) return introuvable();

  const { data } = await createServiceClient().from("ec_factures").select("id").eq("crm_facture_id", factureId).limit(1).maybeSingle();
  if (!data) return introuvable();
  const facture = await depot().trouver("factures", (data as { id: string }).id);
  const dossier = facture ? await depot().trouver("dossiers", facture.dossier_id) : null;
  const client = dossier ? await depot().trouver("clients", dossier.client_id) : null;
  if (!facture || !dossier || !client) return introuvable();
  return reponsePdf(await pdfFacture(client, dossier, facture), `facture-${facture.numero}.pdf`, true);
}
