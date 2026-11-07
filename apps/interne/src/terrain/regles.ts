/*
 * Les règles de l'outil terrain, partagées par le navigateur et le serveur :
 * les catégories de photos, les plafonds d'envoi, la forme d'un identifiant.
 * Aucun secret ici : le fichier part aussi dans le code du navigateur.
 */

export const CATEGORIES = [
  { cle: "avant", label: "Avant" },
  { cle: "apres", label: "Après" },
  { cle: "detail", label: "Détail" },
] as const;

export type Categorie = (typeof CATEGORIES)[number]["cle"];

export const estCategorie = (v: unknown): v is Categorie => CATEGORIES.some((c) => c.cle === v);
export const libelleCategorie = (c: string) => CATEGORIES.find((x) => x.cle === c)?.label ?? c;

/** Une photo reçue : 15 Mo au plus (une photo de téléphone non compressée en fait 3 à 12). */
export const PLAFOND_PHOTO = 15 * 1024 * 1024;
/** Sa vignette, faite par le navigateur : quelques dizaines de ko. */
export const PLAFOND_VIGNETTE = 1024 * 1024;
/** Une note jointe aux photos. */
export const PLAFOND_NOTE = 500;

/** Le côté le plus long d'une photo après compression, et celui de sa vignette. */
export const COTE_PHOTO = 2400;
export const COTE_VIGNETTE = 480;

/** Un déménageur peut retirer une photo qu'il vient d'envoyer (une erreur de cadrage), pas au-delà : c'est une preuve. */
export const DELAI_RETRAIT_MIN = 10;

/*
 * L'identifiant d'un déménageur : ce qu'il tape pour se connecter. Supabase
 * Auth exige une adresse e-mail ; un déménageur n'en a pas forcément, et le
 * serveur ne lui écrit jamais. Son compte prend donc une adresse sur un
 * domaine réservé, qui ne peut recevoir aucun courrier (RFC 2606) :
 * « karim.d » devient « karim.d@terrain.bailly.invalid ».
 */
export const DOMAINE_TERRAIN = "terrain.bailly.invalid";
export const FORMAT_IDENTIFIANT = /^[a-z][a-z0-9.-]{2,39}$/;

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** « Karim », « Dubois-Leroy » → « karim.d ». */
export function identifiantPropose(prenom: string, nom: string) {
  const p = sansAccents(prenom).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const n = sansAccents(nom).toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!p) return "";
  return n ? `${p}.${n[0]}` : p;
}

/** Ce que tape la personne, mis au propre : minuscules, sans espaces autour. */
export const identifiantSaisi = (s: string) => s.trim().toLowerCase();

/** Une photo telle que l'affichent la galerie du CRM et l'outil terrain. */
export type PhotoVue = {
  id: number;
  categorie: Categorie;
  note: string | null;
  auteur: string;
  equipe: string | null;
  agentId: number | null;
  /** Horodatage du serveur (ISO) : c'est lui qui fait foi. */
  priseLe: string;
  /** Heure de l'appareil (ISO), pour information. */
  priseAppareil: string | null;
  /** Le jour à Paris, AAAA-MM-JJ. */
  jour: string;
  latitude: number | null;
  longitude: number | null;
  precision: number | null;
  vignette: boolean;
  demo: boolean;
};

const PARIS = "Europe/Paris";
/** 14:03, à l'heure de Paris. */
export const heureParis = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
/** « samedi 7 novembre » pour un jour AAAA-MM-JJ. */
export const jourLong = (jour: string, annee = false) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", ...(annee ? { year: "numeric" } : {}) }).format(new Date(`${jour}T12:00:00Z`));
/** « 7 nov. 2026 à 14:03 », à l'heure de Paris. */
export const momentParis = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(/,?\s(?=\d{2}:\d{2}$)/, " à ");

/** L'heure de l'appareil s'écarte-t-elle de celle du serveur (photo plus ancienne, horloge fausse) ? */
export const ecartAppareil = (p: Pick<PhotoVue, "priseLe" | "priseAppareil">) =>
  !!p.priseAppareil && Math.abs(new Date(p.priseLe).getTime() - new Date(p.priseAppareil).getTime()) > 30 * 60_000;

export const urlPhoto = (id: number, options: { vignette?: boolean; telecharger?: boolean } = {}) =>
  `/api/terrain/photos/${id}${options.vignette ? "?taille=vignette" : options.telecharger ? "?telecharger=1" : ""}`;

export const urlCarte = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
