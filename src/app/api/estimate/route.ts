import { NextResponse } from "next/server";
import { getDefaultGrid } from "@/lib/grids";
import { estimateQuote } from "@/lib/quote";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Estimation live d'un devis à partir de données de formulaire (comparateur / résultat instantané).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const grid = await getDefaultGrid();
  if (!grid) return NextResponse.json({ error: "Aucune grille tarifaire active." }, { status: 400 });

  const fake = {
    volume_m3: Number(b.volume_m3) || 0,
    distance_km: Number(b.distance_km) || 0,
    depart_etage: Number(b.depart_etage) || 0,
    depart_ascenseur: !!b.depart_ascenseur,
    arrivee_etage: Number(b.arrivee_etage) || 0,
    arrivee_ascenseur: !!b.arrivee_ascenseur,
    services: (b.services as Record<string, boolean>) ?? {},
  } as unknown as RequestRow;

  return NextResponse.json(estimateQuote(fake, grid));
}
