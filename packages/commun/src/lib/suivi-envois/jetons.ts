import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { cle } from "@/lib/espace-client/config";
import { desceller, sceller, signer } from "@/lib/espace-client/signature";

/*
 * Les jetons du suivi, tous signés par la clé du serveur (signature.ts, une
 * clé par usage : un jeton de suivi ne vaut rien ailleurs, ni l'inverse) :
 *
 *   - le jeton d'un e-mail, dans son pixel et ses liens : l'identifiant de
 *     la ligne du journal des envois, et sa signature HMAC. Sans la clé, on
 *     ne peut ni le deviner ni le fabriquer pour un autre e-mail. Il n'expire
 *     pas (un client rouvre un e-mail des semaines plus tard) : ce sont les
 *     lignes qui expirent, au bout de RETENTION_JOURS ;
 *   - le jeton de visite, que la page d'un dossier de l'espace client remet
 *     au navigateur : il prouve que la page a été servie à la session de ce
 *     client (et non à un aperçu de l'équipe), pour ce dossier ;
 *   - le cookie d'attribution, posé par un clic vers l'espace client : les
 *     pages vues ensuite sont rattachées à l'e-mail.
 *
 * Et le chiffrement des adresses des liens (AES-256-GCM) : un lien d'accès
 * à l'espace client ne se garde jamais en clair.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE_ENVOI = "suivi-envoi";

/** Les 128 premiers bits de la signature : assez pour ne rien deviner, court dans une adresse. */
const sig = (id: string) => signer(id.toLowerCase(), USAGE_ENVOI).slice(0, 22);

const versB64 = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url");
function depuisB64(b: string): string | null {
  const hex = Buffer.from(b, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Le jeton d'un e-mail suivi : l'identifiant de sa ligne au journal des envois, signé. */
export function jetonEnvoi(envoiId: string): string {
  if (!UUID.test(envoiId)) throw new Error("Identifiant d'envoi invalide.");
  return `${versB64(envoiId)}.${sig(envoiId)}`;
}

/** L'identifiant de l'envoi d'un jeton, s'il est authentique ; sinon null. */
export function lireJetonEnvoi(jeton: string | null | undefined): string | null {
  const [corps, s] = String(jeton ?? "").replace(/\.gif$/i, "").split(".");
  if (!corps || !s || corps.length > 30 || s.length !== 22) return null;
  const id = depuisB64(corps);
  if (!id) return null;
  const attendue = Buffer.from(sig(id));
  const recue = Buffer.from(s);
  return attendue.length === recue.length && timingSafeEqual(attendue, recue) ? id : null;
}

/* ─────────────── Les adresses des liens, chiffrées ─────────────── */

const cleLiens = () => cle("suivi-liens");

export function chiffrer(texte: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cleLiens(), iv);
  const corps = Buffer.concat([c.update(texte, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corps]).toString("base64url");
}

export function dechiffrer(b: string): string | null {
  try {
    const brut = Buffer.from(b, "base64url");
    const d = createDecipheriv("aes-256-gcm", cleLiens(), brut.subarray(0, 12));
    d.setAuthTag(brut.subarray(12, 28));
    return Buffer.concat([d.update(brut.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** L'empreinte d'une adresse IP : HMAC tronqué, jamais l'adresse. Sert seulement à distinguer deux appareils. */
export function empreinteIp(ip: string | null | undefined): string | null {
  const v = String(ip ?? "").split(",")[0].trim();
  return v ? signer(v, "suivi-ip").slice(0, 16) : null;
}

/* ─────────────── La visite du portail ─────────────── */

/** d : dossier de l'espace ; c : client ; r : référence ; k : dossier du CRM. */
export type JetonVisite = { d: string; c: string; r: string; k: number | null; exp: number };
const USAGE_VISITE = "suivi-visite";
export const DUREE_JETON_VISITE_MS = 12 * 3_600_000;

export const jetonVisite = (v: Omit<JetonVisite, "exp">) => sceller({ ...v, exp: Date.now() + DUREE_JETON_VISITE_MS }, USAGE_VISITE);
export const lireJetonVisite = (jeton: string | null | undefined) => desceller<JetonVisite>(jeton ?? undefined, USAGE_VISITE);

/** Le cookie posé par un clic vers l'espace client : l'e-mail d'où vient la visite. */
export const COOKIE_ATTRIBUTION = "bailly_suivi_clic";
const USAGE_ATTRIBUTION = "suivi-attribution";
export const jetonAttribution = (envoiId: string, dureeMs: number) => sceller({ e: envoiId, exp: Date.now() + dureeMs }, USAGE_ATTRIBUTION);
export const lireAttribution = (jeton: string | null | undefined) => desceller<{ e: string; exp: number }>(jeton ?? undefined, USAGE_ATTRIBUTION)?.e ?? null;
