import { timingSafeEqual } from "node:crypto";
import { noterBrevo, type EvenementBrevo } from "@/lib/suivi-envois";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le webhook des e-mails transactionnels de Brevo : POST /api/suivi/brevo.
 *
 * À RETIRER APRÈS LA BASCULE VERS TWILIO (décision du 18/11/2026) : les
 * e-mails passent désormais par SendGrid, dont les événements arrivent sur
 * /api/suivi/sendgrid. Cette route ne sert plus qu'aux messages encore
 * partis par Brevo (avant la bascule, ou si ENVOI_FOURNISSEUR=brevo).
 *
 * INACTIF tant que BREVO_WEBHOOK_SECRET n'est pas réglé : la route répond
 * alors 404, comme si elle n'existait pas. Une fois réglé, chaque appel doit
 * porter ce secret — en-tête « Authorization: Bearer <secret> » (le jeton
 * d'authentification d'un webhook créé par l'API de Brevo), ou
 * l'authentification HTTP simple, le secret en mot de passe (adresse
 * https://brevo:<secret>@…). Sinon 401, rien n'est lu.
 *
 * Ce que Brevo est seul à savoir, et que la plateforme garde (lib/suivi-envois,
 * public.envois_evenements, rattaché à la ligne du journal par l'identifiant
 * du message) :
 *   delivered                                   → délivré ;
 *   hard_bounce, soft_bounce, invalid_email,
 *   blocked, error                              → rebond (le genre est gardé) ;
 *   spam                                        → plainte ;
 *   unsubscribed                                → désinscription.
 * Les ouvertures et les clics de Brevo (opened, click, proxy_open…) sont
 * ignorés : la plateforme les mesure elle-même (pixel et liens suivis), les
 * garder les compterait deux fois. Un même événement reçu deux fois (Brevo
 * réessaie) n'est inscrit qu'une fois.
 *
 * À régler chez Brevo (Transactionnel › Webhooks) : l'adresse de cette route
 * sur l'app externe, les événements ci-dessus, et le secret.
 */

const TYPES: Record<string, EvenementBrevo["type"]> = {
  delivered: "delivre",
  hard_bounce: "rebond",
  soft_bounce: "rebond",
  invalid_email: "rebond",
  blocked: "rebond",
  error: "rebond",
  spam: "plainte",
  complaint: "plainte",
  unsubscribed: "desinscription",
};

function egal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function autorise(req: Request, secret: string): boolean {
  const a = req.headers.get("authorization") ?? "";
  if (a.startsWith("Bearer ")) return egal(a.slice(7).trim(), secret);
  if (a.startsWith("Basic ")) {
    const [, motDePasse = ""] = Buffer.from(a.slice(6).trim(), "base64").toString("utf8").split(":");
    return egal(motDePasse, secret);
  }
  return false;
}

export async function POST(req: Request) {
  const secret = process.env.BREVO_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Introuvable.", { status: 404 });
  if (!autorise(req, secret)) return new Response("Non autorisé.", { status: 401 });

  let corps: unknown;
  try {
    corps = JSON.parse((await req.text()).slice(0, 200_000));
  } catch {
    return Response.json({ erreur: "Corps illisible." }, { status: 400 });
  }
  const liste = (Array.isArray(corps) ? corps : [corps]).slice(0, 500) as Record<string, unknown>[];
  const evenements: EvenementBrevo[] = [];
  for (const e of liste) {
    const type = TYPES[String(e?.event ?? "")];
    const messageId = String(e?.["message-id"] ?? e?.messageId ?? "").trim();
    if (!type || !messageId) continue;
    const ts = Number(e.ts_event ?? e.ts ?? 0);
    evenements.push({
      type,
      messageId,
      genre: String(e.event),
      raison: e.reason ? String(e.reason).slice(0, 300) : null,
      quand: ts > 0 ? new Date(ts * 1000).toISOString() : null,
      cle: `brevo:${String(e.event)}:${ts || String(e.date ?? "")}:${messageId}`.slice(0, 300),
    });
  }
  try {
    const n = evenements.length ? await noterBrevo(evenements) : 0;
    return Response.json({ recus: liste.length, inscrits: n });
  } catch (e) {
    // 5xx : Brevo réessaiera plus tard.
    console.error("Webhook Brevo : événements non inscrits", e instanceof Error ? e.message : e);
    return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  }
}
