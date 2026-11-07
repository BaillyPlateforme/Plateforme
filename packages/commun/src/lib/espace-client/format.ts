/*
 * Formats français de l'espace client, repris de la v0. Purs : ils servent
 * aussi bien au serveur qu'au navigateur.
 *
 * Toutes les dates s'expriment à l'heure de Paris. Une date seule
 * (AAAA-MM-JJ) est lue à midi : lue à minuit, elle reculait d'un jour sur
 * un serveur réglé en UTC.
 */

const TZ = "Europe/Paris";

export function parseDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
}

/** « 14 octobre 2026 » */
export function dateLongue(iso: string) {
  return parseDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

/** « 14/10/2026 » */
export function dateCourte(iso: string) {
  return parseDate(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
}

/** « 14 octobre » */
export function jourMois(iso: string) {
  return parseDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: TZ });
}

/** « samedi 21 novembre » */
export function jourLong(iso: string) {
  return parseDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}

/** « 14/10/2026 à 18 h 22 » */
export function dateHeure(iso: string) {
  const d = parseDate(iso);
  const jour = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", " h ");
  return `${jour} à ${heure}`;
}

/** « 9 h 30 » à partir de « 09:30 ». */
export function heure(hhmm: string) {
  const [h, m] = hhmm.split(":");
  return `${Number(h)} h ${m}`;
}

/** « du 14 au 15 octobre 2026 », « le 12 octobre 2026 », « du 16 novembre au 18 décembre 2026 ». */
export function periode(debut: string, fin: string) {
  if (debut === fin) return `le ${dateLongue(debut)}`;
  const a = parseDate(debut);
  const b = parseDate(fin);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `du ${a.getDate() === 1 ? "1er" : a.getDate()} au ${dateLongue(fin)}`;
  }
  if (a.getFullYear() === b.getFullYear()) return `du ${jourMois(debut)} au ${dateLongue(fin)}`;
  return `du ${dateLongue(debut)} au ${dateLongue(fin)}`;
}

/** Le format de la page de garde du modèle : « du 12/11/2026 au 13/11/2026 ». */
export function periodeCompacte(debut: string, fin: string) {
  return debut === fin ? `le ${dateCourte(debut)}` : `du ${dateCourte(debut)} au ${dateCourte(fin)}`;
}

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eurRond = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Au centime près : factures, paiements. */
export function euros(n: number) {
  return eur.format(n);
}

/** À l'euro, sans décimales quand il n'y en a pas : les grands chiffres d'affichage. */
export function eurosAffiches(n: number) {
  return Number.isInteger(n) ? eurRond.format(n) : eur.format(n);
}

export function taille(octets: number) {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/** Jours entiers entre aujourd'hui et une date, au calendrier de Paris. */
export function joursRestants(iso: string, now = new Date()) {
  const jour = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const a = Date.parse(`${jour(parseDate(iso))}T12:00:00Z`);
  const b = Date.parse(`${jour(now)}T12:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/** Déposé il y a moins de quinze jours : la pastille « NOUVEAU ». */
export function estRecent(iso: string, jours = 14, now = Date.now()) {
  return Date.parse(iso) > now - jours * 86_400_000;
}

/** Aujourd'hui, à Paris, au format AAAA-MM-JJ. */
export function aujourdhui(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

export const PAYS: Record<string, string> = {
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  LU: "Luxembourg",
  ES: "Espagne",
  PT: "Portugal",
  IT: "Italie",
  DE: "Allemagne",
  GB: "Royaume-Uni",
  IE: "Irlande",
  NL: "Pays-Bas",
  CA: "Canada",
  US: "États-Unis",
  MA: "Maroc",
  TN: "Tunisie",
  AE: "Émirats arabes unis",
  SG: "Singapour",
  AU: "Australie",
};

export function nomPays(code: string | null) {
  if (!code) return "Toutes destinations";
  return PAYS[code] ?? code;
}

/** Préposition devant une ville : « à Lyon », « au Havre », « aux Sables-d'Olonne ». */
export function aVille(ville: string) {
  if (/^Le /.test(ville)) return `au ${ville.slice(3)}`;
  if (/^Les /.test(ville)) return `aux ${ville.slice(4)}`;
  return `à ${ville}`;
}

/** « Madame Claire DUMONT » */
export function nomClient(c: { civilite: string | null; prenom: string; nom: string }) {
  return [c.civilite, c.prenom, c.nom.toUpperCase()].filter(Boolean).join(" ");
}

/** « Madame Dumont », ou le prénom et le nom quand la civilité manque. */
export function salutation(c: { civilite: string | null; prenom: string; nom: string }) {
  return c.civilite ? `${c.civilite} ${c.nom}` : `${c.prenom} ${c.nom}`;
}

export function pluriel(n: number, mot: string, motPluriel = `${mot}s`) {
  return `${n} ${n > 1 ? motPluriel : mot}`;
}
