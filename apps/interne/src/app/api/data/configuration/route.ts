import { NextResponse } from "next/server";
import { listLibraryPhotos } from "@/lib/library";
import { getAiConfig } from "@/lib/ai-config";
import { getQualifConfig } from "@/lib/qualification";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [library, aiConfig, qualifConfig] = await Promise.all([
      listLibraryPhotos(),
      getAiConfig(),
      getQualifConfig(),
    ]);
    return NextResponse.json({ library, aiConfig, qualifConfig });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
