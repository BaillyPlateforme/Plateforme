import { NextResponse } from "next/server";
import { repondreEquipe } from "@/lib/espace-client/routes-equipe";
import { exigerEquipe } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Les données du back-office de l'espace client. Le proxy garde /api/data,
 * mais la route revérifie elle-même que c'est l'équipe : le 13/11/2026, une
 * adresse finissant par « .png » passait à côté du proxy, et cette route,
 * qui s'y fiait, livrait ses données sans session.
 */
export async function GET(req: Request, { params }: { params: Promise<{ chemin?: string[] }> }) {
  try {
    await exigerEquipe();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Accès refusé" }, { status: 401 });
  }
  const { chemin = [] } = await params;
  return repondreEquipe(req, chemin);
}
