import "server-only";
import { normaliserTelephone } from "./garde-fous";

/*
 * Le transport : les deux appels à l'API de Brevo, et rien d'autre. Ils ne
 * se font QUE depuis le module d'envoi (index.ts), une fois les garde-fous
 * passés et le message inscrit au journal : aucun autre fichier de la
 * plateforme ne parle à Brevo pour envoyer.
 *
 * Une réponse de Brevo se range en trois cas :
 *   - acceptée : son identifiant (messageId) va au journal ;
 *   - refusée (4xx) : rien n'est parti, le message peut être retenté ;
 *   - incertaine (réseau coupé, délai dépassé, 5xx) : Brevo a peut-être
 *     accepté. On ne retente pas tout seul, pour ne jamais envoyer deux fois.
 */

const BREVO = "https://api.brevo.com/v3";
const DELAI_MS = 15_000;

export type ReponseBrevo = { ok: true; id: string | null } | { ok: false; definitif: boolean; message: string };

const cleBrevo = () => process.env.BREVO_API_KEY ?? "";
export const brevoConfigure = () => !!cleBrevo();

async function poster(chemin: string, corps: unknown, entetes: Record<string, string> = {}): Promise<ReponseBrevo> {
  let res: Response;
  try {
    res = await fetch(`${BREVO}${chemin}`, {
      method: "POST",
      headers: { "api-key": cleBrevo(), "Content-Type": "application/json", accept: "application/json", ...entetes },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    return { ok: false, definitif: false, message: `Brevo injoignable : ${e instanceof Error ? e.message : "erreur réseau"}` };
  }
  const texte = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, definitif: res.status >= 400 && res.status < 500, message: `Brevo ${res.status} : ${texte.slice(0, 300)}` };
  try {
    const json = JSON.parse(texte) as { messageId?: string | number; messageIds?: string[]; reference?: string };
    const id = json.messageId ?? json.messageIds?.[0] ?? json.reference ?? null;
    return { ok: true, id: id == null ? null : String(id) };
  } catch {
    return { ok: true, id: null };
  }
}

export interface EmailBrevo {
  a: string;
  sujet: string;
  html: string;
  texte?: string;
  expediteur: { nom: string; email: string };
  repondreA?: string | null;
  piecesJointes?: { nom: string; base64: string }[];
  bacASable: boolean;
}

/**
 * POST /smtp/email. En bac à sable, l'en-tête X-Sib-Sandbox: drop est posé
 * là où la documentation de Brevo le demande (l'objet `headers` du corps) ET
 * en en-tête HTTP : un forum de Brevo rapporte des e-mails délivrés malgré
 * l'en-tête dans le corps seul.
 */
export function posterEmail(m: EmailBrevo): Promise<ReponseBrevo> {
  const sable = m.bacASable ? { "X-Sib-Sandbox": "drop" } : undefined;
  return poster(
    "/smtp/email",
    {
      sender: { name: m.expediteur.nom, email: m.expediteur.email },
      to: [{ email: m.a }],
      subject: m.sujet,
      htmlContent: m.html,
      ...(m.texte ? { textContent: m.texte } : {}),
      ...(m.repondreA ? { replyTo: { email: m.repondreA } } : {}),
      ...(m.piecesJointes?.length ? { attachment: m.piecesJointes.map((p) => ({ name: p.nom, content: p.base64 })) } : {}),
      ...(sable ? { headers: sable } : {}),
    },
    sable,
  );
}

/** POST /transactionalSMS/sms. Jamais appelé en bac à sable : Brevo n'en a pas pour les SMS. */
export function posterSms(m: { a: string; texte: string; expediteur?: string | null }): Promise<ReponseBrevo> {
  return poster("/transactionalSMS/sms", {
    type: "transactional",
    unicodeEnabled: true,
    // L'expéditeur d'un SMS : 11 caractères alphanumériques au plus.
    sender: (m.expediteur || "Bailly").replace(/[^a-zA-Z0-9]/g, "").slice(0, 11) || "Bailly",
    recipient: normaliserTelephone(m.a),
    content: m.texte,
  });
}
