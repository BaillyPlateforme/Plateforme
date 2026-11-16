import { volOiseauKm } from "@/lib/trajet";
import { instantParis, jourParis, minutesParis } from "@/lib/visite/regles";

/*
 * La géographie des visites (retours de Céline, 16/11/2026) : « Il faut que
 * la ville apparaisse sinon nous ne pouvons pas placer les visites
 * suivantes », et « proposer le RDV le plus cohérent par rapport aux visites
 * déjà programmées », avec, au survol d'une visite placée, la distance et le
 * temps moyen pour aller de là chez le client.
 *
 * Fonctions pures, sans réseau : les coordonnées viennent de la Base Adresse
 * Nationale, la distance par la route d'OSRM quand il répond (geo.ts).
 *
 * Pourquoi un calcul et pas un modèle de langage : placer une visite près
 * d'une autre, c'est insérer un point dans la tournée de la journée au
 * moindre détour, à des heures où le commercial est libre et a le temps de
 * rouler. Cela se calcule exactement ; un modèle de langage ne connaît ni les
 * adresses ni le planning, et pourrait proposer un créneau pris.
 *
 * Le temps est toujours une estimation (« ≈ ») : un temps moyen de
 * circulation en Île-de-France tiré de la distance par la route (25 km/h sur
 * les dix premiers kilomètres, en ville, 50 km/h au-delà, plus cinq minutes
 * pour se garer). La distance est celle de la route quand OSRM répond ; sinon
 * la distance à vol d'oiseau majorée d'un quart, comme l'estimation du prix
 * (lib/trajet.ts), affichée « ≈ ».
 */

export type Point = { lat: number; lon: number };

/** Un trajet : `estime` quand la distance est celle du vol d'oiseau corrigé, faute d'itinéraire. Le temps est toujours moyen. */
export type Trajet = { km: number; min: number; estime: boolean };

/** Une route n'est jamais droite : le vol d'oiseau majoré d'un quart (le même facteur que l'estimation du prix). */
export const FACTEUR_ROUTE = 1.25;

/* ───────── La ville d'une adresse ───────── */

/** « 75015 » → « Paris 15e », « 75001 » → « Paris 1er », « 75116 » → « Paris 16e » ; sinon null. */
function arrondissementDeParis(cp: string) {
  const m = /^75(?:0(\d\d)|1(16))$/.exec(cp);
  if (!m) return null;
  const n = Number(m[1] ?? m[2]);
  return n >= 1 && n <= 20 ? `Paris ${n === 1 ? "1er" : `${n}e`}` : null;
}

/** Ce qui n'est pas une ville : la visio, un lien, « Chez le client »… */
const PAS_UNE_VILLE = /^(visio|https?:|chez\b|domicile|bureau|agence|d[ée]p[ôo]t|t[ée]l[ée]phone)/i;

/** « 92100 Boulogne-Billancourt Cedex 2 » → « 92100 », « Boulogne-Billancourt ». */
function cpEtVille(t: string): { cp: string; ville: string } | null {
  const m = /(?:^|\s)(\d{5})\s+([^\d,]+?)(?:\s+cedex(?:\s*\d+)?)?\s*$/i.exec(t);
  return m ? { cp: m[1], ville: m[2].trim() } : null;
}

/**
 * La ville d'une adresse, telle qu'on l'écrit sur une enveloppe — pour Paris,
 * l'arrondissement, qui compte pour placer une visite :
 *   « 12 Rue de la Paix, 75002 Paris » → « Paris 2e » (l'écriture du CRM) ;
 *   « 3 allée des Tilleuls 78110 Le Vésinet » → « Le Vésinet » ;
 *   « Le Vésinet · 3 pièces » → « Le Vésinet » (un libellé court du planning) ;
 *   « Versailles » → « Versailles ».
 * Rien pour une visio, un lien, ou un texte qui n'a pas l'air d'une ville.
 */
export function villeDe(adresse: string | null | undefined): string | null {
  let t = (adresse ?? "").replace(/\s+/g, " ").trim();
  if (!t || PAS_UNE_VILLE.test(t)) return null;
  // Un libellé court du planning : la ville avant le point médian.
  if (t.includes(" · ")) t = t.split(" · ")[0].trim();
  const dernier = t.includes(",") ? t.slice(t.lastIndexOf(",") + 1).trim() : t;
  const cv = cpEtVille(dernier) ?? cpEtVille(t);
  if (cv) return arrondissementDeParis(cv.cp) ?? cv.ville;
  // Après une virgule et sans chiffre : « 12 rue X, Versailles ».
  if (t.includes(",") && dernier && !/\d/.test(dernier)) return dernier;
  // Un mot ou deux, sans numéro de rue : une ville seule (« Saint-Cloud », « Paris 15e »).
  if (!t.includes(",") && !/^\d/.test(t) && t.length <= 40 && !PAS_UNE_VILLE.test(t)) return t;
  return null;
}

/**
 * Une étape du trajet, telle que la base la rend : son adresse, et le code
 * postal et la ville de la fenêtre de visite quand ils sont saisis.
 */
export type EtapeLieu = { adresse: string | null; code_postal?: string | null; ville?: string | null } | null;

/** L'adresse complète d'une étape : l'adresse, et le code postal et la ville s'ils n'y sont pas déjà. */
function adresseEtape(e: NonNullable<EtapeLieu>) {
  const base = (e.adresse ?? "").trim();
  const cpVille = [e.code_postal, e.ville].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  if (!cpVille || base.toLowerCase().includes((e.ville ?? "").trim().toLowerCase())) return base || cpVille;
  return base ? `${base}, ${cpVille}` : cpVille;
}

/** La ville d'une étape : celle de la fenêtre de visite (avec l'arrondissement de Paris), sinon tirée de son adresse. */
function villeEtape(e: NonNullable<EtapeLieu>) {
  if (e.ville?.trim()) return villeDe(`${(e.code_postal ?? "").trim()} ${e.ville.trim()}`.trim()) ?? e.ville.trim();
  return villeDe(e.adresse);
}

/** Une adresse qu'un géocodeur peut situer : un code postal, une virgule, ou un numéro de rue. */
const resembleAdresse = (t: string) => /\b\d{5}\b/.test(t) || t.includes(",") || /^\d+\s*(bis|ter)?\s+\S/i.test(t);

/**
 * Où a lieu un rendez-vous, pour le situer (`adresse`, que la Base Adresse
 * géocode) et pour l'afficher (`ville`).
 *   - Une visite sur place : son lieu (l'adresse de la visite) ; l'étape du
 *     dossier qui porte la même adresse lui prête son code postal et sa
 *     ville ; un lieu qui n'est pas une adresse (« Le Vésinet · 3 pièces »)
 *     laisse la place à l'étape du dossier (le départ d'abord).
 *   - Une tâche : son lieu, s'il ressemble à une adresse ou à une ville.
 *   - Une visio, une règle perso : nulle part.
 */
export function lieuDuRdv(r: { type: string; lieu: string | null; etape?: EtapeLieu }): { adresse: string | null; ville: string | null } {
  const lieu = (r.lieu ?? "").trim();
  if (r.type === "tache") {
    if (!lieu || PAS_UNE_VILLE.test(lieu)) return { adresse: null, ville: null };
    const ville = villeDe(lieu);
    return { adresse: resembleAdresse(lieu) ? lieu : ville, ville };
  }
  if (r.type !== "phys") return { adresse: null, ville: null };
  const e = r.etape && (r.etape.adresse?.trim() || r.etape.ville?.trim()) ? r.etape : null;
  const memeAdresse = !!e && !!lieu && (e.adresse ?? "").trim().toLowerCase() === lieu.toLowerCase();
  if (e && (memeAdresse || !lieu)) return { adresse: adresseEtape(e), ville: villeEtape(e) };
  if (lieu && resembleAdresse(lieu)) return { adresse: lieu, ville: villeDe(lieu) };
  const ville = villeDe(lieu);
  if (e) return { adresse: adresseEtape(e), ville: ville ?? villeEtape(e) };
  return { adresse: ville, ville };
}

/* ───────── Distances et temps ───────── */

const arrondir = (km: number) => Math.round(km * 10) / 10;

/** Le temps moyen d'un trajet en Île-de-France, en minutes (par cinq) : 25 km/h sur dix kilomètres, 50 km/h au-delà, et cinq minutes pour se garer. */
export function minutesMoyennes(kmRoute: number) {
  const km = Math.max(0, kmRoute);
  const min = 5 + Math.min(km, 10) * (60 / 25) + Math.max(0, km - 10) * (60 / 50);
  return Math.max(5, Math.round(min / 5) * 5);
}

/** Le trajet estimé entre deux points : le vol d'oiseau majoré d'un quart. */
export function trajetEstime(a: Point, b: Point): Trajet {
  const km = arrondir(volOiseauKm(a, b) * FACTEUR_ROUTE);
  return { km, min: minutesMoyennes(km), estime: true };
}

/** Le trajet d'une distance par la route connue (OSRM). */
export function trajetParLaRoute(km: number): Trajet {
  return { km: arrondir(km), min: minutesMoyennes(km), estime: false };
}

/** « 4,2 km », « 12 km » : une décimale sous dix kilomètres. */
export const km = (n: number) => (n < 10 ? `${String(arrondir(n)).replace(".", ",")} km` : `${Math.round(n)} km`);
/** « 25 min », « 1 h 05 ». */
export const minutes = (n: number) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, "0")}`);

/** « ≈ 12 km · ≈ 30 min » : la distance sans « ≈ » quand elle vient de l'itinéraire ; le temps est toujours moyen. */
export const libelleTrajet = (t: Trajet) => `${t.estime ? "≈ " : ""}${km(t.km)} · ≈ ${minutes(t.min)}`;

/* ───────── Le créneau le plus cohérent ───────── */

/** Un rendez-vous situé du commercial : instants en millisecondes. */
export interface LieuPlanning {
  id: number;
  debut: number;
  fin: number;
  titre: string;
  ville: string | null;
  point: Point;
}

/** Ce qui occupe le commercial (rendez-vous, créneaux proposés à d'autres clients), situé ou non. */
export type Occupation = { debut: number; fin: number };

export interface Conseil {
  debut: string;
  jour: string;
  heure: string;
  /** Le détour que la visite ajoute à la journée du commercial, en kilomètres (estimé). */
  detourKm: number;
  /**
   * La visite voisine la plus proche, et le trajet de l'une à l'autre.
   * `position` : la nouvelle visite se place juste « apres » elle, ou « avant ».
   */
  voisin: { id: number; titre: string; ville: string | null; position: "avant" | "apres"; trajet: Trajet };
}

/** La journée d'une visite : pas avant 9 h, finie à 19 h au plus, commencée à 17 h au plus tard. */
export const JOURNEE_VISITES = { debut: 9 * 60, dernierDebut: 17 * 60, fin: 19 * 60 };
/** Au-delà de ce détour, une visite déjà programmée n'est plus « proche ». */
export const DETOUR_MAX_KM = 20;
/** Les heures que le planning propose d'office (visites/creneaux.ts). */
const HEURES = [9 * 60, 10 * 60 + 30, 14 * 60, 16 * 60];

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const auQuartSup = (min: number) => Math.ceil(min / 15) * 15;
const auQuartInf = (min: number) => Math.floor(min / 15) * 15;

/**
 * Les créneaux les plus cohérents pour une visite de `duree` minutes à
 * `cible`, parmi les `jours` donnés (AAAA-MM-JJ, à Paris) : ceux qui se
 * glissent dans une journée où le commercial a déjà une visite (ou une tâche)
 * proche, au moindre détour.
 *
 * Pour chaque jour qui a un rendez-vous situé, on essaie les heures habituelles
 * (9 h, 10 h 30, 14 h, 16 h) et les heures collées à chaque rendez-vous : juste
 * après (sa fin, plus le trajet, au quart d'heure) et juste avant. Un créneau
 * est gardé s'il est libre, à venir, dans la journée de visite, si le
 * commercial a le temps de rouler depuis la visite d'avant et jusqu'à celle
 * d'après, et si le détour reste sous DETOUR_MAX_KM :
 *   détour = trajet(avant → cible) + trajet(cible → après) − trajet(avant → après).
 * Le meilleur créneau de chaque jour (à détour égal, celui qui laisse le
 * moins de temps mort autour de la visite voisine), classés du plus petit
 * détour au plus grand (au kilomètre près, le plus tôt d'abord). Aucun rendez-vous proche :
 * aucun conseil, les premiers créneaux libres restent.
 *
 * `trajetVers` donne, quand on la connaît, la distance par la route du voisin
 * jusqu'à la cible (pour l'affichage) ; le classement s'en tient à
 * l'estimation, la même pour tous les créneaux.
 */
export function conseiller(o: {
  cible: Point;
  duree: number;
  jours: string[];
  occupation: Occupation[];
  lieux: LieuPlanning[];
  maintenant: number;
  nb?: number;
  trajetVers?: (l: LieuPlanning) => Trajet | undefined;
}): Conseil[] {
  const nb = o.nb ?? 3;
  const duree = Math.max(15, o.duree);
  const versCible = new Map(o.lieux.map((l) => [l.id, trajetEstime(l.point, o.cible)]));
  const meilleurs: (Conseil & { t: number; attente: number })[] = [];

  for (const jour of o.jours) {
    const lieux = o.lieux.filter((l) => jourParis(new Date(l.debut)) === jour).sort((a, b) => a.debut - b.debut);
    if (!lieux.length) continue;
    const essais = new Set<number>(HEURES);
    for (const l of lieux) {
      const t = versCible.get(l.id)!;
      essais.add(auQuartSup(minutesParis(new Date(l.fin)) + t.min));
      essais.add(auQuartInf(minutesParis(new Date(l.debut)) - t.min - duree));
    }
    let meilleur: (Conseil & { t: number; attente: number }) | null = null;
    for (const m of [...essais].sort((a, b) => a - b)) {
      if (m < JOURNEE_VISITES.debut || m > JOURNEE_VISITES.dernierDebut || m + duree > JOURNEE_VISITES.fin) continue;
      const debut = instantParis(jour, hhmm(m)).getTime();
      const fin = debut + duree * 60_000;
      if (debut <= o.maintenant) continue;
      if (o.occupation.some((p) => p.debut < fin && p.fin > debut)) continue;
      const avant = [...lieux].reverse().find((l) => l.fin <= debut);
      const apres = lieux.find((l) => l.debut >= fin);
      if (!avant && !apres) continue;
      // Le temps de rouler depuis la visite d'avant, et jusqu'à celle d'après.
      if (avant && debut - avant.fin < versCible.get(avant.id)!.min * 60_000) continue;
      if (apres && apres.debut - fin < versCible.get(apres.id)!.min * 60_000) continue;
      const kmAvant = avant ? versCible.get(avant.id)!.km : 0;
      const kmApres = apres ? versCible.get(apres.id)!.km : 0;
      const detour = avant && apres ? kmAvant + kmApres - trajetEstime(avant.point, apres.point).km : avant ? kmAvant : kmApres;
      if (detour > DETOUR_MAX_KM) continue;
      // Le voisin qu'on cite : le plus proche des deux.
      const voisin = !apres || (avant && kmAvant <= kmApres) ? avant! : apres;
      const position = voisin === avant ? "apres" : "avant";
      // Le temps mort du commercial autour de la visite : à détour égal, la visite collée à sa voisine l'emporte.
      const attente = (avant ? debut - avant.fin : 0) + (apres ? apres.debut - fin : 0);
      const c = {
        debut: new Date(debut).toISOString(),
        jour,
        heure: hhmm(m),
        detourKm: arrondir(Math.max(0, detour)),
        voisin: { id: voisin.id, titre: voisin.titre, ville: voisin.ville, position, trajet: o.trajetVers?.(voisin) ?? versCible.get(voisin.id)! },
        t: debut,
        attente,
      } satisfies Conseil & { t: number; attente: number };
      const mieux = !meilleur || Math.round(c.detourKm) < Math.round(meilleur.detourKm) || (Math.round(c.detourKm) === Math.round(meilleur.detourKm) && c.attente < meilleur.attente);
      if (mieux) meilleur = c;
    }
    if (meilleur) meilleurs.push(meilleur);
  }
  return meilleurs
    .sort((a, b) => Math.round(a.detourKm) - Math.round(b.detourKm) || a.t - b.t)
    .slice(0, nb)
    .map(({ debut, jour, heure, detourKm, voisin }) => ({ debut, jour, heure, detourKm, voisin }));
}
