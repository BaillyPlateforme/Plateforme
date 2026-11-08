import { pdfFactureRh } from "@/lib/rh-factures";
import { espaceDeLaSession } from "@/lib/rh-session";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/rh/factures/<id du CRM>/pdf[?apercu=<espace>] — la facture d'une
// mobilité de l'entreprise, en PDF. L'espace vient du compte (rh-session.ts) ;
// la facture n'est servie que si elle est dans son périmètre.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await espaceDeLaSession(req);
  if (!s.ok) return new Response(s.erreur, { status: s.statut, headers: { "Cache-Control": "no-store" } });
  if (!s.espace) return new Response("Choisissez un espace.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  return pdfFactureRh(s.espace, Number(id), await getSettings());
}
