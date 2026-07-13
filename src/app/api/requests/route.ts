import { NextResponse } from "next/server";
import { createRequestSchema } from "@/lib/schemas";
import { createRequest } from "@/lib/requests";
import type { RequestSource } from "@/lib/types";

// POST /api/requests
// Point d'entrée UNIQUE : le formulaire public ET n8n (mail parsé) postent ici.
// n8n indique la source via l'en-tête x-request-source: email.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = createRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation échouée", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const source: RequestSource =
    req.headers.get("x-request-source") === "email" ? "email" : "form";

  try {
    const request = await createRequest(parsed.data, source);
    return NextResponse.json({ id: request.id, status: request.status }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
