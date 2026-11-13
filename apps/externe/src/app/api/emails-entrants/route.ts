import { NextResponse } from "next/server";
import { ingestEmail, type IncomingEmail } from "@/lib/emails-in";
import { secretPresente } from "@/lib/secret-partage";

export const runtime = "nodejs";

/**
 * POST /api/emails-entrants — les mails parsés par une machine (n8n) qui
 * deviennent des demandes.
 *
 * Réservé à cette machine : INACTIF tant que EMAILS_ENTRANTS_SECRET n'est pas
 * réglé (404, comme si la route n'existait pas), puis chaque appel doit porter
 * « Authorization: Bearer <secret> ». Ouverte à tous jusqu'au 13/11/2026, elle
 * permettait de faire envoyer par Bailly un e-mail à n'importe qui et de
 * glisser une demande dans le portail RH d'une entreprise.
 */
export async function POST(req: Request) {
  const secret = process.env.EMAILS_ENTRANTS_SECRET?.trim();
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!secretPresente(req, secret)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

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
    console.error("[emails-entrants]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "La demande n'a pas pu être enregistrée." }, { status: 500 });
  }
}
