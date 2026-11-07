import { NextResponse } from "next/server";
import { listLeads } from "@/lib/suivi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ leads: await listLeads() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
