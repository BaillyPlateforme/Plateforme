// ============================================================
// Grille tarifaire Bailly — extraite des fichiers de référence.
//
//   GRILLEDAVIDIAV2.xlsx            → onglets « GRILLE » et « particularités »
//   Copie de Catégories prestations.xlsx → contenu des trois formules
//
// Source de vérité du chiffrage : ce fichier. Toute évolution de tarif
// se fait ici, en une seule modification, et se voit dans l'historique.
// ============================================================

export type Formule = "eco" | "standard" | "luxe";

export const FORMULES: { key: Formule; label: string; description: string }[] = [
  { key: "eco", label: "Économique", description: "Le client emballe, Bailly transporte et remonte." },
  { key: "standard", label: "Standard", description: "Bailly emballe le fragile et l'électroménager." },
  { key: "luxe", label: "Premium", description: "Bailly emballe et déballe tout, y compris les meubles fixés." },
];

// Tranches de volume, en m³ (la dernière est ouverte : au-delà de 100 m³).
export const TRANCHES_VOLUME: { min: number; max: number | null; label: string }[] = [
  { min: 5, max: 10, label: "5 à 10 m³" },
  { min: 11, max: 20, label: "11 à 20 m³" },
  { min: 21, max: 30, label: "21 à 30 m³" },
  { min: 31, max: 40, label: "31 à 40 m³" },
  { min: 41, max: 50, label: "41 à 50 m³" },
  { min: 51, max: 60, label: "51 à 60 m³" },
  { min: 61, max: 70, label: "61 à 70 m³" },
  { min: 71, max: 80, label: "71 à 80 m³" },
  { min: 81, max: 90, label: "81 à 90 m³" },
  { min: 91, max: 100, label: "91 à 100 m³" },
  { min: 101, max: null, label: "plus de 100 m³" },
];

// Tranches de distance, en km.
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
 * Prix au m³ de la formule standard : une ligne par tranche de distance,
 * une colonne par tranche de volume (mêmes ordres que les tableaux ci-dessus).
 */
export const TARIFS_STANDARD: number[][] = [
  [50, 35, 35, 35, 33, 33, 32, 32, 32, 32, 32], // 0–50 km
  [55, 45, 40, 40, 38, 38, 36, 36, 36, 36, 36], // 51–100 km
  [65, 55, 52, 52, 45, 45, 42, 42, 42, 42, 42], // 101–200 km
  [75, 65, 60, 60, 55, 55, 50, 50, 50, 50, 50], // 201–300 km
  [80, 70, 68, 68, 60, 60, 55, 55, 55, 55, 55], // 301–400 km
  [85, 73, 72, 72, 65, 65, 58, 58, 58, 58, 58], // 401–500 km
  [90, 80, 76, 76, 70, 70, 62, 62, 62, 62, 62], // 501–600 km
  [95, 86, 82, 82, 76, 76, 68, 68, 68, 68, 68], // 601–700 km
  [100, 92, 89, 89, 80, 80, 72, 72, 72, 72, 72], // 701–800 km
  [110, 102, 92, 92, 85, 85, 80, 80, 80, 80, 80], // 801–900 km
  [115, 110, 94, 94, 88, 88, 82, 82, 82, 82, 82], // 901–1000 km
  [125, 120, 103, 103, 90, 90, 85, 85, 85, 85, 85], // 1001–1100 km
  [135, 125, 112, 112, 95, 95, 88, 88, 88, 88, 88], // 1101–1200 km
];

/**
 * Les formules économique et premium sont, dans le fichier de référence,
 * exactement la formule standard multipliée par un coefficient — vérifié
 * cellule par cellule sur les 143 valeurs des trois tableaux.
 */
export const COEFFICIENTS: Record<Formule, number> = {
  eco: 0.92,
  standard: 1,
  luxe: 1.15,
};

// ---- Suppléments (onglet « particularités », prix HT) ----
export const SUPPLEMENTS = {
  /** Date imposée par le client : majoration du transport. */
  voyageSpecialPct: 0.15,
  /** Portage au-delà de 20 m, par tranche de 20 m entamée, au m³. */
  portage: { seuilMetres: 20, trancheMetres: 20, prixParM3: 2.2 },
  /** Camion porteur inaccessible : navette avec un véhicule plus petit. */
  transbordement: { demiJournee: 180, journee: 250, seuilM3: 20 },
  /** Monte-meubles avec opérateur. */
  monteMeubles: { demiJournee: 260, journee: 390, seuilM3: 30 },
  /** Portage de charges lourdes, à l'unité. */
  pianoDroit: 220,
  chargeLourde: 120,
  /** Garantie nationale : pourcentage de la valeur déclarée. */
  assurance: { taux: 0.005, franchise: 150 },
} as const;

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
