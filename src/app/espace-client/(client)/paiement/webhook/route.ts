import { traiterEvenement } from "@/lib/espace-client/paiement";

export const runtime = "nodejs";

/**
 * Le webhook du prestataire de paiement. Avec le prestataire simulé, la page
 * de paiement appelle directement le même traitement ; cette adresse est
 * celle qu'on déclarera chez le vrai prestataire. Signature dans l'en-tête
 * `x-signature` ; sans signature valable, rien ne change.
 */
export async function POST(req: Request) {
  const corps = await req.text();
  const r = await traiterEvenement(corps, req.headers.get("x-signature"));
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
