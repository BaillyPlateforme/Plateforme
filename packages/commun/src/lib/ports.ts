// Les ports d'embarquement et de débarquement d'un déménagement par la mer.
//
// Céline (mail « BAILLY - militaire » du 18/11/2026) : une case « Port » dans
// l'adresse de départ et une dans l'adresse de livraison ; les kilomètres se
// comptent par la route de l'adresse au port, et à vol d'oiseau d'un port à
// l'autre. Les dossiers CIMOB/DICOM partent ou reviennent d'outre-mer, d'où
// ce référentiel : les ports de commerce de métropole (Corse comprise) d'où
// partent les conteneurs, et ceux de chaque territoire d'outre-mer.
//
// Les coordonnées sont celles des installations portuaires, à quelques
// kilomètres près : relevées le 18/11/2026 dans les points d'intérêt de la
// Géoplateforme de l'IGN (data.geopf.fr/geocodage, index « poi »), et dans
// OpenStreetMap pour la Polynésie, la Nouvelle-Calédonie et Wallis, que la
// Géoplateforme ne couvre pas. La liste reste à valider par Bailly.
//
// Un port tapé librement n'est pas dans ce module : le calcul le situe à part
// (apps/interne : crm/creation/distance.ts). Ce module ne lit ni la base ni le
// réseau : il se charge des deux côtés, et se teste seul.

import { aplatirNom } from "./trajet";

export interface PortConnu {
  /** Le nom proposé dans la liste et affiché dans les distances. */
  nom: string;
  /** Ce qui l'accompagne dans la liste : son département, sa région ou sa collectivité. */
  lieu: string;
  /** Son territoire, comme lib/trajet.ts : « metropole » (Corse comprise) ou un code d'outre-mer (971…988). */
  territoire: string;
  lat: number;
  lon: number;
  /** D'autres noms sous lesquels on le tape (sa commune, son terminal, son territoire). */
  aussi?: string[];
}

export const PORTS: PortConnu[] = [
  // Métropole, du nord au sud par la Manche et l'Atlantique, puis la Méditerranée et la Corse.
  { nom: "Dunkerque", lieu: "Nord", territoire: "metropole", lat: 51.0616, lon: 2.3487 },
  { nom: "Calais", lieu: "Pas-de-Calais", territoire: "metropole", lat: 50.972, lon: 1.8512 },
  // Port 2000, où accostent les porte-conteneurs.
  { nom: "Le Havre", lieu: "Seine-Maritime", territoire: "metropole", lat: 49.4571, lon: 0.1597, aussi: ["Port 2000"] },
  { nom: "Rouen", lieu: "Seine-Maritime", territoire: "metropole", lat: 49.405, lon: 1.0204 },
  { nom: "Cherbourg", lieu: "Manche", territoire: "metropole", lat: 49.6482, lon: -1.602, aussi: ["Cherbourg-en-Cotentin"] },
  { nom: "Brest", lieu: "Finistère", territoire: "metropole", lat: 48.3846, lon: -4.4737 },
  // Le port de Nantes-Saint-Nazaire : ses terminaux de Montoir.
  { nom: "Montoir-de-Bretagne", lieu: "Loire-Atlantique · Nantes-Saint-Nazaire", territoire: "metropole", lat: 47.297, lon: -2.17, aussi: ["Montoir", "Saint-Nazaire", "Nantes-Saint-Nazaire"] },
  { nom: "La Rochelle", lieu: "Charente-Maritime · La Pallice", territoire: "metropole", lat: 46.164, lon: -1.2156, aussi: ["La Pallice"] },
  // Le port de Bordeaux : ses terminaux de Bassens.
  { nom: "Bordeaux", lieu: "Gironde · Bassens", territoire: "metropole", lat: 44.8979, lon: -0.5335, aussi: ["Bassens"] },
  { nom: "Sète", lieu: "Hérault", territoire: "metropole", lat: 43.4038, lon: 3.7198 },
  { nom: "Fos-sur-Mer", lieu: "Bouches-du-Rhône · Marseille-Fos", territoire: "metropole", lat: 43.4309, lon: 4.8668, aussi: ["Fos"] },
  { nom: "Marseille", lieu: "Bouches-du-Rhône · Marseille-Fos", territoire: "metropole", lat: 43.3316, lon: 5.3486 },
  { nom: "Toulon", lieu: "Var", territoire: "metropole", lat: 43.1171, lon: 5.9301 },
  { nom: "Nice", lieu: "Alpes-Maritimes", territoire: "metropole", lat: 43.6942, lon: 7.2861 },
  { nom: "Ajaccio", lieu: "Corse-du-Sud", territoire: "metropole", lat: 41.9188, lon: 8.7415 },
  { nom: "Bastia", lieu: "Haute-Corse", territoire: "metropole", lat: 42.7022, lon: 9.453 },

  // Outre-mer, dans l'ordre des codes.
  { nom: "Pointe-à-Pitre (Jarry)", lieu: "Guadeloupe", territoire: "971", lat: 16.2292, lon: -61.5472, aussi: ["Pointe-à-Pitre", "Jarry", "Baie-Mahault", "Guadeloupe"] },
  { nom: "Fort-de-France", lieu: "Martinique", territoire: "972", lat: 14.5947, lon: -61.0474, aussi: ["Martinique"] },
  { nom: "Dégrad-des-Cannes", lieu: "Guyane · Rémire-Montjoly", territoire: "973", lat: 4.8549, lon: -52.2751, aussi: ["Rémire-Montjoly", "Cayenne", "Guyane"] },
  // Port Réunion, le port de commerce de l'île, sur la commune du Port.
  { nom: "Le Port (La Réunion)", lieu: "La Réunion", territoire: "974", lat: -20.9315, lon: 55.321, aussi: ["Le Port", "Port Réunion", "La Réunion"] },
  { nom: "Saint-Pierre (Saint-Pierre-et-Miquelon)", lieu: "Saint-Pierre-et-Miquelon", territoire: "975", lat: 46.7847, lon: -56.1686, aussi: ["Saint-Pierre-et-Miquelon"] },
  { nom: "Longoni", lieu: "Mayotte · Koungou", territoire: "976", lat: -12.7222, lon: 45.1662, aussi: ["Mayotte", "Koungou"] },
  { nom: "Gustavia", lieu: "Saint-Barthélemy", territoire: "977", lat: 17.897, lon: -62.8503, aussi: ["Saint-Barthélemy"] },
  { nom: "Marigot (Galisbay)", lieu: "Saint-Martin", territoire: "978", lat: 18.0833, lon: -63.0847, aussi: ["Marigot", "Galisbay", "Saint-Martin"] },
  { nom: "Mata-Utu", lieu: "Wallis-et-Futuna", territoire: "986", lat: -13.282, lon: -176.174, aussi: ["Wallis", "Wallis-et-Futuna"] },
  { nom: "Papeete", lieu: "Polynésie française", territoire: "987", lat: -17.533, lon: -149.5703, aussi: ["Tahiti", "Polynésie française"] },
  { nom: "Nouméa", lieu: "Nouvelle-Calédonie", territoire: "988", lat: -22.2668, lon: 166.4323, aussi: ["Nouvelle-Calédonie"] },
];

/**
 * Un nom de port sous sa forme comparable : celle de lib/trajet.ts (sans
 * accent ni ponctuation), sans « Port de », « Port du », « Terminal de »…
 * ni article devant le nom : « Port du Havre », « Le Havre » et « havre » se
 * rejoignent. Ce qui ne laisserait rien (« Port ») reste tel quel.
 */
export function cleDuPort(texte: string): string {
  const a = aplatirNom(texte);
  const b = a
    .replace(/^(?:grand port maritime|port autonome|port|terminal|gare maritime)(?: (?:de la|de l|des|du|de|d))? /, "")
    .replace(/^(?:le|la|les|l) /, "")
    .trim();
  return b || a;
}

const INDEX: Map<string, PortConnu> = (() => {
  const m = new Map<string, PortConnu>();
  for (const p of PORTS)
    for (const n of [p.nom, ...(p.aussi ?? [])]) {
      for (const k of [aplatirNom(n), cleDuPort(n)]) if (k && !m.has(k)) m.set(k, p);
    }
  return m;
})();

/** Le port du référentiel que désigne un texte (son nom, ou un autre de ses noms) ; sinon rien : c'est un port saisi librement. */
export function trouverPort(texte: string | null | undefined): PortConnu | null {
  const t = (texte ?? "").trim();
  if (!t) return null;
  return INDEX.get(aplatirNom(t)) ?? INDEX.get(cleDuPort(t)) ?? null;
}

/**
 * « port du Havre », « port de Fort-de-France », « port d'Ajaccio » : le port
 * dans une phrase. Un nom saisi qui commence déjà par « Port » reste tel quel
 * (« Port de Saint-Malo » donne « port de Saint-Malo »).
 */
export function portDe(nom: string, majuscule = false): string {
  const n = nom.trim();
  let phrase: string;
  if (/^port\s/i.test(n)) phrase = `port${n.slice(4)}`;
  else if (/^le\s/i.test(n)) phrase = `port du ${n.slice(3).trimStart()}`;
  else if (/^les\s/i.test(n)) phrase = `port des ${n.slice(4).trimStart()}`;
  else if (/^[aeiouy]/i.test(n.normalize("NFD"))) phrase = `port d’${n}`;
  else phrase = `port de ${n}`;
  return majuscule ? `P${phrase.slice(1)}` : phrase;
}
