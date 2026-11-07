import { NextResponse } from "next/server";
import { preparerTableauDeBord } from "@/lib/tableau-de-bord";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await preparerTableauDeBord());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
