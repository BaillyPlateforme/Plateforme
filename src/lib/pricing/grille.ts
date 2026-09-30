// ============================================================
// Grille tarifaire Bailly — extraite des fichiers de référence.
//
//   Copy of GRILLEDAVIDIAV2.xlsx         → onglets « GRILLE » et « particularités »
//   Copie de Catégories prestations.xlsx → contenu des trois formules
//
// Source de vérité du chiffrage : ce fichier. Toute évolution de tarif se fait
// ici, en une seule modification, et se voit dans l'historique.
//
// ── DEUX PARTICULARITÉS DE LA GRILLE ──────────────────────────────────────
//
// 1. LA PREMIÈRE TRANCHE EST UN FORFAIT, pas un prix au m³. « 1 à 5 m³ avec
//    mini de 5 m³ » : un déménagement de moins de 5 m³ est facturé au prix
//    de la case, tel quel. Les douze autres colonnes sont des prix au m³.
//
// 2. LES TROIS TABLEAUX SONT ÉCRITS EN ENTIER. L'ancienne grille était la
//    formule standard multipliée par 0,92 et 1,15 ; celle-ci ne l'est plus :
//    sur la ligne 0 à 50 km, à partir de la tranche 11–15 m³, l'économique
//    tombe à 0,90 du standard. Onze cellules sur 169. Reproduire un
//    coefficient aurait donc trahi le fichier.
// ============================================================

export type Formule = "eco" | "standard" | "luxe";

export const FORMULES: { key: Formule; label: string; description: string }[] = [
  { key: "eco", label: "Économique", description: "Le client emballe, Bailly transporte et remonte." },
  { key: "standard", label: "Standard", description: "Bailly emballe le fragile et l'électroménager." },
  { key: "luxe", label: "Premium", description: "Bailly emballe et déballe tout, y compris les meubles fixés." },
];

/** Tranches de volume. La première se facture au forfait, les autres au m³. */
export const TRANCHES_VOLUME: { min: number; max: number | null; forfait: boolean; label: string }[] = [
  { min: 1, max: 5, forfait: true, label: "1 à 5 m³ — forfait" },
  { min: 6, max: 10, forfait: false, label: "6 à 10 m³" },
  { min: 11, max: 15, forfait: false, label: "11 à 15 m³" },
  { min: 16, max: 20, forfait: false, label: "16 à 20 m³" },
  { min: 21, max: 30, forfait: false, label: "21 à 30 m³" },
  { min: 31, max: 40, forfait: false, label: "31 à 40 m³" },
  { min: 41, max: 50, forfait: false, label: "41 à 50 m³" },
  { min: 51, max: 60, forfait: false, label: "51 à 60 m³" },
  { min: 61, max: 70, forfait: false, label: "61 à 70 m³" },
  { min: 71, max: 80, forfait: false, label: "71 à 80 m³" },
  { min: 81, max: 90, forfait: false, label: "81 à 90 m³" },
  { min: 91, max: 100, forfait: false, label: "91 à 100 m³" },
  { min: 101, max: null, forfait: false, label: "plus de 100 m³" },
];

/** Tranches de distance, en km. */
export const TRANCHES_DISTANCE: { min: number; max: number; label: string }[] = [
  { min: 0, max: 50, label: "0 à 50 km" },
  { min: 51, max: 100, label: "51 à 100 km" },
  { min: 101, max: 200, label: "101 à 200 km" },
  { min: 201, max: 300, label: "201 à 300 km" },
  { min: 301, max: 400, label: "301 à 400 km" },
  { min: 401, max: 500, label: "401 à 500 km" },
  { min: 501, max: 600, label: "501 à 600 km" },
  { min: 601, max: 700, label: "601 à 700 km" },
  { min: 701, max: 800, label: "701 à 800 km" },
  { min: 801, max: 900, label: "801 à 900 km" },
  { min: 901, max: 1000, label: "901 à 1000 km" },
  { min: 1001, max: 1100, label: "1001 à 1100 km" },
  { min: 1101, max: 1200, label: "1101 à 1200 km" },
];

/**
 * Une ligne par tranche de distance, une colonne par tranche de volume
 * (mêmes ordres que les tableaux ci-dessus). Première colonne : un forfait en
 * euros. Les suivantes : un prix au m³.
 */
export const TARIFS: Record<Formule, number[][]> = {
  standard: [
  [375, 56.25, 45, 43, 41, 39, 37, 37, 36, 36, 36, 36, 36], // 0–50 km
  [450, 66, 55, 45, 43, 43, 40, 40, 39, 39, 39, 39, 39], // 51–100 km
  [475, 76, 65, 55, 52, 52, 45, 45, 45, 45, 45, 45, 45], // 101–200 km
  [525, 85, 75, 65, 60, 60, 55, 55, 55, 55, 55, 55, 55], // 201–300 km
  [575, 95, 85, 70, 68, 68, 60, 60, 60, 60, 60, 60, 60], // 301–400 km
  [625, 105, 95, 73, 72, 72, 65, 65, 65, 65, 65, 65, 65], // 401–500 km
  [650, 115, 105, 80, 76, 76, 70, 70, 70, 70, 70, 70, 70], // 501–600 km
  [675, 125, 115, 86, 82, 82, 76, 76, 76, 76, 76, 76, 76], // 601–700 km
  [700, 135, 125, 92, 89, 89, 80, 80, 80, 80, 80, 80, 80], // 701–800 km
  [725, 145, 135, 102, 92, 92, 85, 85, 85, 85, 85, 85, 85], // 801–900 km
  [750, 155, 145, 110, 94, 94, 88, 88, 88, 88, 88, 88, 88], // 901–1000 km
  [775, 165, 155, 120, 103, 103, 90, 90, 90, 90, 90, 90, 90], // 1001–1100 km
  [800, 175, 165, 125, 112, 112, 95, 95, 95, 95, 95, 95, 95], // 1101–1200 km
  ],
  eco: [
  [345, 51.75, 40.5, 38.7, 36.9, 35.1, 33.3, 33.3, 32.4, 32.4, 32.4, 32.4, 32.4], // 0–50 km
  [414, 60.72, 50.6, 41.4, 39.56, 39.56, 36.8, 36.8, 35.88, 35.88, 35.88, 35.88, 35.88], // 51–100 km
  [437, 69.92, 59.8, 50.6, 47.84, 47.84, 41.4, 41.4, 41.4, 41.4, 41.4, 41.4, 41.4], // 101–200 km
  [483, 78.2, 69, 59.8, 55.2, 55.2, 50.6, 50.6, 50.6, 50.6, 50.6, 50.6, 50.6], // 201–300 km
  [529, 87.4, 78.2, 64.4, 62.56, 62.56, 55.2, 55.2, 55.2, 55.2, 55.2, 55.2, 55.2], // 301–400 km
  [575, 96.6, 87.4, 67.16, 66.24, 66.24, 59.8, 59.8, 59.8, 59.8, 59.8, 59.8, 59.8], // 401–500 km
  [598, 105.8, 96.6, 73.6, 69.92, 69.92, 64.4, 64.4, 64.4, 64.4, 64.4, 64.4, 64.4], // 501–600 km
  [621, 115, 105.8, 79.12, 75.44, 75.44, 69.92, 69.92, 69.92, 69.92, 69.92, 69.92, 69.92], // 601–700 km
  [644, 124.2, 115, 84.64, 81.88, 81.88, 73.6, 73.6, 73.6, 73.6, 73.6, 73.6, 73.6], // 701–800 km
  [667, 133.4, 124.2, 93.84, 84.64, 84.64, 78.2, 78.2, 78.2, 78.2, 78.2, 78.2, 78.2], // 801–900 km
  [690, 142.6, 133.4, 101.2, 86.48, 86.48, 80.96, 80.96, 80.96, 80.96, 80.96, 80.96, 80.96], // 901–1000 km
  [713, 151.8, 142.6, 110.4, 94.76, 94.76, 82.8, 82.8, 82.8, 82.8, 82.8, 82.8, 82.8], // 1001–1100 km
  [736, 161, 151.8, 115, 103.04, 103.04, 87.4, 87.4, 87.4, 87.4, 87.4, 87.4, 87.4], // 1101–1200 km
  ],
  luxe: [
  [431.25, 64.69, 51.75, 49.45, 47.15, 44.85, 42.55, 42.55, 41.4, 41.4, 41.4, 41.4, 41.4], // 0–50 km
  [517.5, 75.9, 63.25, 51.75, 49.45, 49.45, 46, 46, 44.85, 44.85, 44.85, 44.85, 44.85], // 51–100 km
  [546.25, 87.4, 74.75, 63.25, 59.8, 59.8, 51.75, 51.75, 51.75, 51.75, 51.75, 51.75, 51.75], // 101–200 km
  [603.75, 97.75, 86.25, 74.75, 69, 69, 63.25, 63.25, 63.25, 63.25, 63.25, 63.25, 63.25], // 201–300 km
  [661.25, 109.25, 97.75, 80.5, 78.2, 78.2, 69, 69, 69, 69, 69, 69, 69], // 301–400 km
  [718.75, 120.75, 109.25, 83.95, 82.8, 82.8, 74.75, 74.75, 74.75, 74.75, 74.75, 74.75, 74.75], // 401–500 km
  [747.5, 132.25, 120.75, 92, 87.4, 87.4, 80.5, 80.5, 80.5, 80.5, 80.5, 80.5, 80.5], // 501–600 km
  [776.25, 143.75, 132.25, 98.9, 94.3, 94.3, 87.4, 87.4, 87.4, 87.4, 87.4, 87.4, 87.4], // 601–700 km
  [805, 155.25, 143.75, 105.8, 102.35, 102.35, 92, 92, 92, 92, 92, 92, 92], // 701–800 km
  [833.75, 166.75, 155.25, 117.3, 105.8, 105.8, 97.75, 97.75, 97.75, 97.75, 97.75, 97.75, 97.75], // 801–900 km
  [862.5, 178.25, 166.75, 126.5, 108.1, 108.1, 101.2, 101.2, 101.2, 101.2, 101.2, 101.2, 101.2], // 901–1000 km
  [891.25, 189.75, 178.25, 138, 118.45, 118.45, 103.5, 103.5, 103.5, 103.5, 103.5, 103.5, 103.5], // 1001–1100 km
  [920, 201.25, 189.75, 143.75, 128.8, 128.8, 109.25, 109.25, 109.25, 109.25, 109.25, 109.25, 109.25], // 1101–1200 km
  ],
};

// ---- Suppléments (onglet « particularités » + arbitrages client du 29/09/2026) ----
export const SUPPLEMENTS = {
  /**
   * Le voyage spécial n'est plus proposé au client ni appliqué automatiquement :
   * « nous ne parlons pas de voyage spécial, cette notion sera abordée avec le
   * commercial si nécessaire ». Le taux reste ici pour le levier manuel du
   * simulateur, côté équipe.
   */
  voyageSpecialPct: 0.15,

  /** Portage au-delà de 20 m, par tranche de 20 m entamée, au m³. */
  portage: { seuilMetres: 20, trancheMetres: 20, prixParM3: 2.2 },

  /** Camion porteur inaccessible : navette avec un véhicule plus petit. */
  transbordement: { demiJournee: 180, journee: 250, seuilM3: 20 },

  /**
   * Monte-meubles. Règle arrêtée par le client : nécessaire à partir de 25 m³
   * ET d'un 2e étage sans ascenseur. Demi-journée à 260 € ; au-delà de 35 m³,
   * la journée entière à 390 €.
   */
  monteMeubles: {
    demiJournee: 260,
    journee: 390,
    /** Au-delà de ce volume, la demi-journée passe en journée. */
    seuilJourneeM3: 35,
    /** Déclenchement automatique. */
    declenche: { volumeM3: 25, etage: 2 },
  },

  /** Charges lourdes, de 80 à 150 kg. */
  chargeLourde: {
    prix: 120,
    exemples: [
      "aquarium de plus de 150 litres",
      "frigo américain",
      "juke-box",
      "flipper",
      "cave à vin",
      "petit coffre-fort",
      "buffet en bois massif",
    ],
  },

  /**
   * Au-delà de 150 kg : le piano. Les pianos électriques sont légers et
   * n'entrent pas dans cette catégorie.
   */
  piano: { prix: 220, note: "les pianos électriques, légers, n'entrent pas dans cette catégorie" },

  /**
   * On écrit GARANTIE, jamais « assurance » : le client y tient, et les
   * assureurs font la différence. Les deux niveaux, dans ses mots :
   */
  garantie: {
    franchise: 150,
    niveaux: {
      standard: {
        taux: 0.005,
        label: "Garantie dommages standard",
        texte: "Garantie avec tableau de vétusté pour le mobilier.",
      },
      luxe: {
        taux: 0.008,
        label: "Garantie dommages Luxe",
        texte: "Garantie en valeur de remplacement à l'identique et sans vétusté.",
      },
    },
  },
} as const;

export type NiveauGarantie = keyof typeof SUPPLEMENTS.garantie.niveaux;

export const TVA_DEFAUT = 20;

// ---- Contenu des formules (qui fait quoi) ----
export type Acteur = "Bailly" | "Client" | "";

export const PRESTATIONS: {
  categorie: string;
  lignes: { label: string; eco: Acteur; standard: Acteur; luxe: Acteur }[];
}[] = [
  {
    categorie: "Mise à disposition cartons - Emballages",
    lignes: [
      { label: "Vaisselle, verrerie", eco: "Client", standard: "Bailly", luxe: "Bailly" },
      { label: "Vêtements, linge", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Livres, CD, DVD, jouets …", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Matériel electronique, Hi-fi, electroménager ...", eco: "Client", standard: "Bailly", luxe: "Bailly" },
      { label: "Matériel de cuisine", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Matériel de bricolage", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Matelas, sommier, literie", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Objets non fragiles", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Tapis", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Tout autre type d'objets fragiles", eco: "Client", standard: "Bailly", luxe: "Bailly" },
    ],
  },
  {
    categorie: "Démontage",
    lignes: [
      { label: "Démontage des meubles courants (non fixés)", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Démontage des meubles fixés", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Dépose des lustres, cadres", eco: "Client", standard: "Client", luxe: "Client" },
      { label: "Déconnexion de l'éléctroménager", eco: "Client", standard: "Client", luxe: "Client" },
      { label: "Protection des meubles", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
    ],
  },
  {
    categorie: "Transport - Manutention",
    lignes: [
      { label: "Mise à disposition d'un véhicule avec personnel spécialisé", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Manutention : chargement", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Suivi électronique ou par Internet du déménagement", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Frais diverses Fuel, péages... Inclus", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Stationnement prévu devant le domicile", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Manutention : déchargement", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
    ],
  },
  {
    categorie: "Remontage",
    lignes: [
      { label: "Remise en place des meubles au sol", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Remontage des meubles courants (non fixés)", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Connexion de l'électroménager", eco: "Client", standard: "Client", luxe: "Client" },
      { label: "Remontage des meubles fixés", eco: "Client", standard: "Client", luxe: "Client" },
    ],
  },
  {
    categorie: "Déballage de chaque objet",
    lignes: [
      { label: "Vaisselle, verrerie", eco: "Client", standard: "Bailly", luxe: "Bailly" },
      { label: "Vêtements, linge", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Livres, CD, DVD, jouets …", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Matériel electronique, Hi-fi, electroménager ...", eco: "Client", standard: "Bailly", luxe: "Bailly" },
      { label: "Matériel de cuisine", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Matériel de bricolage", eco: "Client", standard: "Client", luxe: "Bailly" },
      { label: "Matelas, sommier", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Tapis,literie", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
      { label: "Tout autre type d'objets fragiles", eco: "Client", standard: "Bailly", luxe: "Bailly" },
      { label: "Récupération des emballages", eco: "Bailly", standard: "Bailly", luxe: "Bailly" },
    ],
  },
];
