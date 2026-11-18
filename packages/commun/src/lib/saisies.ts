/*
 * Les règles d'une saisie du formulaire public, partagées par la page (qui
 * ferme le bouton et dit ce qui manque) et par le serveur (lib/schemas, qui
 * refuse la demande) : la même règle des deux côtés. Sans dépendance, pour
 * ne pas alourdir la page.
 */

/**
 * Un vrai numéro de téléphone : dix chiffres en France (06 12 34 56 78,
 * 06.12.34.56.78), ou un numéro international (+44 20 7946 0958, 0044…),
 * espaces, points, tirets et parenthèses permis. « 06 12 » passait : la fiche
 * Créagidem partait avec un numéro que personne ne pouvait appeler.
 */
export function telephoneValide(v: string): boolean {
  const t = v.trim();
  if (!/^\+?[\d\s.()/-]+$/.test(t)) return false;
  const chiffres = t.replace(/\D/g, "");
  if (t.startsWith("+")) return chiffres.length >= 8 && chiffres.length <= 15;
  if (chiffres.startsWith("00")) return chiffres.length >= 10 && chiffres.length <= 17;
  return chiffres.length === 10 && chiffres.startsWith("0");
}

export const MESSAGE_TELEPHONE = "Le numéro de téléphone n'est pas valide : indiquez ses dix chiffres (06 12 34 56 78), ou l'indicatif de son pays (+32…).";

/** Aujourd'hui à Paris, en AAAA-MM-JJ : les serveurs tournent en temps universel, les visiteurs à l'heure de Paris. */
export const aujourdhuiParis = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
