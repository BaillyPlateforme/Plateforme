import { NextResponse } from "next/server";
import { listRappels } from "@/lib/rappels";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ rappels: await listRappels() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
