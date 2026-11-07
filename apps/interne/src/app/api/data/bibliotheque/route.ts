import { NextResponse } from "next/server";
import { listLibraryPhotos } from "@/lib/library";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ library: await listLibraryPhotos() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
