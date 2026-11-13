import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Le secret partagé d'un appel de machine à machine (n8n, un webhook) :
 * « Authorization: Bearer <secret> », ou l'authentification HTTP simple avec
 * le secret en mot de passe. Comparé en temps constant, sur les empreintes
 * pour ne rien révéler de sa longueur. Sans secret réglé, rien ne passe.
 */
export function secretPresente(req: Request, secret: string | null | undefined): boolean {
  const attendu = secret?.trim();
  if (!attendu) return false;
  const a = req.headers.get("authorization") ?? "";
  let fourni = "";
  if (a.startsWith("Bearer ")) fourni = a.slice(7).trim();
  else if (a.startsWith("Basic ")) fourni = Buffer.from(a.slice(6).trim(), "base64").toString("utf8").split(":").slice(1).join(":");
  if (!fourni) return false;
  const x = createHash("sha256").update(fourni).digest();
  const y = createHash("sha256").update(attendu).digest();
  return timingSafeEqual(x, y);
}
