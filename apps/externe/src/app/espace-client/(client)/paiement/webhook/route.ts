import { traiterEvenement } from "@/lib/espace-client/paiement";
import { stripeConfigure } from "@/lib/espace-client/stripe-config";

export const runtime = "nodejs";

/**
 * Le webhook du prestataire SIMULÉ. La page de paiement simulée appelle
 * directement le même traitement ; signature dans l'en-tête `x-signature`
 * (clé du serveur) ; sans signature valable, rien ne change.
 *
 * Dès que Stripe est réglé, cette adresse n'existe plus : le webhook de
 * Stripe est /espace-client/paiement/webhook/stripe.
 */
export async function POST(req: Request) {
  if (stripeConfigure()) return new Response("Introuvable.", { status: 404 });
  const corps = await req.text();
  const r = await traiterEvenement(corps, req.headers.get("x-signature"));
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
