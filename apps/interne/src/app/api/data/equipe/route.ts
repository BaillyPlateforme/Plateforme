import { NextResponse } from "next/server";
import { listTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ members: await listTeam() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
