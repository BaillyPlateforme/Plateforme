import { NextResponse, after } from "next/server";
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
    const { demande, suite } = await createRequest(parsed.data, source);
    // Le chiffrage, le devis et les messages partent après la réponse : le
    // client n'attend que l'enregistrement de sa demande. L'écran de résultat
    // vient chercher l'estimation dès qu'elle est prête.
    after(() =>
      suite().catch((e) => console.error(`[demande ${demande.id}] suite en échec :`, e instanceof Error ? e.message : e)),
    );
    return NextResponse.json({ id: demande.id, status: demande.status }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
