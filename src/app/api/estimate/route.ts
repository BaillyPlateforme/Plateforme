import { NextResponse } from "next/server";
import { simuler, type SimulationInput } from "@/lib/pricing/engine";
import type { Formule } from "@/lib/pricing/grille";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Estimation live à partir de la grille : sert au simulateur et à tout
// appel externe (n8n, site vitrine) qui veut un chiffrage sans créer de demande.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const formules: Formule[] = ["eco", "standard", "luxe"];
  const formule = formules.includes(b.formule as Formule) ? (b.formule as Formule) : "standard";

  const input: SimulationInput = {
    formule,
    volume_m3: num(b.volume_m3),
    distance_km: num(b.distance_km),
    voyage_special: !!b.voyage_special,
    portage_depart_m: num(b.portage_depart_m),
    portage_arrivee_m: num(b.portage_arrivee_m),
    transbordement: !!b.transbordement,
    monte_meubles: num(b.monte_meubles),
    piano_droit: num(b.piano_droit),
    charges_lourdes: num(b.charges_lourdes),
    valeur_declaree: num(b.valeur_declaree),
    tva: b.tva == null ? undefined : num(b.tva),
  };

  return NextResponse.json(simuler(input));
}
