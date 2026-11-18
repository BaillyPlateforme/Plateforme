import donnees from "./catalogue-dragan.json";
import { normaliser } from "./objets";

/*
 * Le catalogue de la tablette de visite : la nomenclature de Dragan
 * (catalogue bilingue V7, joint à son mail du 18/11/2026), version de
 * travail. Il ne sert QUE la tablette : le formulaire public garde son
 * catalogue court (lib/catalog.ts), et les objets déjà saisis gardent leur
 * libellé et leur volume (chaque ligne d'inventaire les porte en texte).
 *
 * Les données sont dans catalogue-dragan.json, une référence par ligne, dans
 * l'ordre du PDF : rang (n), famille, désignation française (fr) et anglaise
 * (en) telles que dans le PDF, volume en m³ (null quand le PDF dit
 * « À estimer », « À mesurer » ou « Non compté », gardé dans volume_pdf),
 * nature (mobilier, contenant, protection) et, pour l'anglais douteux,
 * en_a_relire. Aucun volume n'y est inventé. Pour la version corrigée de
 * Dragan : remplacer ce fichier en gardant ces champs.
 *
 * Ce que le PDF ne dit pas, et qui est donc DÉDUIT (à valider avec Dragan) :
 * - les familles (le PDF n'a que 10 intertitres, qui ne suivent pas le
 *   contenu) : celles de l'analyse du 18/11, par rangs du PDF ;
 * - les familles proposées en premier selon la pièce visitée (plus bas) ;
 * - les synonymes de la recherche (plus bas), qui ne créent ni référence ni
 *   volume : ils mènent seulement aux références existantes.
 */

export type NatureReference = "mobilier" | "contenant" | "protection";

export interface ReferenceCatalogue {
  n: number;
  famille: string;
  fr: string;
  en: string;
  /** Le volume du PDF, en m³ ; null : « À estimer », « À mesurer » (à saisir) ou « Non compté » (protection). */
  volume: number | null;
  volume_pdf?: string;
  nature: NatureReference;
  /** L'anglais du PDF est douteux : il garde des mots français, ou c'est un faux-sens (analyse du 18/11). */
  en_a_relire?: string;
}

export interface FamilleCatalogue {
  cle: string;
  libelle: string;
  /** Le nom de l'onglet, sur la tablette. */
  court: string;
}

export const CATALOGUE_DRAGAN = donnees as unknown as {
  titre: string;
  source: string;
  avertissement: string;
  regles_du_pdf: string[];
  familles_deduites: FamilleCatalogue[];
  references: ReferenceCatalogue[];
};

export const FAMILLES: FamilleCatalogue[] = CATALOGUE_DRAGAN.familles_deduites;
export const REFERENCES: ReferenceCatalogue[] = CATALOGUE_DRAGAN.references;

/** Une protection (« Non compté ») : quantifiée, jamais dans le cubage. */
export const horsCubage = (r: Pick<ReferenceCatalogue, "nature">) => r.nature === "protection";
/** Une référence sans volume chiffré (« À estimer », « À mesurer ») : le volume se saisit à la visite. */
export const aMesurer = (r: Pick<ReferenceCatalogue, "nature" | "volume">) => r.volume == null && r.nature !== "protection";

/**
 * Les synonymes de la recherche : un mot du terrain mène aux références dont
 * la désignation française commence par l'une des « designations ». Rien de
 * plus : pas de référence nouvelle, pas de volume. Liste à compléter avec
 * Dragan (BZ et clic-clac sont déjà des références du catalogue).
 */
export const SYNONYMES: { termes: string[]; designations: string[] }[] = [
  { termes: ["Kallax", "Expedit", "Étagère à cases", "Meuble cube", "Cube de rangement"], designations: ["KALLAX"] },
  { termes: ["Frigo"], designations: ["Réfrigérateur"] },
  { termes: ["Congélo"], designations: ["Congélateur"] },
  { termes: ["Machine à laver"], designations: ["Lave-linge"] },
  { termes: ["Télévision", "Télé", "Écran plat"], designations: ["TV"] },
  { termes: ["Sofa", "Divan"], designations: ["Canapé"] },
  { termes: ["Canapé-lit"], designations: ["Canapé convertible", "Clic-clac", "BZ"] },
  { termes: ["Table de nuit", "Table de chevet"], designations: ["Chevet"] },
  { termes: ["Lit double", "Lit simple", "Lit 1 place", "Lit 2 places"], designations: ["Lit complet"] },
  { termes: ["Table à manger", "Table de salle à manger"], designations: ["Table 2 personnes", "Table 4 personnes", "Table 6 personnes", "Table 8 personnes", "Table 10-12 personnes"] },
  { termes: ["Plante"], designations: ["Pot fleurs", "Bac plantes", "Jardinière"] },
];

/** Les synonymes d'une désignation : ceux dont une « designation » est la sienne, ou ses premiers mots. */
function synonymesDe(fr: string) {
  const n = normaliser(fr);
  const commence = (d: string) => n === normaliser(d) || n.startsWith(`${normaliser(d)} `);
  return SYNONYMES.filter((s) => s.designations.some(commence)).flatMap((s) => s.termes);
}

/** Les références de la tablette, prêtes pour la saisie automatique (lib/visite/objets.ts). */
export const CATALOGUE_TABLETTE = REFERENCES.map((r) => ({
  label: r.fr,
  en: r.en,
  volume: r.volume ?? 0,
  groupe: r.famille,
  aMesurer: aMesurer(r),
  horsCubage: horsCubage(r),
  enARelire: !!r.en_a_relire,
  synonymes: synonymesDe(r.fr),
}));

export type ArticleCatalogue = (typeof CATALOGUE_TABLETTE)[number];

const parLibelle = new Map(CATALOGUE_TABLETTE.map((a) => [normaliser(a.label), a]));

/** La référence du catalogue qui porte exactement ce libellé (sans tenir compte des accents ni des majuscules). */
export const referenceDuLibelle = (libelle: string | null | undefined): ArticleCatalogue | null => parLibelle.get(normaliser(String(libelle ?? ""))) ?? null;

/**
 * Les familles à proposer d'abord selon le nom de la pièce (déduit, à
 * valider) : « Chambre 2 » → chambre, luminaires… Les contenants viennent
 * ensuite (des cartons, il y en a partout), puis tout le reste du catalogue,
 * les protections en dernier : tout reste accessible depuis n'importe quelle
 * pièce.
 */
const PIECES: { motif: RegExp; familles: string[] }[] = [
  { motif: /\b(enfant|bebe|nursery)\b/, familles: ["enfant", "chambre"] },
  { motif: /\b(chambre|dressing)\b/, familles: ["chambre", "luminaires", "tableaux"] },
  { motif: /\bsalle a manger\b/, familles: ["salle_a_manger", "salon", "luminaires", "tableaux"] },
  { motif: /\b(salon|sejour|living)\b/, familles: ["salon", "multimedia", "luminaires", "tableaux", "art", "musique"] },
  { motif: /\b(cuisine|cellier)\b/, familles: ["cuisine", "salle_a_manger"] },
  { motif: /\b(salle de bains?|salle d eau|wc|toilettes)\b/, familles: ["salle_de_bains", "buanderie"] },
  { motif: /\b(buanderie|lingerie)\b/, familles: ["buanderie", "cuisine"] },
  { motif: /\bbureau\b/, familles: ["bureau", "luminaires"] },
  { motif: /\bcave\b/, familles: ["cave", "garage"] },
  { motif: /\b(garage|atelier|box)\b/, familles: ["garage", "jardin", "tondeuses", "loisirs"] },
  { motif: /\b(jardin|terrasse|balcon|exterieur|veranda|abri)\b/, familles: ["jardin", "tondeuses", "loisirs"] },
  { motif: /\b(entree|couloir|degagement|palier|hall)\b/, familles: ["entree", "luminaires", "tableaux"] },
  { motif: /\b(grenier|combles)\b/, familles: ["art", "loisirs", "garage"] },
  { motif: /\b(jeux|sport)\b/, familles: ["loisirs", "multimedia"] },
];

export function famillesPourLaPiece(nom: string): string[] {
  const n = normaliser(nom);
  const d = PIECES.find((p) => p.motif.test(n))?.familles ?? [];
  const toutes = FAMILLES.map((f) => f.cle);
  const reste = toutes.filter((f) => !d.includes(f) && f !== "contenants" && f !== "protections");
  return [...d, ...(d.includes("contenants") ? [] : ["contenants"]), ...reste, "protections"].filter((f, i, l) => toutes.includes(f) && l.indexOf(f) === i);
}

/** Le genre d'une pièce, pour les références les plus utilisées : « Chambre 2 » et « chambre » → « chambre ». */
export const genreDePiece = (nom: string) => normaliser(nom).replace(/\s+\d+$/, "").trim();

/** Une référence parmi les plus utilisées par l'équipe dans un genre de pièce (crm/visites/donnees.ts, referencesFrequentes). */
export type ReferenceFrequente = { genre: string; label: string; volume: number; en: string | null; dossiers: number; horsCubage?: boolean };
