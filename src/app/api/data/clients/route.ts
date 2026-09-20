import { NextResponse } from "next/server";
import { listClients } from "@/lib/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ clients: await listClients() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
