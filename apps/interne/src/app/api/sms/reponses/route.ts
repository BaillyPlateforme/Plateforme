import { createHash, timingSafeEqual } from "node:crypto";
import { reponseSmsRecue } from "@/crm/rdv/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les réponses des clients aux SMS de rendez-vous (1 confirme, 2 annule),
 * envoyées par le webhook SMS de Brevo :
 *
 *   POST /api/sms/reponses?jeton=<SMS_REPONSES_SECRET>
 *   (ou Authorization: Bearer <SMS_REPONSES_SECRET>)
 *
 * Brevo ne signe pas ses webhooks : c'est le jeton, comparé à temps
 * constant, qui ouvre la route. Sans la variable, la route n'existe pas.
 *
 * Le format exact d'une réponse SMS chez Brevo n'est pas documenté
 * clairement (événement « replied », champ msg_status) : la route lit les
 * champs plausibles — le texte (reply, text, content, message, body) et le
 * numéro du client (from, sender, phone, number, to, recipient) — et ne
 * retient qu'un rendez-vous à venir dont le SMS est parti vers ce numéro.
 * Elle répond toujours 200 quand le jeton est bon, pour que Brevo ne rejoue
 * pas en boucle une réponse qu'on ne sait pas lire.
 *
 * Attention : un expéditeur alphanumérique (« Bailly ») ne peut pas recevoir
 * de réponse en France ; il faut un numéro d'envoi qui accepte les réponses,
 * à vérifier avec Brevo. Sans lui, la réponse se saisit sur le dossier.
 */

function egal(recu: string, attendu: string) {
  const a = createHash("sha256").update(recu).digest();
  const b = createHash("sha256").update(attendu).digest();
  return timingSafeEqual(a, b) && recu.length > 0;
}

const texteDe = (o: Record<string, unknown>) => ["reply", "text", "content", "message", "body"].map((k) => o[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
const numerosDe = (o: Record<string, unknown>) => ["from", "sender", "phone", "number", "to", "recipient"].map((k) => o[k]).filter((v): v is string => typeof v === "string" && /\d{6,}/.test(v));

export async function POST(req: Request) {
  const secret = process.env.SMS_REPONSES_SECRET?.trim();
  if (!secret) return new Response("Introuvable.", { status: 404 });
  const url = new URL(req.url);
  const recu = url.searchParams.get("jeton") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!egal(recu.trim(), secret)) return Response.json({ error: "Accès refusé." }, { status: 401 });

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return Response.json({ traitees: 0, raison: "corps illisible" });
  }
  const evenements = (Array.isArray(corps) ? corps : Array.isArray((corps as { items?: unknown[] })?.items) ? (corps as { items: unknown[] }).items : [corps]).filter(
    (e): e is Record<string, unknown> => !!e && typeof e === "object",
  );

  const issues: { rdv: number | null; reponse?: string; raison?: string }[] = [];
  for (const e of evenements) {
    const statut = String(e.msg_status ?? e.event ?? e.status ?? "").toLowerCase();
    const texte = texteDe(e);
    if (!texte || (statut && !/repl/.test(statut) && !/inbound|received|mo/.test(statut))) {
      issues.push({ rdv: null, raison: `événement ${statut || "sans statut"} sans réponse lisible` });
      continue;
    }
    let trouve = false;
    for (const numero of numerosDe(e)) {
      const r = await reponseSmsRecue(numero, texte);
      if (r.rdvId) {
        issues.push({ rdv: r.rdvId, reponse: r.reponse });
        trouve = true;
        break;
      }
      if ("raison" in r && r.raison === "réponse ni 1 ni 2") {
        issues.push({ rdv: null, raison: "réponse ni 1 ni 2" });
        trouve = true;
        break;
      }
    }
    if (!trouve) issues.push({ rdv: null, raison: "aucun rendez-vous à venir pour ce numéro" });
  }
  return Response.json({ traitees: issues.filter((i) => i.rdv).length, issues });
}
