import { currentUser } from "@/crm/lib/auth";
import { classeurModele } from "@/crm/dispatch/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dispatch/modele → le modèle Excel vierge à remplir pour l'import. */
export async function GET() {
  await currentUser();
  return new Response((await classeurModele()) as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele-import-dispatch.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
