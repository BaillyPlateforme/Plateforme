import { noterEvenementsFournisseur, type EvenementFournisseur } from "@/lib/suivi-envois";
import { signatureSendgridValide } from "@/lib/suivi-envois/signatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * L'Event Webhook signé de Twilio SendGrid : POST /api/suivi/sendgrid.
 *
 * INACTIF tant que SENDGRID_WEBHOOK_CLE_PUBLIQUE n'est pas réglée : la route
 * répond alors 404, comme si elle n'existait pas. Une fois réglée (la
 * « Verification Key » que SendGrid affiche quand on active la signature),
 * chaque envoi doit porter sa signature ECDSA (lib/suivi-envois/signatures.ts) :
 *   - sans les en-têtes de signature : 401 ;
 *   - mal signé (ou signé d'une autre clé, ou corps retouché) : 403.
 * Dans les deux cas, rien n'est lu ni écrit.
 *
 * Ce que SendGrid est seul à savoir, et que la plateforme garde
 * (public.envois_evenements, rattaché à la ligne du journal par l'identifiant
 * qu'elle a posé à l'envoi — custom_args.envoi_id —, sinon par l'identifiant du
 * message, sg_message_id, dont le début est le X-Message-Id rendu à l'envoi) :
 *   delivered                     → délivré ;
 *   bounce, dropped               → rebond (le genre et la raison sont gardés) ;
 *   spamreport                    → plainte ;
 *   unsubscribe, group_unsubscribe → désinscription.
 * Le reste est ignoré : processed et deferred (étapes, pas des issues), open
 * et click (la plateforme mesure elle-même les ouvertures et les clics ; le
 * suivi de SendGrid est d'ailleurs coupé à l'envoi). Un même événement reçu
 * deux fois (SendGrid réessaie pendant 24 heures) n'est inscrit qu'une fois :
 * sa clé est son sg_event_id. C'est aussi ce qui rend sans effet le rejeu
 * d'un envoi signé intercepté : l'horodatage n'est donc pas borné, pour ne
 * pas perdre un nouvel essai de SendGrid.
 *
 * À régler chez SendGrid (Settings › Mail Settings › Event Webhook) :
 * l'adresse de cette route sur l'app externe, les événements ci-dessus, et
 * « Signed Event Webhook » activé — sa clé publique dans
 * SENDGRID_WEBHOOK_CLE_PUBLIQUE.
 */

const TYPES: Record<string, EvenementFournisseur["type"]> = {
  delivered: "delivre",
  bounce: "rebond",
  dropped: "rebond",
  spamreport: "plainte",
  unsubscribe: "desinscription",
  group_unsubscribe: "desinscription",
};

/** SendGrid envoie ses événements par paquets (quelques centaines de Ko au plus). */
const CORPS_MAX = 2_000_000;

/** « W86E….filterdrecv-…-1-….0 » → [« W86E… », « W86E….filterdrecv-… », …] : le X-Message-Id rendu à l'envoi est l'un de ces débuts. */
function debutsDe(sgMessageId: string): string[] {
  const morceaux = sgMessageId.split(".");
  return morceaux.map((_, i) => morceaux.slice(0, i + 1).join(".")).slice(0, 10);
}

export async function POST(req: Request) {
  const cle = process.env.SENDGRID_WEBHOOK_CLE_PUBLIQUE?.trim();
  if (!cle) return new Response("Introuvable.", { status: 404 });

  const signature = req.headers.get("x-twilio-email-event-webhook-signature")?.trim();
  const horodatage = req.headers.get("x-twilio-email-event-webhook-timestamp")?.trim();
  if (!signature || !horodatage) return new Response("Non autorisé.", { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > CORPS_MAX) return new Response("Trop volumineux.", { status: 413 });

  // Le corps BRUT : la signature porte sur ses octets exacts.
  const brut = Buffer.from(await req.arrayBuffer());
  if (brut.length > CORPS_MAX) return new Response("Trop volumineux.", { status: 413 });
  if (!signatureSendgridValide(cle, horodatage, brut, signature)) return new Response("Signature invalide.", { status: 403 });

  let corps: unknown;
  try {
    corps = JSON.parse(brut.toString("utf8"));
  } catch {
    return Response.json({ erreur: "Corps illisible." }, { status: 400 });
  }
  const liste = (Array.isArray(corps) ? corps : [corps]).slice(0, 2000) as Record<string, unknown>[];
  const evenements: EvenementFournisseur[] = [];
  for (const e of liste) {
    const genre = String(e?.event ?? "");
    const type = TYPES[genre];
    const sgId = String(e?.sg_message_id ?? "").trim();
    const envoiId = typeof e?.envoi_id === "string" ? e.envoi_id : null;
    if (!type || (!sgId && !envoiId)) continue;
    const ts = Number(e.timestamp ?? 0);
    // Un rebond : son type (bounce ou blocked), sinon le nom de l'événement ; un abandon (dropped) dit pourquoi dans « reason ».
    const precision = genre === "bounce" && typeof e.type === "string" && e.type ? e.type : genre;
    evenements.push({
      type,
      envoiId,
      messageIds: sgId ? debutsDe(sgId) : [],
      genre: precision,
      raison: e.reason ? String(e.reason).slice(0, 300) : null,
      quand: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
      cle: `sendgrid:${e.sg_event_id ? String(e.sg_event_id) : `${genre}:${ts}:${sgId}`}`.slice(0, 300),
    });
  }
  try {
    const n = evenements.length ? await noterEvenementsFournisseur("sendgrid", evenements) : 0;
    return Response.json({ recus: liste.length, inscrits: n });
  } catch (e) {
    // 5xx : SendGrid réessaiera plus tard.
    console.error("Webhook SendGrid : événements non inscrits", e instanceof Error ? e.message : e);
    return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  }
}
