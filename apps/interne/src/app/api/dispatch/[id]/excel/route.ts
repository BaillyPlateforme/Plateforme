import { currentUser } from "@/crm/lib/auth";
import { plan as lirePlan } from "@/crm/dispatch/donnees";
import { classeurPlan } from "@/crm/dispatch/excel";
import { slug } from "@/crm/dispatch/outils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dispatch/[id]/excel → le planning en Excel : une synthèse, une
 * feuille par colonne, les clients à répartir. Le proxy exige déjà une
 * session d'équipe ; currentUser() la revérifie et donne le nom imprimé.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  const plan = await lirePlan(Number((await params).id));
  if (!plan) return new Response("Plan introuvable", { status: 404 });
  const octets = await classeurPlan(plan, u.nom);
  const nom = `dispatch-${slug(plan.nom)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(octets as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
