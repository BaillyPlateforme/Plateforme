import "server-only";
import { adresseSuivi } from "@/lib/suivi-envois/adresse";
import { sansSecret, type ReponseFournisseur } from "./fournisseurs";
import { normaliserTelephone } from "./garde-fous";

/*
 * Le transport des SMS par Twilio Programmable Messaging
 * (POST /2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json), et rien
 * d'autre. Il ne s'appelle QUE depuis le module d'envoi (index.ts), une fois
 * les garde-fous passés et le message inscrit au journal.
 *
 * Authentification HTTP simple : l'identifiant du compte et son jeton
 * (TWILIO_AUTH_TOKEN). Corps en formulaire (application/x-www-form-urlencoded),
 * comme l'attend l'API de Twilio.
 *
 * L'expéditeur, dans cet ordre :
 *   1. celui de l'appelant — l'expéditeur des Paramètres (settings.sms_sender),
 *      que le CRM, les alertes et les rappels passent déjà, comme avec Brevo ;
 *   2. TWILIO_SMS_EXPEDITEUR : un nom alphanumérique (« Bailly ») ou un
 *      numéro (+33…) ;
 *   3. sinon, avec TWILIO_MESSAGING_SERVICE_SID, Twilio choisit lui-même dans
 *      le groupe d'expéditeurs du service ;
 *   4. sinon « Bailly ».
 * Le service de messagerie, s'il est réglé, part dans tous les cas
 * (MessagingServiceSid) : Twilio prend alors l'expéditeur donné dans le groupe
 * du service — il doit y figurer, à l'identique.
 * Un nom : 11 caractères alphanumériques au plus, au moins une lettre (Twilio
 * refuse un nom tout en chiffres). Un nom ne reçoit pas de réponse : pour que
 * les clients répondent « 1 » ou « 2 », il faut un numéro.
 *
 * Le rappel d'état (StatusCallback) : l'adresse publique de l'app externe,
 * /api/suivi/twilio?e=<ligne du journal>. Twilio y signale « délivré » ou
 * « non délivré », signé de son jeton. Seulement en https : une adresse
 * locale (http://localhost) ne lui servirait à rien.
 *
 * Accepté : réponse 201, l'identifiant du message (sid, « SM… ») au journal.
 * Pas de bac à sable pour les SMS : le module d'envoi ne l'appelle jamais en
 * bac à sable.
 */

const API = "https://api.twilio.com/2010-04-01";
const DELAI_MS = 15_000;

const sid = () => process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
const jeton = () => process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
export const twilioConfigure = () => !!sid() && !!jeton();

/** Un expéditeur lisible par Twilio : un numéro au format international, ou un nom alphanumérique. Null s'il n'en reste rien. */
export function expediteurTwilio(brut: string | null | undefined): string | null {
  const v = String(brut ?? "").trim();
  if (!v) return null;
  if (/^[+\d][\d\s.()-]{5,}$/.test(v)) {
    const n = normaliserTelephone(v);
    return n ? `+${n}` : null;
  }
  const nom = v.replace(/[^a-zA-Z0-9]/g, "").slice(0, 11);
  return /[a-zA-Z]/.test(nom) ? nom : null;
}

/** L'adresse du rappel d'état d'un SMS, ou null (pas d'adresse publique en https, ou pas de ligne). */
export function adresseRappelTwilio(envoiId: string | null | undefined): string | null {
  const base = adresseSuivi();
  if (!envoiId || !base || !/^https:\/\//i.test(base)) return null;
  return `${base}/api/suivi/twilio?e=${encodeURIComponent(envoiId)}`;
}

export interface SmsTwilio {
  a: string;
  texte: string;
  expediteur?: string | null;
  /** La ligne du journal (public.envois.id), portée par l'adresse du rappel d'état. */
  envoiId?: string | null;
}

/** Le formulaire de la requête, à part pour être vérifié tel quel par les tests. */
export function formulaireTwilio(m: SmsTwilio): URLSearchParams {
  const f = new URLSearchParams();
  f.set("To", `+${normaliserTelephone(m.a)}`);
  f.set("Body", m.texte);
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const de = expediteurTwilio(m.expediteur) ?? expediteurTwilio(process.env.TWILIO_SMS_EXPEDITEUR) ?? (service ? null : "Bailly");
  if (de) f.set("From", de);
  if (service) f.set("MessagingServiceSid", service);
  const rappel = adresseRappelTwilio(m.envoiId);
  if (rappel) f.set("StatusCallback", rappel);
  return f;
}

/** POST /Accounts/{SID}/Messages.json. */
export async function posterSmsTwilio(m: SmsTwilio): Promise<ReponseFournisseur> {
  const compte = sid();
  const secret = jeton();
  let res: Response;
  try {
    res = await fetch(`${API}/Accounts/${encodeURIComponent(compte)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${compte}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: formulaireTwilio(m).toString(),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    return { ok: false, definitif: false, message: sansSecret(`Twilio injoignable : ${e instanceof Error ? e.message : "erreur réseau"}`, [secret]) };
  }
  const texte = await res.text().catch(() => "");
  let json: { sid?: string; code?: number | string; message?: string } | null = null;
  try {
    json = JSON.parse(texte);
  } catch {
    json = null;
  }
  if (!res.ok) {
    // L'erreur de Twilio : son code (21211 : numéro invalide, 21408 : pays non autorisé, 20003 : authentification…) et son message.
    const detail = json?.message ? `${json.code ? `(${json.code}) ` : ""}${json.message}` : texte;
    return { ok: false, definitif: res.status >= 400 && res.status < 500, message: sansSecret(`Twilio ${res.status} : ${String(detail).slice(0, 300)}`, [secret]) };
  }
  return { ok: true, id: json?.sid ? String(json.sid) : null };
}
