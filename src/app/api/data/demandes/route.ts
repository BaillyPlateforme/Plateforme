import { NextResponse } from "next/server";
import { listRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";

// Source unique des listes de demandes : liste, focus, kanban, agenda, stats.
export async function GET() {
  try {
    return NextResponse.json({ requests: await listRequests() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
