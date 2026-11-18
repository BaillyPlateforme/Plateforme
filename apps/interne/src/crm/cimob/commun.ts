/*
 * Les dossiers CIMOB/DICOM (militaires mutés, `clients.type = 'militaire'`),
 * d'après le mail « BAILLY - militaire » de Céline (17/11/2026) : ce que
 * partagent l'écran de création, la fiche du dossier, son impression et le
 * serveur. Rien ici ne lit la base ni le navigateur : ce module se charge des
 * deux côtés, et se teste seul.
 *
 * - la situation de famille et le matricule du client ;
 * - le département d'outre-mer de chaque adresse (« IMPÉRATIF ») ;
 * - le repli : ramener le mobilier du logement de métropole en garde-meubles
 *   ou à une adresse de son choix ;
 * - le transport des véhicules, avec l'estimation de leur volume ;
 * - les volumes, qui peuvent avoir une virgule (« 12,5 m³ »).
 */

/** Une table de correspondance lue sans jamais tomber sur une clé héritée (`constructor`…). */
const lire = <T>(table: Record<string, T>, cle: unknown): T | null => (typeof cle === "string" && Object.hasOwn(table, cle) ? table[cle] : null);

/* ---------- la situation de famille (liste à valider par Céline) ---------- */

/**
 * Les valeurs d'état civil courantes. Liste écrite faute de source : à valider
 * avec Bailly (et avec ce que demande le document de l'administration).
 */
export const SITUATIONS_FAMILLE: Record<string, string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  pacse: "Pacsé(e)",
  concubinage: "En concubinage",
  divorce: "Divorcé(e)",
  separe: "Séparé(e)",
  veuf: "Veuf / veuve",
};
export const libelleSituation = (k: unknown) => lire(SITUATIONS_FAMILLE, k);
export const situationValide = (k: unknown): string | null => (lire(SITUATIONS_FAMILLE, k) ? (k as string) : null);

/* ---------- le matricule ---------- */

/** Le matricule tel qu'on l'enregistre : espaces resserrés, 40 caractères au plus ; vide, rien. */
export function matriculeValide(v: unknown): string | null {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return t || null;
}

/* ---------- les départements d'outre-mer (liste à confirmer) ---------- */

/**
 * Les codes officiels : les cinq départements d'outre-mer (971 à 974, 976),
 * puis les collectivités d'outre-mer (975, 977, 978, 986, 987, 988). L'ordre
 * de la liste est celui des codes, celui du tri.
 */
export const DEPARTEMENTS_OM: Record<string, string> = {
  "971": "Guadeloupe",
  "972": "Martinique",
  "973": "Guyane",
  "974": "La Réunion",
  "975": "Saint-Pierre-et-Miquelon",
  "976": "Mayotte",
  "977": "Saint-Barthélemy",
  "978": "Saint-Martin",
  "986": "Wallis-et-Futuna",
  "987": "Polynésie française",
  "988": "Nouvelle-Calédonie",
};
/** Les cinq départements proprement dits ; les autres codes sont des collectivités. */
const DEPARTEMENTS_PROPREMENT_DITS = ["971", "972", "973", "974", "976"];

export const CODES_OM = Object.keys(DEPARTEMENTS_OM).sort();
/** Un code de la liste, sinon rien (une valeur inconnue venue d'un formulaire ne s'enregistre pas). */
export const departementOm = (v: unknown): string | null => (lire(DEPARTEMENTS_OM, typeof v === "string" ? v.trim() : v) ? String(v).trim() : null);
/** « 972 · Martinique ». */
export const libelleDepartement = (code: unknown): string | null => {
  const nom = lire(DEPARTEMENTS_OM, code);
  return nom ? `${code} · ${nom}` : null;
};
/**
 * Le département d'outre-mer d'un code postal, pour préremplir la case quand
 * une adresse est choisie dans les suggestions : les trois premiers chiffres
 * (97200 → 972), sauf Saint-Barthélemy (97133 → 977) et Saint-Martin
 * (97150 → 978), qui ont gardé un code postal de la Guadeloupe.
 */
export function departementDepuisCodePostal(cp: unknown): string | null {
  const c = typeof cp === "string" ? cp.replace(/\s+/g, "") : "";
  if (!/^9[78]\d{3}$/.test(c)) return null;
  if (c === "97133") return "977";
  if (c === "97150") return "978";
  return departementOm(c.slice(0, 3));
}

/** Les options d'une liste de choix, groupées : départements, puis collectivités. */
export const GROUPES_OM: { libelle: string; codes: string[] }[] = [
  { libelle: "Départements d’outre-mer", codes: DEPARTEMENTS_PROPREMENT_DITS },
  { libelle: "Collectivités d’outre-mer", codes: CODES_OM.filter((c) => !DEPARTEMENTS_PROPREMENT_DITS.includes(c)) },
];

/* ---------- les volumes, avec une virgule ---------- */

/**
 * Un volume saisi à la main : « 12,5 », « 12.5 », « 12,5 m³ », « 12 m3 ».
 * Arrondi au centième (les colonnes sont en numeric(…,2)), strictement
 * positif et sous `max` ; sinon rien.
 */
export function lireVolume(v: unknown, max = 100_000): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 && v < max ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, "").replace(/m(3|³)$/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return lireVolume(Number(t), max);
}
/** Ce que la saisie garde pendant la frappe : des chiffres et un séparateur. */
export const saisieVolume = (t: string) => t.replace(/[^0-9.,]/g, "").slice(0, 9);
/** Un volume affiché dans un champ : « 12,5 ». */
export const volumeEnSaisie = (n: unknown) => {
  const x = Number(n);
  return n == null || n === "" || !Number.isFinite(x) ? "" : String(Math.round(x * 100) / 100).replace(".", ",");
};

/* ---------- le repli ---------- */

export const DESTINATIONS_REPLI: Record<string, string> = { garde_meuble: "Garde-meubles", adresse: "Adresse de son choix" };

/** L'adresse « de son choix » d'un repli : ce que demande le modèle de Céline, et le département d'outre-mer. */
export interface AdresseRepli {
  adresse: string;
  code_postal: string;
  ville: string;
  pays: string;
  etage: string;
  ascenseur: boolean;
  ascenseur_taille: string;
  departement_om: string;
}
/** Le repli tel que l'écran le saisit. */
export interface RepliSaisi {
  repli: boolean;
  volume_droits: string;
  periode: string;
  destination: "" | "garde_meuble" | "adresse";
  /** Garde-meubles : le lieu, en texte libre. */
  lieu: string;
  adresse: AdresseRepli;
}
export const ADRESSE_REPLI_VIDE: AdresseRepli = { adresse: "", code_postal: "", ville: "", pays: "", etage: "", ascenseur: false, ascenseur_taille: "", departement_om: "" };
export const REPLI_VIDE: RepliSaisi = { repli: false, volume_droits: "", periode: "", destination: "", lieu: "", adresse: ADRESSE_REPLI_VIDE };

/** Le repli tel qu'il s'enregistre (crm.replis). */
export interface Repli {
  repli: boolean;
  volume_droits: number | null;
  periode: string | null;
  destination: "garde_meuble" | "adresse" | null;
  lieu: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  etage: string | null;
  ascenseur: boolean;
  ascenseur_taille: string | null;
  departement_om: string | null;
}

const texte = (v: unknown, max: number) => {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return t || null;
};
const objet = (brut: unknown): Record<string, unknown> | null => {
  let x = brut;
  if (typeof brut === "string") {
    try {
      x = JSON.parse(brut);
    } catch {
      return null;
    }
  }
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
};

/**
 * Le repli reçu d'un formulaire (un champ caché, en JSON), relu côté
 * serveur : seuls les champs connus, aux valeurs bornées. « Non » garde ce
 * qui a été saisi (un « non » par erreur ne fait rien perdre) ; seul ce que
 * la destination choisie demande est gardé.
 */
export function lireRepli(brut: unknown): Repli {
  const o = objet(brut) ?? {};
  const a = objet(o.adresse) ?? {};
  const destination = o.destination === "garde_meuble" || o.destination === "adresse" ? o.destination : null;
  const parAdresse = destination === "adresse";
  const ascenseur = parAdresse && a.ascenseur === true;
  return {
    repli: o.repli === true,
    volume_droits: lireVolume(o.volume_droits),
    periode: texte(o.periode, 120),
    destination,
    lieu: destination === "garde_meuble" ? texte(o.lieu, 200) : null,
    adresse: parAdresse ? texte(a.adresse, 300) : null,
    code_postal: parAdresse ? texte(a.code_postal, 12) : null,
    ville: parAdresse ? texte(a.ville, 80) : null,
    pays: parAdresse ? texte(a.pays, 60) : null,
    etage: parAdresse ? texte(a.etage, 40) : null,
    ascenseur,
    ascenseur_taille: ascenseur ? texte(a.ascenseur_taille, 40) : null,
    departement_om: parAdresse ? departementOm(a.departement_om) : null,
  };
}

/** Un repli enregistré, de nouveau en saisie (la fenêtre de la fiche). */
export function repliEnSaisie(r: Partial<Record<keyof Repli, unknown>> | null | undefined): RepliSaisi {
  if (!r) return REPLI_VIDE;
  const t = (v: unknown) => (v == null ? "" : String(v));
  return {
    repli: r.repli === true,
    volume_droits: volumeEnSaisie(r.volume_droits),
    periode: t(r.periode),
    destination: r.destination === "garde_meuble" || r.destination === "adresse" ? r.destination : "",
    lieu: t(r.lieu),
    adresse: {
      adresse: t(r.adresse), code_postal: t(r.code_postal), ville: t(r.ville), pays: t(r.pays), etage: t(r.etage),
      ascenseur: r.ascenseur === true, ascenseur_taille: t(r.ascenseur_taille), departement_om: departementOm(r.departement_om) ?? "",
    },
  };
}

/** « Garde-meubles · Lieu », « Adresse de son choix · 12 rue… » : le repli en une ligne. */
export function resumeRepli(r: Pick<Repli, "repli" | "destination" | "lieu" | "adresse" | "ville" | "departement_om"> | null | undefined): string {
  if (!r?.repli) return "Non";
  const ou = r.destination === "garde_meuble" ? r.lieu : r.destination === "adresse" ? [r.adresse, r.ville && !String(r.adresse ?? "").includes(r.ville) ? r.ville : null, libelleDepartement(r.departement_om)].filter(Boolean).join(", ") : null;
  return [r.destination ? DESTINATIONS_REPLI[r.destination] : "Destination à préciser", ou].filter(Boolean).join(" · ");
}

/* ---------- les véhicules ---------- */

export const GENRES_VEHICULE: Record<string, string> = { moto: "Moto", voiture: "Voiture", autre: "Autre" };
export const MOTORISATIONS: Record<string, string> = { essence: "Essence", diesel: "Diesel", hybride: "Hybride", electrique: "Électrique" };
export type GenreVehicule = "moto" | "voiture" | "autre";
/** Au plus, par dossier. */
export const VEHICULES_MAX = 6;

/** Les dimensions retenues par l'estimation, en mètres, et ce qui les a données. */
export interface EstimationVehicule {
  longueur: number;
  largeur: number;
  hauteur: number;
  /** Le volume calculé (longueur × largeur × hauteur, au dixième). */
  volume: number;
  /** Le véhicule reconnu (« Peugeot 308 III, berline »), tel que l'IA l'a nommé. */
  reconnu: string | null;
  /** Le modèle d'IA consulté, et quand. */
  modele_ia: string;
  le: string;
  /** La marque et le modèle saisis au moment de l'estimation : changés ensuite, l'estimation ne vaut plus. */
  pour: string;
}

/** Un véhicule tel que l'écran le saisit. */
export interface VehiculeSaisi {
  genre: "" | GenreVehicule;
  motorisation: string;
  marque: string;
  modele: string;
  /** « Autre » : ce que l'équipe en écrit à la main. */
  description: string;
  volume: string;
  estimation: EstimationVehicule | null;
}
export const VEHICULE_VIDE: VehiculeSaisi = { genre: "", motorisation: "", marque: "", modele: "", description: "", volume: "", estimation: null };

/** Un véhicule tel qu'il s'enregistre (crm.vehicules). */
export interface Vehicule {
  genre: GenreVehicule;
  motorisation: string | null;
  marque: string | null;
  modele: string | null;
  description: string | null;
  volume: number | null;
  estimation: EstimationVehicule | null;
}

/** La clé qui dit pour quel véhicule une estimation a été faite. */
export const clePour = (genre: string, marque: string, modele: string) => [genre, marque, modele].map((x) => x.replace(/\s+/g, " ").trim().toLowerCase()).join("|");

const dimension = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 30 ? Math.round(v * 100) / 100 : null);

function lireEstimationStockee(v: unknown, pour: string): EstimationVehicule | null {
  const o = objet(v);
  if (!o) return null;
  const longueur = dimension(o.longueur), largeur = dimension(o.largeur), hauteur = dimension(o.hauteur);
  if (longueur == null || largeur == null || hauteur == null) return null;
  // Faite pour une autre marque ou un autre modèle que ceux enregistrés : elle ne suit pas.
  if (typeof o.pour === "string" && o.pour !== pour) return null;
  return {
    longueur, largeur, hauteur,
    volume: volumeDepuisDimensions(longueur, largeur, hauteur) ?? 0,
    reconnu: texte(o.reconnu, 120),
    modele_ia: texte(o.modele_ia, 60) ?? "Gemini",
    le: texte(o.le, 40) ?? "",
    pour,
  };
}

/**
 * Les véhicules reçus d'un formulaire (un champ caché, en JSON), relus côté
 * serveur. Une moto ou une voiture garde motorisation, marque, modèle et
 * volume ; « Autre », seulement sa description et son volume. Une ligne sans
 * rien de saisi ne compte pas.
 */
export function lireVehicules(brut: unknown): Vehicule[] {
  let liste: unknown = brut;
  if (typeof brut === "string") {
    try {
      liste = JSON.parse(brut);
    } catch {
      liste = [];
    }
  }
  const sortie: Vehicule[] = [];
  for (const x of Array.isArray(liste) ? liste : []) {
    if (sortie.length >= VEHICULES_MAX) break;
    const o = objet(x);
    if (!o) continue;
    const genre = o.genre === "moto" || o.genre === "voiture" || o.genre === "autre" ? o.genre : null;
    if (!genre) continue;
    const volume = lireVolume(o.volume, 1000);
    if (genre === "autre") {
      const description = texte(o.description, 300);
      if (!description && volume == null) continue;
      sortie.push({ genre, motorisation: null, marque: null, modele: null, description, volume, estimation: null });
      continue;
    }
    const marque = texte(o.marque, 60), modele = texte(o.modele, 80);
    sortie.push({
      genre,
      motorisation: lire(MOTORISATIONS, o.motorisation) ? (o.motorisation as string) : null,
      marque, modele, description: null, volume,
      estimation: lireEstimationStockee(o.estimation, clePour(genre, marque ?? "", modele ?? "")),
    });
  }
  return sortie;
}

/** Un véhicule enregistré, de nouveau en saisie. */
export function vehiculeEnSaisie(v: Partial<Record<keyof Vehicule, unknown>>): VehiculeSaisi {
  const t = (x: unknown) => (x == null ? "" : String(x));
  const genre = v.genre === "moto" || v.genre === "voiture" || v.genre === "autre" ? v.genre : "";
  return {
    genre,
    motorisation: lire(MOTORISATIONS, v.motorisation) ? String(v.motorisation) : "",
    marque: t(v.marque), modele: t(v.modele), description: t(v.description), volume: volumeEnSaisie(v.volume),
    estimation: lireEstimationStockee(v.estimation, clePour(genre, t(v.marque), t(v.modele))),
  };
}

/** « Voiture · Peugeot 308 · Diesel », « Autre · remorque bagagère ». */
export function nomVehicule(v: Pick<Vehicule, "genre" | "marque" | "modele" | "motorisation" | "description">): string {
  if (v.genre === "autre") return ["Autre", v.description].filter(Boolean).join(" · ");
  return [GENRES_VEHICULE[v.genre], [v.marque, v.modele].filter(Boolean).join(" ") || null, v.motorisation ? lire(MOTORISATIONS, v.motorisation) : null].filter(Boolean).join(" · ");
}

/* ---------- l'estimation du volume d'un véhicule ---------- */

/** Le volume d'un pavé : longueur × largeur × hauteur, en m³, arrondi au dixième. */
export function volumeDepuisDimensions(longueur: unknown, largeur: unknown, hauteur: unknown): number | null {
  const l = Number(longueur), w = Number(largeur), h = Number(hauteur);
  if (![l, w, h].every((x) => Number.isFinite(x) && x > 0)) return null;
  return Math.round(l * w * h * 10) / 10;
}

/**
 * Les dimensions plausibles, en mètres (longueur, largeur, hauteur) : une
 * réponse de l'IA hors de ces bornes n'est pas exploitable. Une voiture va de
 * la citadine à la grande fourgonnette aménagée.
 */
export const BORNES_DIMENSIONS: Record<"moto" | "voiture", [number, number][]> = {
  moto: [[1.4, 3.2], [0.5, 1.4], [0.7, 1.8]],
  voiture: [[2.3, 7], [1.3, 2.6], [1, 3.2]],
};

/** Ce qui se lit d'une réponse de l'IA, ou la raison pour laquelle elle n'est pas exploitable. */
export type LectureEstimation =
  | { ok: true; longueur: number; largeur: number; hauteur: number; volume: number; reconnu: string | null }
  | { ok: false; raison: string };

/** La réponse de l'IA (JSON imposé), relue : un véhicule reconnu, des dimensions plausibles. */
export function lireReponseEstimation(brut: unknown, genre: "moto" | "voiture"): LectureEstimation {
  const o = objet(brut);
  if (!o) return { ok: false, raison: "réponse illisible" };
  if (o.reconnu === false) return { ok: false, raison: "véhicule non reconnu : vérifiez la marque et le modèle" };
  const d = [o.longueur_m, o.largeur_m, o.hauteur_m].map((x) => (typeof x === "number" ? x : typeof x === "string" ? Number(x.replace(",", ".")) : NaN));
  if (!d.every((x) => Number.isFinite(x) && x > 0)) return { ok: false, raison: "dimensions absentes de la réponse" };
  const bornes = BORNES_DIMENSIONS[genre];
  if (!d.every((x, i) => x >= bornes[i][0] && x <= bornes[i][1])) return { ok: false, raison: `dimensions peu vraisemblables pour une ${genre === "moto" ? "moto" : "voiture"}` };
  const [longueur, largeur, hauteur] = d.map((x) => Math.round(x * 100) / 100);
  return { ok: true, longueur, largeur, hauteur, volume: volumeDepuisDimensions(longueur, largeur, hauteur)!, reconnu: texte(o.version, 120) };
}

/** Ce que l'estimation accepte de chercher : une marque et un modèle courts, en lettres, chiffres et ponctuation simple. */
export function entreeEstimation(v: { genre?: unknown; marque?: unknown; modele?: unknown; motorisation?: unknown }):
  | { ok: true; genre: "moto" | "voiture"; marque: string; modele: string; motorisation: string | null }
  | { ok: false; raison: string } {
  const genre = v.genre === "moto" || v.genre === "voiture" ? v.genre : null;
  if (!genre) return { ok: false, raison: "L’estimation vaut pour une moto ou une voiture." };
  const propre = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "").slice(0, max + 1);
  const marque = propre(v.marque, 40), modele = propre(v.modele, 60);
  if (!marque || !modele) return { ok: false, raison: "Saisissez la marque et le modèle." };
  if (marque.length > 40 || modele.length > 60) return { ok: false, raison: "Marque ou modèle trop long." };
  const permis = /^[\p{L}\p{N} .,'’()+&/-]+$/u;
  if (!permis.test(marque) || !permis.test(modele)) return { ok: false, raison: "La marque et le modèle ne s’écrivent qu’en lettres, chiffres et ponctuation simple." };
  return { ok: true, genre, marque, modele, motorisation: lire(MOTORISATIONS, v.motorisation) ? String(v.motorisation) : null };
}

/** « 4,37 × 1,85 × 1,46 m ». */
export const dimensionsLisibles = (e: Pick<EstimationVehicule, "longueur" | "largeur" | "hauteur">) =>
  `${[e.longueur, e.largeur, e.hauteur].map((x) => String(x).replace(".", ",")).join(" × ")} m`;
