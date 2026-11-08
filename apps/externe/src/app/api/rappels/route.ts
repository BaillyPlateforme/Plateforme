import { NextResponse } from "next/server";
import { creerRappel } from "@/lib/rappels";

export const runtime = "nodejs";

// POST /api/rappels — le client, au bout de son estimation, demande à être rappelé.
export async function POST(req: Request) {
  let body: { request_id?: string; creneau?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.request_id) {
    return NextResponse.json({ error: "Demande non précisée" }, { status: 422 });
  }

  try {
    const r = await creerRappel(body.request_id, body.creneau);
    return NextResponse.json(r, { status: r.deja ? 200 : 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    // Un lien de rappel vers une demande qui n'existe pas (ou plus) : 404, pas une erreur du serveur.
    return NextResponse.json({ error: message }, { status: message === "Demande introuvable" ? 404 : 500 });
  }
}
