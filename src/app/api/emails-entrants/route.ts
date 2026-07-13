import { NextResponse } from "next/server";
import { ingestEmail, type IncomingEmail } from "@/lib/emails-in";

export const runtime = "nodejs";

// POST /api/emails-entrants
// Point d'entrée des mails parsés (ex. via n8n) → demande + workflows.
export async function POST(req: Request) {
  let body: IncomingEmail;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  try {
    const result = await ingestEmail(body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
