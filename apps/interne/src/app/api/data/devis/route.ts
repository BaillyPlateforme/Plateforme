import { NextResponse } from "next/server";
import { listDevis } from "@/lib/devis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ devis: await listDevis() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
