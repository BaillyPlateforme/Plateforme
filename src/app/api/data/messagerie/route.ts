import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/templates";
import { listAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [templates, rules] = await Promise.all([listTemplates(), listAlerts()]);
    return NextResponse.json({ templates, rules });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
