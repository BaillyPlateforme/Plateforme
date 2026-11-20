/*
 * Les règles du mot de passe d'un compte de l'équipe, et la forme du lien qui
 * permet de le choisir. Sans effet de bord : ce fichier se teste seul.
 *
 * Le mot de passe n'est plus transmis par e-mail (David, 20/11/2026) : chacun
 * le choisit lui-même, par un lien à usage unique (lien-mot-de-passe.ts).
 */

/** 10 caractères au moins : un compte de l'équipe ouvre les vraies données des clients. */
export const LONGUEUR_MIN = 10;
/** La limite de Supabase Auth (bcrypt ne lit pas au-delà de 72 octets). */
export const LONGUEUR_MAX = 72;

/** La durée de validité du lien, celle de Supabase Auth (« Email OTP expiration », une heure par défaut). */
export const DUREE_LIEN_MIN = 60;

/** Le jeton d'un lien de Supabase (hashed_token, hexadécimal) : rien d'autre n'est lu. */
export const FORME_JETON = /^[A-Za-z0-9_-]{20,200}$/;

export const jetonValide = (jeton: unknown): jeton is string => typeof jeton === "string" && FORME_JETON.test(jeton);

const octets = (s: string) => new TextEncoder().encode(s).length;

/**
 * Le refus d'un nouveau mot de passe, ou null s'il convient. Vérifié avant le
 * jeton, qui seul dit à quel compte il est destiné : une règle sur l'adresse
 * brûlerait le lien après coup, il n'y en a donc pas.
 */
export function refusMotDePasse(nouveau: string, confirmation: string): string | null {
  if (nouveau !== confirmation) return "Les deux saisies ne sont pas identiques.";
  if (nouveau.length < LONGUEUR_MIN) return `Le mot de passe doit faire au moins ${LONGUEUR_MIN} caractères.`;
  if (octets(nouveau) > LONGUEUR_MAX) return `Le mot de passe ne doit pas dépasser ${LONGUEUR_MAX} caractères.`;
  if (!nouveau.trim()) return "Le mot de passe ne peut pas être fait que d'espaces.";
  if (new Set(nouveau).size < 4) return "Le mot de passe est trop répétitif : variez les caractères.";
  return null;
}
