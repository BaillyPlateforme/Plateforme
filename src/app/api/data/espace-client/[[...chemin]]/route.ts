import { repondreEquipe } from "@/lib/espace-client/routes-equipe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Les données du back-office de l'espace client. Le middleware garde déjà
 * /api/data : seule une session d'équipe (pas un compte RH) arrive ici.
 */
export async function GET(req: Request, { params }: { params: Promise<{ chemin?: string[] }> }) {
  const { chemin = [] } = await params;
  return repondreEquipe(req, chemin);
}
