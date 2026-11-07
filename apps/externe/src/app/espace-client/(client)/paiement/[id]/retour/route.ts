import { redirect } from "next/navigation";
import { depot } from "@/lib/espace-client/depot";
import { exigerClient, lireDonneesClient } from "@/lib/espace-client/session";
import { retourDeStripe } from "@/lib/espace-client/stripe";
import { stripeConfigure } from "@/lib/espace-client/stripe-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le retour du client depuis la page de paiement de Stripe (success_url et
 * cancel_url de la session Checkout). La session du client et la propriété
 * du dossier sont revérifiées ; puis l'état est redemandé à Stripe — le
 * webhook peut arriver après le client — et le client rejoint :
 *   - après un paiement, la page de son paiement, dans son espace ;
 *   - après une annulation, ses devis, avec « Paiement annulé : aucun
 *     montant n'a été débité. ».
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await exigerClient();
  const d = await lireDonneesClient();
  const session = d.sessions_paiement.find((s) => s.id === id);
  const dossier = session && d.dossiers.find((x) => x.id === session.dossier_id && x.client_id === client.id);
  if (!session || !dossier) redirect("/espace-client");
  if (!stripeConfigure()) redirect(`/espace-client/paiement/${id}`);

  const issue = new URL(req.url).searchParams.get("issue") === "annulation" ? "annulation" : "succes";
  await retourDeStripe(id, issue);

  // L'état après synchronisation, relu par la session du client (sans le cache de la requête).
  const apres = (await depot().lireClient(client.id)).sessions_paiement.find((s) => s.id === id);
  if (issue === "annulation" && apres?.statut !== "payee") {
    redirect(`/espace-client/${encodeURIComponent(dossier.reference)}/devis?ok=paiement-annule${session.cible === "facture" ? "#factures" : ""}`);
  }
  redirect(`/espace-client/${encodeURIComponent(dossier.reference)}/paiement/${id}`);
}
