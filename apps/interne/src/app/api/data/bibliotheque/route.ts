import { NextResponse } from "next/server";
import { listLibraryPhotos } from "@/lib/library";
import { refusHorsEquipe } from "@/crm/lib/garde-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const refus = await refusHorsEquipe();
  if (refus) return refus;
  try {
    return NextResponse.json({ library: await listLibraryPhotos() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
