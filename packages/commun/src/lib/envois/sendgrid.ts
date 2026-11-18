import "server-only";
import { sansSecret, type ReponseFournisseur } from "./fournisseurs";

/*
 * Le transport des e-mails par Twilio SendGrid (API v3, POST /v3/mail/send),
 * et rien d'autre. Il ne s'appelle QUE depuis le module d'envoi (index.ts),
 * une fois les garde-fous passés et le message inscrit au journal.
 *
 * Ce que la requête porte, et pourquoi :
 *   - un seul destinataire, dans une seule « personalization » ;
 *   - custom_args.envoi_id : l'identifiant de la ligne du journal. SendGrid le
 *     rend dans chaque événement de son webhook (délivré, rebond…) : la
 *     plateforme y retrouve sa ligne sans dépendre de l'identifiant rendu à
 *     l'envoi (api/suivi/sendgrid) ;
 *   - le suivi des ouvertures et des clics de SendGrid est COUPÉ : la
 *     plateforme suit elle-même (pixel et liens suivis, lib/suivi-envois) ;
 *     celui de SendGrid réécrirait une seconde fois nos liens et compterait
 *     les ouvertures deux fois. Le pied de désinscription aussi : ce sont des
 *     messages transactionnels ;
 *   - le texte brut avant le HTML : SendGrid l'exige dans cet ordre ;
 *   - le bac à sable (ENVOI_BAC_A_SABLE=1) : mail_settings.sandbox_mode —
 *     SendGrid valide la requête (réponse 200) et ne délivre rien.
 *
 * Accepté : réponse 202, l'identifiant du message dans l'en-tête X-Message-Id
 * (SendGrid le prolonge ensuite dans ses événements : « <id>.filter… »).
 *
 * SENDGRID_REGION=eu : un compte (ou sous-compte) dont les données restent en
 * Europe répond sur api.eu.sendgrid.com ; sinon api.sendgrid.com.
 */

const DELAI_MS = 15_000;

const cleSendgrid = () => process.env.SENDGRID_API_KEY?.trim() ?? "";
export const sendgridConfigure = () => !!cleSendgrid();
export const apiSendgrid = () => (process.env.SENDGRID_REGION?.trim().toLowerCase() === "eu" ? "https://api.eu.sendgrid.com" : "https://api.sendgrid.com");

export interface EmailSendgrid {
  a: string;
  sujet: string;
  html: string;
  texte?: string;
  expediteur: { nom: string; email: string };
  repondreA?: string | null;
  piecesJointes?: { nom: string; base64: string }[];
  bacASable: boolean;
  /** La ligne du journal (public.envois.id), rendue par le webhook de SendGrid. */
  envoiId?: string | null;
}

/** Le type d'une pièce jointe, d'après son extension (SendGrid s'en passe, les messageries l'affichent mieux). */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  ics: "text/calendar",
  xml: "application/xml",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const typeDe = (nom: string) => TYPES[nom.split(".").pop()?.toLowerCase() ?? ""];

/**
 * Le nom affiché de l'expéditeur : sur une seule ligne, sans « ; » ni « , »,
 * que SendGrid lit comme des séparateurs d'adresses.
 */
const nomPropre = (nom: string) => nom.replace(/[\r\n;,]+/g, " ").replace(/\s+/g, " ").trim();

/** Le corps de la requête, à part pour être vérifié tel quel par les tests. */
export function corpsSendgrid(m: EmailSendgrid) {
  const nom = nomPropre(m.expediteur.nom);
  return {
    personalizations: [{ to: [{ email: m.a }], ...(m.envoiId ? { custom_args: { envoi_id: m.envoiId } } : {}) }],
    from: { email: m.expediteur.email, ...(nom ? { name: nom } : {}) },
    ...(m.repondreA ? { reply_to: { email: m.repondreA } } : {}),
    subject: m.sujet,
    content: [...(m.texte ? [{ type: "text/plain", value: m.texte }] : []), { type: "text/html", value: m.html }],
    ...(m.piecesJointes?.length
      ? {
          attachments: m.piecesJointes.map((p) => {
            const type = typeDe(p.nom);
            return { content: p.base64, filename: p.nom, disposition: "attachment", ...(type ? { type } : {}) };
          }),
        }
      : {}),
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
      subscription_tracking: { enable: false },
    },
    ...(m.bacASable ? { mail_settings: { sandbox_mode: { enable: true } } } : {}),
  };
}

/** POST /v3/mail/send. */
export async function posterEmailSendgrid(m: EmailSendgrid): Promise<ReponseFournisseur> {
  const cle = cleSendgrid();
  let res: Response;
  try {
    res = await fetch(`${apiSendgrid()}/v3/mail/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(corpsSendgrid(m)),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    return { ok: false, definitif: false, message: sansSecret(`SendGrid injoignable : ${e instanceof Error ? e.message : "erreur réseau"}`, [cle]) };
  }
  const texte = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, definitif: res.status >= 400 && res.status < 500, message: sansSecret(`SendGrid ${res.status} : ${texte.slice(0, 300)}`, [cle]) };
  }
  // 202 : accepté, l'identifiant dans l'en-tête. 200 : le bac à sable, rien n'est délivré et il n'y a pas d'identifiant.
  const id = res.headers?.get?.("x-message-id")?.trim();
  return { ok: true, id: id || null };
}
