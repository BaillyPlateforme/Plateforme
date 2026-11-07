import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cle } from "./config";

/*
 * Signatures HMAC-SHA256 : cookie de session, liens de fichiers à durée
 * courte, événements du paiement simulé. Chaque usage a sa propre clé
 * (config.ts) : une signature valable pour l'un ne vaut rien pour l'autre.
 */

export function signer(valeur: string, usage: string): string {
  return createHmac("sha256", cle(usage)).update(valeur).digest("base64url");
}

export function verifier(valeur: string, signature: string, usage: string): boolean {
  const attendue = Buffer.from(signer(valeur, usage));
  const recue = Buffer.from(signature);
  return attendue.length === recue.length && timingSafeEqual(attendue, recue);
}

/** Un objet signé et daté : `corps.signature`. */
export function sceller(contenu: { exp: number } & Record<string, unknown>, usage: string): string {
  const corps = Buffer.from(JSON.stringify(contenu)).toString("base64url");
  return `${corps}.${signer(corps, usage)}`;
}

export function desceller<T extends { exp: number }>(jeton: string | undefined, usage: string): T | null {
  if (!jeton) return null;
  const [corps, sig] = jeton.split(".");
  if (!corps || !sig || !verifier(corps, sig, usage)) return null;
  try {
    const contenu = JSON.parse(Buffer.from(corps, "base64url").toString()) as T;
    return contenu.exp > Date.now() ? contenu : null;
  } catch {
    return null;
  }
}

/** Un jeton aléatoire de 256 bits, lisible dans une URL. */
export const jetonAleatoire = () => randomBytes(32).toString("base64url");

/** L'empreinte qu'on conserve à la place du jeton. */
export const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");
