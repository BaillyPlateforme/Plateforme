import { NextResponse } from "next/server";
import { listDevis } from "@/lib/devis";
import { refusHorsEquipe } from "@/crm/lib/garde-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const refus = await refusHorsEquipe();
  if (refus) return refus;
  try {
    return NextResponse.json({ devis: await listDevis() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
