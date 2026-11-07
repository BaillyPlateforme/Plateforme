import { traiterWebhookStripe } from "@/lib/espace-client/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le webhook de Stripe : l'adresse à déclarer dans le tableau de bord de
 * Stripe (Développeurs › Webhooks), pour les événements
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed et checkout.session.expired.
 *
 * Sans session ni cookie (le proxy la laisse passer) : c'est la signature
 * `Stripe-Signature`, vérifiée sur le corps brut avec STRIPE_WEBHOOK_SECRET,
 * qui fait foi. Le corps est lu en texte, tel quel, avant toute autre
 * lecture. Sans Stripe réglé, l'adresse n'existe pas (404).
 */
export async function POST(req: Request) {
  const corps = await req.text();
  const r = await traiterWebhookStripe(corps, req.headers.get("stripe-signature"));
  return Response.json({ message: r.message }, { status: r.statut });
}
