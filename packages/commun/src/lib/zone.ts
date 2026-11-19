import { departementDuCodePostal, enFrance, territoireDuCodePostal } from "./trajet";

/*
 * La zone d'une demande (Céline, 19/11/2026) : « Le simulateur prend en
 * charge toutes les demandes dont les départements de départ ou d'arrivée
 * sont en Île-de-France. Pour les autres […] Demande envoyée ! Notre service
 * commercial traite votre demande et vous répond sous 48h ouvrées. »
 *
 * Module pur, partagé par le formulaire (l'écran) et le serveur (qui ne croit
 * pas l'écran sur parole : le prix ne part jamais au client hors zone).
 *
 * - Estimation en ligne : départ OU arrivée en Île-de-France, et les deux en
 *   France continentale. La Corse (traversée en ferry) n'a pas de prix en
 *   ligne tant que Bailly ne l'a pas décidé (question posée à Céline).
 * - Une adresse dont on ne connaît pas le code postal : pas de prix — on ne
 *   promet rien qu'on ne sait pas calculer.
 * - L'étiquette (mail à l'équipe, CRM) : la destination la plus lointaine du
 *   trajet — international, puis DOM-TOM, Corse, Île-de-France, France.
 */

export type Zone = "idf" | "france" | "corse" | "outre_mer" | "international";

export const LIBELLES_ZONE: Record<Zone, string> = {
  idf: "Île-de-France",
  france: "France hors Île-de-France",
  corse: "Corse",
  outre_mer: "DOM-TOM",
  international: "International",
};

const DEPARTEMENTS_IDF = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);

export type AdresseZone = { code_postal?: string | null; pays?: string | null };

/** La zone d'une adresse, ou null quand son code postal ne la dit pas. */
export function zoneAdresse(a: AdresseZone | null | undefined): Zone | null {
  if (!a) return null;
  if (!enFrance(a.pays)) return "international";
  const t = territoireDuCodePostal(a.code_postal);
  if (!t) return null;
  if (t !== "metropole") return "outre_mer";
  const dep = departementDuCodePostal(a.code_postal);
  if (dep === "20") return "corse";
  return dep && DEPARTEMENTS_IDF.has(dep) ? "idf" : "france";
}

const ORDRE: Zone[] = ["international", "outre_mer", "corse", "idf", "france"];

/** L'étiquette d'un trajet : sa destination la plus lointaine ; null si aucune adresse ne se situe. */
export function zoneDuTrajet(depart: AdresseZone | null | undefined, arrivee: AdresseZone | null | undefined): Zone | null {
  const z = [zoneAdresse(depart), zoneAdresse(arrivee)];
  return ORDRE.find((k) => z.includes(k)) ?? null;
}

const continentale = (z: Zone | null) => z === "idf" || z === "france";

/** L'estimation s'affiche-t-elle en ligne pour ce trajet ? */
export function estimationEnLigne(depart: AdresseZone | null | undefined, arrivee: AdresseZone | null | undefined): boolean {
  const zd = zoneAdresse(depart), za = zoneAdresse(arrivee);
  return continentale(zd) && continentale(za) && (zd === "idf" || za === "idf");
}

/** Le libellé de la destination d'une demande, pour le mail à l'équipe. */
export const libelleZone = (z: unknown) => (typeof z === "string" && z in LIBELLES_ZONE ? LIBELLES_ZONE[z as Zone] : "Non précisée");

/** La réponse promise quand rien ne s'affiche à l'écran (les mots de Céline, 19/11/2026). */
export const REPONSE_48H = "Notre service commercial traite votre demande et vous répond sous 48h ouvrées.";
/** Les horaires, partout où l'on annonce un rappel (Céline, 19/11/2026). */
export const HORAIRES_BUREAUX = "Pour toute question urgente, nos bureaux sont ouverts du lundi au vendredi, de 8h à 18h.";
