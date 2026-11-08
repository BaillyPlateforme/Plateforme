import { demoEquipeActive } from "@/lib/espace-client/config";
import { repondreEquipe } from "@/lib/espace-client/routes-equipe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Les mêmes données que /api/data/espace-client, pour le back-office de
 * démonstration — qui n'existe que sur des données fictives, en
 * développement ou sur demande explicite (config.ts). Ailleurs : 404.
 */
export async function GET(req: Request, { params }: { params: Promise<{ chemin?: string[] }> }) {
  if (!demoEquipeActive()) return new Response("Introuvable.", { status: 404 });
  const { chemin = [] } = await params;
  return repondreEquipe(req, chemin, { demo: true });
}
