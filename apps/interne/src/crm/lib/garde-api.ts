import { NextResponse } from "next/server";
import { exigerEquipe } from "@/lib/supabase/auth";

/**
 * La garde des routes API de l'équipe. Le proxy les protège déjà, mais une
 * route ne doit jamais s'y fier seule : le 13/11/2026, une adresse finissant
 * par « .png » passait à côté du proxy. Chaque route la rappelle en tête :
 *
 *   const refus = await refusHorsEquipe();
 *   if (refus) return refus;
 */
export async function refusHorsEquipe(): Promise<NextResponse | null> {
  try {
    await exigerEquipe();
    return null;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Accès refusé" }, { status: 401 });
  }
}
