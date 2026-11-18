import { adresseSuivi, noterEvenementsFournisseur } from "@/lib/suivi-envois";
import { adressesCandidates, signatureTwilioValide } from "@/lib/suivi-envois/signatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le rappel d'état des SMS de Twilio (StatusCallback) : POST /api/suivi/twilio?e=<ligne du journal>.
 *
 * Chaque SMS envoyé par Twilio porte cette adresse (envois/twilio.ts) ; Twilio
 * l'appelle à chaque changement d'état du message. INACTIVE tant que
 * TWILIO_AUTH_TOKEN n'est pas réglé : 404. Ensuite, chaque appel doit porter
 * la signature de Twilio (X-Twilio-Signature, HMAC-SHA1 du jeton du compte,
 * lib/suivi-envois/signatures.ts) :
 *   - sans signature : 401 ;
 *   - mal signée : 403.
 * Dans les deux cas, rien n'est écrit.
 *
 * La signature porte sur l'adresse EXACTE que Twilio a appelée. Derrière le
 * proxy de Railway, le serveur se voit appelé en http, parfois sur une
 * adresse interne : la route essaie l'adresse publique réglée (celle-là même
 * qui a été donnée à Twilio), puis celle des en-têtes du proxy.
 *
 * Ce que Twilio est seul à savoir, et que la plateforme garde
 * (public.envois_evenements, rattaché à la ligne du journal par « e », sinon
 * par l'identifiant du message, MessageSid) :
 *   delivered            → délivré ;
 *   undelivered, failed  → non délivré (rebond), avec le code d'erreur de Twilio.
 * Les étapes (accepted, queued, sending, sent…) sont ignorées. Un même état
 * reçu deux fois n'est inscrit qu'une fois.
 *
 * Rien à déclarer chez Twilio : l'adresse part avec chaque message. Un rappel
 * réglé sur un service de messagerie (Messaging Service › Status callback),
 * sans « e », est accepté aussi : le rattachement se fait alors par MessageSid.
 */

const TYPES: Record<string, "delivre" | "rebond"> = {
  delivered: "delivre",
  undelivered: "rebond",
  failed: "rebond",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un rappel d'état tient en quelques centaines d'octets. */
const CORPS_MAX = 20_000;

export async function POST(req: Request) {
  const jeton = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!jeton) return new Response("Introuvable.", { status: 404 });

  const signature = req.headers.get("x-twilio-signature")?.trim();
  if (!signature) return new Response("Non autorisé.", { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > CORPS_MAX) return new Response("Trop volumineux.", { status: 413 });
  const brut = await req.text();
  if (brut.length > CORPS_MAX) return new Response("Trop volumineux.", { status: 413 });

  // Un formulaire (application/x-www-form-urlencoded) : les valeurs décodées entrent dans la signature.
  const parametres = [...new URLSearchParams(brut)];
  if (!signatureTwilioValide(jeton, adressesCandidates(req, adresseSuivi()), parametres, signature)) {
    return new Response("Signature invalide.", { status: 403 });
  }

  const p = new Map(parametres);
  // Signé du bon jeton mais d'un autre compte (un sous-compte) : rien qui nous concerne.
  const compte = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (compte && p.get("AccountSid") && p.get("AccountSid") !== compte) return Response.json({ inscrits: 0 });

  const statut = String(p.get("MessageStatus") ?? p.get("SmsStatus") ?? "").toLowerCase();
  const type = TYPES[statut];
  const sid = String(p.get("MessageSid") ?? p.get("SmsSid") ?? "").trim();
  const e = new URL(req.url).searchParams.get("e");
  const envoiId = e && UUID.test(e) ? e : null;
  if (!type || (!sid && !envoiId)) return Response.json({ inscrits: 0 });

  const code = p.get("ErrorCode")?.trim();
  const message = p.get("ErrorMessage")?.trim();
  try {
    const n = await noterEvenementsFournisseur("twilio", [
      {
        type,
        envoiId,
        messageIds: sid ? [sid] : [],
        genre: statut,
        raison: code ? `Erreur Twilio ${code}${message ? ` : ${message}` : ""}`.slice(0, 300) : null,
        quand: null,
        cle: `twilio:${statut}:${sid || envoiId}`.slice(0, 300),
      },
    ]);
    return Response.json({ inscrits: n });
  } catch (err) {
    // 5xx : l'état est perdu pour ce message (Twilio ne rappelle pas), sans rien casser d'autre.
    console.error("Rappel Twilio : état non inscrit", err instanceof Error ? err.message : err);
    return Response.json({ erreur: "Base indisponible." }, { status: 503 });
  }
}
