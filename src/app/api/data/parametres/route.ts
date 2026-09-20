import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { checkBrevo } from "@/lib/brevo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [settings, brevo] = await Promise.all([getSettings(), checkBrevo()]);
    return NextResponse.json({ settings, brevo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
