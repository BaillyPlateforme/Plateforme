import { NextResponse } from "next/server";
import { listLeads } from "@/lib/suivi";
import { refusHorsEquipe } from "@/crm/lib/garde-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const refus = await refusHorsEquipe();
  if (refus) return refus;
  try {
    return NextResponse.json({ leads: await listLeads() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
