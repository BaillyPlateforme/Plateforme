import "server-only";
import { checkBrevo } from "@/lib/brevo";
import { choisirFournisseurs, fournisseursEnClair, NOM_FOURNISSEUR, sansSecret, type NomFournisseur } from "@/lib/envois/fournisseurs";
import { apiSendgrid } from "@/lib/envois/sendgrid";

/*
 * La connexion au fournisseur des envois, pour l'écran des Paramètres du CRM
 * (« Tester la connexion ») : celui qui transporte vraiment les e-mails et les
 * SMS aujourd'hui (envois/fournisseurs.ts) — SendGrid et Twilio, ou Brevo tant
 * que leurs accès manquent.
 *
 * Une lecture sans effet chez chacun, jamais un envoi :
 *   - SendGrid : GET /v3/scopes — la clé est-elle valide, et a-t-elle le
 *     droit d'envoyer (mail.send) ? Une clé restreinte à l'envoi y répond ;
 *   - Twilio : GET /2010-04-01/Accounts/{SID}.json — le compte est-il actif ?
 *   - Brevo : GET /account (lib/brevo.ts, à retirer après la bascule).
 *
 * Jamais une clé à l'écran : seulement le nom de la variable qui manque, et
 * l'erreur du fournisseur, expurgée de tout secret.
 *
 * L'appel sort chez le fournisseur (200 à 400 ms) à chaque ouverture des
 * Paramètres : la réponse est gardée une minute, comme pour Brevo.
 */

export interface ConnexionCanal {
  canal: "email" | "sms";
  fournisseur: NomFournisseur;
  ok: boolean;
  message: string;
}

export interface ConnexionEnvois {
  ok: boolean;
  /** « Connexion Twilio : SendGrid (e-mails) et Twilio (SMS) », « Connexion Brevo (e-mails et SMS) »… */
  titre: string;
  message: string;
  canaux: ConnexionCanal[];
}

type Etat = { ok: boolean; message: string };

const TTL = 60_000;
const coffre = globalThis as typeof globalThis & { __connexionEnvois?: Map<string, { a: number; v: Etat }> };

async function enCache(cle: string, lire: () => Promise<Etat & { garder?: boolean }>): Promise<Etat> {
  const cache = (coffre.__connexionEnvois ??= new Map());
  const deja = cache.get(cle);
  if (deja && Date.now() - deja.a < TTL) return deja.v;
  const { garder = true, ...v } = await lire();
  // Une panne réseau ne se garde pas : on réessaie au prochain affichage.
  if (garder) cache.set(cle, { a: Date.now(), v });
  return v;
}

async function lireReponse(res: Response) {
  return res.text().catch(() => "");
}

/** SendGrid : la clé est-elle valide, et peut-elle envoyer ? */
export function verifierSendgrid(): Promise<Etat> {
  const cle = process.env.SENDGRID_API_KEY?.trim();
  if (!cle) return Promise.resolve({ ok: false, message: "Aucune clé SendGrid configurée (SENDGRID_API_KEY)." });
  return enCache(`sendgrid:${apiSendgrid()}`, async () => {
    try {
      const res = await fetch(`${apiSendgrid()}/v3/scopes`, { headers: { Authorization: `Bearer ${cle}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      const texte = await lireReponse(res);
      if (!res.ok) return { ok: false, message: sansSecret(`SendGrid ${res.status} : ${texte.slice(0, 200)}`, [cle]) };
      let scopes: string[] = [];
      try {
        scopes = (JSON.parse(texte) as { scopes?: string[] }).scopes ?? [];
      } catch {
        scopes = [];
      }
      return scopes.includes("mail.send")
        ? { ok: true, message: "Connexion SendGrid active (clé autorisée à envoyer)." }
        : { ok: false, message: "La clé SendGrid est valide mais n'a pas le droit d'envoyer (autorisation « Mail Send »)." };
    } catch (e) {
      return { ok: false, garder: false, message: sansSecret(e instanceof Error ? e.message : "Erreur", [cle]) };
    }
  });
}

/** Twilio : le compte répond-il, et est-il actif ? */
export function verifierTwilio(): Promise<Etat> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const jeton = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !jeton) return Promise.resolve({ ok: false, message: "Accès Twilio incomplets (TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN)." });
  return enCache("twilio", async () => {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${jeton}`).toString("base64")}`, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const texte = await lireReponse(res);
      if (!res.ok) return { ok: false, message: sansSecret(`Twilio ${res.status} : ${texte.slice(0, 200)}`, [jeton]) };
      let statut = "";
      try {
        statut = String((JSON.parse(texte) as { status?: string }).status ?? "");
      } catch {
        statut = "";
      }
      if (statut && statut !== "active") return { ok: false, message: `Compte Twilio ${statut === "suspended" ? "suspendu" : statut === "closed" ? "fermé" : statut} : les SMS ne partiront pas.` };
      const expediteur = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()
        ? "service de messagerie réglé"
        : process.env.TWILIO_SMS_EXPEDITEUR?.trim()
          ? "expéditeur réglé"
          : "expéditeur des Paramètres";
      return { ok: true, message: `Connexion Twilio active (${expediteur}).` };
    } catch (e) {
      return { ok: false, garder: false, message: sansSecret(e instanceof Error ? e.message : "Erreur", [jeton]) };
    }
  });
}

const verifier = (f: NomFournisseur): Promise<Etat> => (f === "sendgrid" ? verifierSendgrid() : f === "twilio" ? verifierTwilio() : checkBrevo());

/** La connexion du fournisseur de chaque canal, telle que l'écran des Paramètres l'affiche. */
export async function verifierConnexionEnvois(): Promise<ConnexionEnvois> {
  const choix = choisirFournisseurs(process.env);
  if (choix.email === choix.sms) {
    // Brevo porte les deux canaux (avant la bascule) : un seul appel.
    const e = await verifier(choix.email);
    return {
      ok: e.ok,
      titre: `Connexion ${NOM_FOURNISSEUR[choix.email]} (e-mails et SMS)`,
      message: e.message,
      canaux: [
        { canal: "email", fournisseur: choix.email, ...e },
        { canal: "sms", fournisseur: choix.sms, ...e },
      ],
    };
  }
  const [email, sms] = await Promise.all([verifier(choix.email), verifier(choix.sms)]);
  const famille = choix.email === "sendgrid" && choix.sms === "twilio" ? "Twilio : " : "";
  return {
    ok: email.ok && sms.ok,
    titre: `Connexion ${famille}${fournisseursEnClair(choix)}`,
    message: `E-mails : ${email.message} SMS : ${sms.message}`,
    canaux: [
      { canal: "email", fournisseur: choix.email, ...email },
      { canal: "sms", fournisseur: choix.sms, ...sms },
    ],
  };
}
