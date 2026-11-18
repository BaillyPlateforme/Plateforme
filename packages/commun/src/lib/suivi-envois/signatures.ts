import { createHmac, createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";

/*
 * La vérification des signatures des webhooks de Twilio : rien n'est lu
 * d'une requête qui ne prouve pas venir de lui. Pur (node:crypto seulement) :
 * il se teste avec des clés tirées dans le test.
 *
 * SendGrid (Event Webhook signé) — ECDSA P-256 sur SHA-256 :
 *   en-têtes X-Twilio-Email-Event-Webhook-Signature (la signature, DER en
 *   base64) et X-Twilio-Email-Event-Webhook-Timestamp ; le message signé est
 *   l'horodatage suivi du corps BRUT, octet pour octet (un corps relu puis
 *   réécrit en JSON ne se vérifie plus). La clé publique est celle que
 *   SendGrid affiche (« Verification Key ») : une clé SPKI en base64 — ou la
 *   même au format PEM.
 *
 * Twilio (rappel d'état d'un SMS) — HMAC-SHA1 du jeton du compte, en base64,
 * dans l'en-tête X-Twilio-Signature : le message signé est l'adresse COMPLÈTE
 * que Twilio a appelée (avec sa requête « ?e=… »), suivie des paramètres du
 * formulaire triés par nom, chaque nom collé à sa valeur. L'adresse doit être
 * exactement celle de Twilio : derrière le proxy de Railway, le serveur se
 * voit appelé en http sur une adresse interne ; la route essaie donc les
 * adresses possibles (adressesCandidates).
 */

/** La clé publique de SendGrid, en base64 (SPKI) ou en PEM ; null si elle ne se lit pas. */
export function clePubliqueSendgrid(brute: string): KeyObject | null {
  try {
    const v = brute.trim().replace(/\\n/g, "\n");
    if (v.includes("BEGIN PUBLIC KEY")) return createPublicKey(v);
    return createPublicKey({ key: Buffer.from(v.replace(/\s+/g, ""), "base64"), format: "der", type: "spki" });
  } catch {
    return null;
  }
}

/** La signature d'un envoi de l'Event Webhook de SendGrid est-elle bonne ? Ne lève jamais. */
export function signatureSendgridValide(clePublique: string, horodatage: string, corps: Buffer | string, signature: string): boolean {
  const cle = clePubliqueSendgrid(clePublique);
  if (!cle || !horodatage || !signature) return false;
  try {
    const donnees = Buffer.concat([Buffer.from(horodatage, "utf8"), Buffer.isBuffer(corps) ? corps : Buffer.from(corps, "utf8")]);
    return verify("sha256", donnees, cle, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/** La signature que Twilio poserait sur cette adresse et ce formulaire. */
export function signatureTwilio(jeton: string, adresse: string, parametres: [string, string][]): string {
  const tries = [...parametres].sort(([a, va], [b, vb]) => (a < b ? -1 : a > b ? 1 : va < vb ? -1 : va > vb ? 1 : 0));
  return createHmac("sha1", jeton)
    .update(Buffer.from(adresse + tries.map(([k, v]) => k + v).join(""), "utf8"))
    .digest("base64");
}

/** L'adresse avec et sans son port par défaut (:443, :80) : Twilio signe l'une ou l'autre selon la façon dont elle a été donnée. */
function avecEtSansPort(adresse: string): string[] {
  try {
    const u = new URL(adresse);
    const defaut = u.protocol === "https:" ? "443" : "80";
    const sans = new URL(adresse);
    sans.port = "";
    const avec = `${u.protocol}//${u.hostname}:${u.port || defaut}${u.pathname}${u.search}`;
    return [adresse, sans.toString(), avec];
  } catch {
    return [adresse];
  }
}

/** La signature d'un rappel de Twilio est-elle bonne pour l'une des adresses possibles ? Comparaison à temps constant. */
export function signatureTwilioValide(jeton: string, adresses: string[], parametres: [string, string][], signature: string): boolean {
  if (!jeton || !signature) return false;
  const recue = Buffer.from(signature);
  const vues = new Set<string>();
  for (const a of adresses.flatMap(avecEtSansPort)) {
    if (vues.has(a)) continue;
    vues.add(a);
    const attendue = Buffer.from(signatureTwilio(jeton, a, parametres));
    if (attendue.length === recue.length && timingSafeEqual(attendue, recue)) return true;
  }
  return false;
}

/**
 * Les adresses sous lesquelles Twilio a pu appeler la route, de la plus sûre
 * à la moins sûre :
 *   1. l'adresse publique réglée (SUIVI_URL, ESPACE_CLIENT_URL ou
 *      NEXT_PUBLIC_URL_EXTERNE) — celle que la plateforme donne à Twilio
 *      dans StatusCallback ;
 *   2. celle que disent les en-têtes du proxy (X-Forwarded-Proto et
 *      X-Forwarded-Host, ou Host) : Railway termine le https et transmet en
 *      http ;
 *   3. celle que voit le serveur.
 * Chemin et requête sont toujours ceux de la requête reçue. Essayer plusieurs
 * adresses n'affaiblit rien : sans le jeton, aucune ne se signe.
 */
export function adressesCandidates(req: Request, base: string | null): string[] {
  const u = new URL(req.url);
  const suite = `${u.pathname}${u.search}`;
  const premier = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const proto = premier(req.headers.get("x-forwarded-proto"));
  const hote = premier(req.headers.get("x-forwarded-host")) ?? premier(req.headers.get("host"));
  const liste = [base ? `${base.replace(/\/$/, "")}${suite}` : null, proto && hote ? `${proto}://${hote}${suite}` : null, hote ? `https://${hote}${suite}` : null, u.toString()];
  return [...new Set(liste.filter((x): x is string => !!x))];
}
