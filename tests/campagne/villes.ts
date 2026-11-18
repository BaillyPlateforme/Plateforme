/*
 * Les villes de la campagne : celles de France (Corse et outre-mer compris),
 * telles que la Base Adresse Nationale les rend (nom, code postal, contexte,
 * coordonnées — relevés sur api-adresse.data.gouv.fr le 17/11/2026), servies
 * au navigateur par le test ; et les villes étrangères, avec leurs vraies
 * coordonnées, pour juger la distance que l'application leur prête.
 *
 * Une ville hors de cette table (étrangère, inconnue) part vers la vraie
 * Base Adresse Nationale : c'est ce qu'un visiteur obtiendrait.
 */

export type VilleFr = { nom: string; cp: string; contexte: string; lat: number; lon: number };

export const VILLES: Record<string, VilleFr> = {
  "paris": { nom: "Paris", cp: "75001", contexte: "75, Paris, Île-de-France", lat: 48.859, lon: 2.347 },
  "lyon": { nom: "Lyon", cp: "69001", contexte: "69, Rhône, Auvergne-Rhône-Alpes", lat: 45.758, lon: 4.835 },
  "paris-11e-arrondissement": { nom: "Paris 11e Arrondissement", cp: "75011", contexte: "75, Paris, Île-de-France", lat: 48.8602, lon: 2.3818 },
  "paris-15e-arrondissement": { nom: "Paris 15e Arrondissement", cp: "75015", contexte: "75, Paris, Île-de-France", lat: 48.8416, lon: 2.2953 },
  "lyon-3e-arrondissement": { nom: "Lyon 3e Arrondissement", cp: "69003", contexte: "69, Rhône, Auvergne-Rhône-Alpes", lat: 45.7516, lon: 4.8696 },
  "marseille": { nom: "Marseille", cp: "13001", contexte: "13, Bouches-du-Rhône, Provence-Alpes-Côte d'Azur", lat: 43.282, lon: 5.405 },
  "toulouse": { nom: "Toulouse", cp: "31000", contexte: "31, Haute-Garonne, Occitanie", lat: 43.6041, lon: 1.4338 },
  "nice": { nom: "Nice", cp: "06000", contexte: "06, Alpes-Maritimes, Provence-Alpes-Côte d'Azur", lat: 43.7127, lon: 7.2553 },
  "nantes": { nom: "Nantes", cp: "44000", contexte: "44, Loire-Atlantique, Pays de la Loire", lat: 47.2394, lon: -1.5553 },
  "strasbourg": { nom: "Strasbourg", cp: "67000", contexte: "67, Bas-Rhin, Grand Est", lat: 48.5798, lon: 7.7615 },
  "montpellier": { nom: "Montpellier", cp: "34000", contexte: "34, Hérault, Occitanie", lat: 43.6105, lon: 3.8705 },
  "bordeaux": { nom: "Bordeaux", cp: "33000", contexte: "33, Gironde, Nouvelle-Aquitaine", lat: 44.8519, lon: -0.5879 },
  "lille": { nom: "Lille", cp: "59000", contexte: "59, Nord, Hauts-de-France", lat: 50.631, lon: 3.0454 },
  "rennes": { nom: "Rennes", cp: "35000", contexte: "35, Ille-et-Vilaine, Bretagne", lat: 48.1109, lon: -1.6837 },
  "reims": { nom: "Reims", cp: "51100", contexte: "51, Marne, Grand Est", lat: 49.2509, lon: 4.0556 },
  "le-havre": { nom: "Le Havre", cp: "76600", contexte: "76, Seine-Maritime, Normandie", lat: 49.5073, lon: 0.13 },
  "saint-etienne": { nom: "Saint-Étienne", cp: "42000", contexte: "42, Loire, Auvergne-Rhône-Alpes", lat: 45.4302, lon: 4.37 },
  "toulon": { nom: "Toulon", cp: "83000", contexte: "83, Var, Provence-Alpes-Côte d'Azur", lat: 43.1367, lon: 5.9338 },
  "grenoble": { nom: "Grenoble", cp: "38000", contexte: "38, Isère, Auvergne-Rhône-Alpes", lat: 45.1828, lon: 5.7243 },
  "dijon": { nom: "Dijon", cp: "21000", contexte: "21, Côte-d'Or, Bourgogne-Franche-Comté", lat: 47.332, lon: 5.0336 },
  "angers": { nom: "Angers", cp: "49000", contexte: "49, Maine-et-Loire, Pays de la Loire", lat: 47.4675, lon: -0.5616 },
  "brest": { nom: "Brest", cp: "29200", contexte: "29, Finistère, Bretagne", lat: 48.4061, lon: -4.4977 },
  "clermont-ferrand": { nom: "Clermont-Ferrand", cp: "63000", contexte: "63, Puy-de-Dôme, Auvergne-Rhône-Alpes", lat: 45.7867, lon: 3.1071 },
  "aix-en-provence": { nom: "Aix-en-Provence", cp: "13080", contexte: "13, Bouches-du-Rhône, Provence-Alpes-Côte d'Azur", lat: 43.5414, lon: 5.4061 },
  "evry-courcouronnes": { nom: "Évry-Courcouronnes", cp: "91000", contexte: "91, Essonne, Île-de-France", lat: 48.6273, lon: 2.4325 },
  "massy": { nom: "Massy", cp: "91300", contexte: "91, Essonne, Île-de-France", lat: 48.7281, lon: 2.2696 },
  "corbeil-essonnes": { nom: "Corbeil-Essonnes", cp: "91100", contexte: "91, Essonne, Île-de-France", lat: 48.5982, lon: 2.465 },
  "palaiseau": { nom: "Palaiseau", cp: "91120", contexte: "91, Essonne, Île-de-France", lat: 48.7165, lon: 2.2325 },
  "l-hay-les-roses": { nom: "L'Haÿ-les-Roses", cp: "94240", contexte: "94, Val-de-Marne, Île-de-France", lat: 48.7769, lon: 2.342 },
  "saint-germain-en-laye": { nom: "Saint-Germain-en-Laye", cp: "78100", contexte: "78, Yvelines, Île-de-France", lat: 48.9239, lon: 2.1112 },
  "chalons-en-champagne": { nom: "Châlons-en-Champagne", cp: "51000", contexte: "51, Marne, Grand Est", lat: 48.9553, lon: 4.3683 },
  "besancon": { nom: "Besançon", cp: "25000", contexte: "25, Doubs, Bourgogne-Franche-Comté", lat: 47.2519, lon: 6.0017 },
  "orleans": { nom: "Orléans", cp: "45000", contexte: "45, Loiret, Centre-Val de Loire", lat: 47.8736, lon: 1.9114 },
  "caen": { nom: "Caen", cp: "14000", contexte: "14, Calvados, Normandie", lat: 49.1843, lon: -0.3719 },
  "perpignan": { nom: "Perpignan", cp: "66000", contexte: "66, Pyrénées-Orientales, Occitanie", lat: 42.7015, lon: 2.9028 },
  "pau": { nom: "Pau", cp: "64000", contexte: "64, Pyrénées-Atlantiques, Nouvelle-Aquitaine", lat: 43.316, lon: -0.3431 },
  "la-rochelle": { nom: "La Rochelle", cp: "17000", contexte: "17, Charente-Maritime, Nouvelle-Aquitaine", lat: 46.1575, lon: -1.1706 },
  "annecy": { nom: "Annecy", cp: "74000", contexte: "74, Haute-Savoie, Auvergne-Rhône-Alpes", lat: 45.9016, lon: 6.1253 },
  "chamonix-mont-blanc": { nom: "Chamonix-Mont-Blanc", cp: "74400", contexte: "74, Haute-Savoie, Auvergne-Rhône-Alpes", lat: 45.9484, lon: 6.8932 },
  "le-puy-en-velay": { nom: "Le Puy-en-Velay", cp: "43000", contexte: "43, Haute-Loire, Auvergne-Rhône-Alpes", lat: 45.0318, lon: 3.8997 },
  "saint-malo": { nom: "Saint-Malo", cp: "35400", contexte: "35, Ille-et-Vilaine, Bretagne", lat: 48.6421, lon: -1.9886 },
  "quimper": { nom: "Quimper", cp: "29000", contexte: "29, Finistère, Bretagne", lat: 47.9987, lon: -4.0932 },
  "biarritz": { nom: "Biarritz", cp: "64200", contexte: "64, Pyrénées-Atlantiques, Nouvelle-Aquitaine", lat: 43.4722, lon: -1.5551 },
  "metz": { nom: "Metz", cp: "57000", contexte: "57, Moselle, Grand Est", lat: 49.1084, lon: 6.1949 },
  "nancy": { nom: "Nancy", cp: "54000", contexte: "54, Meurthe-et-Moselle, Grand Est", lat: 48.6881, lon: 6.1713 },
  "mulhouse": { nom: "Mulhouse", cp: "68100", contexte: "68, Haut-Rhin, Grand Est", lat: 47.7517, lon: 7.3265 },
  "limoges": { nom: "Limoges", cp: "87000", contexte: "87, Haute-Vienne, Nouvelle-Aquitaine", lat: 45.8562, lon: 1.2213 },
  "poitiers": { nom: "Poitiers", cp: "86000", contexte: "86, Vienne, Nouvelle-Aquitaine", lat: 46.5866, lon: 0.3567 },
  "tours": { nom: "Tours", cp: "37000", contexte: "37, Indre-et-Loire, Centre-Val de Loire", lat: 47.3955, lon: 0.6958 },
  "rouen": { nom: "Rouen", cp: "76000", contexte: "76, Seine-Maritime, Normandie", lat: 49.4401, lon: 1.0939 },
  "amiens": { nom: "Amiens", cp: "80000", contexte: "80, Somme, Hauts-de-France", lat: 49.903, lon: 2.2926 },
  "avignon": { nom: "Avignon", cp: "84000", contexte: "84, Vaucluse, Provence-Alpes-Côte d'Azur", lat: 43.9363, lon: 4.8489 },
  "nimes": { nom: "Nîmes", cp: "30000", contexte: "30, Gard, Occitanie", lat: 43.8147, lon: 4.3563 },
  "bourg-en-bresse": { nom: "Bourg-en-Bresse", cp: "01000", contexte: "01, Ain, Auvergne-Rhône-Alpes", lat: 46.2049, lon: 5.2411 },
  "saint-jean-de-luz": { nom: "Saint-Jean-de-Luz", cp: "64500", contexte: "64, Pyrénées-Atlantiques, Nouvelle-Aquitaine", lat: 43.3919, lon: -1.6331 },
  "villeneuve-d-ascq": { nom: "Villeneuve-d'Ascq", cp: "59491", contexte: "59, Nord, Hauts-de-France", lat: 50.6376, lon: 3.1483 },
  "ajaccio": { nom: "Ajaccio", cp: "20000", contexte: "2A, Corse-du-Sud, Corse", lat: 41.9337, lon: 8.7153 },
  "bastia": { nom: "Bastia", cp: "20200", contexte: "2B, Haute-Corse, Corse", lat: 42.6876, lon: 9.4352 },
  "porto-vecchio": { nom: "Porto-Vecchio", cp: "20137", contexte: "2A, Corse-du-Sud, Corse", lat: 41.5828, lon: 9.2639 },
  "calvi": { nom: "Calvi", cp: "20260", contexte: "2B, Haute-Corse, Corse", lat: 42.55, lon: 8.7666 },
  "fort-de-france": { nom: "Fort-de-France", cp: "97200", contexte: "972, Martinique", lat: 14.6478, lon: -61.0621 },
  "pointe-a-pitre": { nom: "Pointe-à-Pitre", cp: "97110", contexte: "971, Guadeloupe", lat: 16.2362, lon: -61.5378 },
  "saint-denis-97400": { nom: "Saint-Denis", cp: "97400", contexte: "974, La Réunion", lat: -20.9098, lon: 55.4446 },
  "saint-denis-93200": { nom: "Saint-Denis", cp: "93200", contexte: "93, Seine-Saint-Denis, Île-de-France", lat: 48.9375, lon: 2.3615 },
  "cayenne": { nom: "Cayenne", cp: "97300", contexte: "973, Guyane", lat: 4.9252, lon: -52.3116 },
  "mamoudzou": { nom: "Mamoudzou", cp: "97600", contexte: "976, Mayotte", lat: -12.7977, lon: 45.1976 },
  "vannes": { nom: "Vannes", cp: "56000", contexte: "56, Morbihan, Bretagne", lat: 47.66, lon: -2.7522 },
  "colmar": { nom: "Colmar", cp: "68000", contexte: "68, Haut-Rhin, Grand Est", lat: 48.0818, lon: 7.3526 },
  "arcachon": { nom: "Arcachon", cp: "33120", contexte: "33, Gironde, Nouvelle-Aquitaine", lat: 44.6515, lon: -1.174 },
  "evian-les-bains": { nom: "Évian-les-Bains", cp: "74500", contexte: "74, Haute-Savoie, Auvergne-Rhône-Alpes", lat: 46.3916, lon: 6.5912 },
  "montelimar": { nom: "Montélimar", cp: "26200", contexte: "26, Drôme, Auvergne-Rhône-Alpes", lat: 44.5534, lon: 4.7456 },
  "saint-tropez": { nom: "Saint-Tropez", cp: "83990", contexte: "83, Var, Provence-Alpes-Côte d'Azur", lat: 43.2649, lon: 6.6581 },
  "le-mans": { nom: "Le Mans", cp: "72000", contexte: "72, Sarthe, Pays de la Loire", lat: 47.9933, lon: 0.1912 },
  "troyes": { nom: "Troyes", cp: "10000", contexte: "10, Aube, Grand Est", lat: 48.2928, lon: 4.0751 },
  "cherbourg-en-cotentin": { nom: "Cherbourg-en-Cotentin", cp: "50100", contexte: "50, Manche, Normandie", lat: 49.6287, lon: -1.6332 },
  "bayonne": { nom: "Bayonne", cp: "64100", contexte: "64, Pyrénées-Atlantiques, Nouvelle-Aquitaine", lat: 43.4885, lon: -1.4666 },};

export type CleVille = keyof typeof VILLES;

/** Les villes étrangères : leurs vraies coordonnées, et un code postal plausible. */
export const ETRANGER: Record<string, { pays: string; cp: string; lat: number; lon: number }> = {
  Bruxelles: { pays: "Belgique", cp: "1000", lat: 50.8503, lon: 4.3517 },
  Genève: { pays: "Suisse", cp: "1201", lat: 46.2044, lon: 6.1432 },
  Londres: { pays: "Royaume-Uni", cp: "SW1A 1AA", lat: 51.5074, lon: -0.1278 },
  Berlin: { pays: "Allemagne", cp: "10115", lat: 52.52, lon: 13.405 },
  Barcelone: { pays: "Espagne", cp: "08001", lat: 41.3874, lon: 2.1686 },
  Lisbonne: { pays: "Portugal", cp: "1100-148", lat: 38.7223, lon: -9.1393 },
  Luxembourg: { pays: "Luxembourg", cp: "1111", lat: 49.6116, lon: 6.1319 },
  Montréal: { pays: "Canada", cp: "H2X 1Y4", lat: 45.5019, lon: -73.5674 },
  Marrakech: { pays: "Maroc", cp: "40000", lat: 31.6295, lon: -7.9811 },
  Alger: { pays: "Algérie", cp: "16000", lat: 36.7538, lon: 3.0588 },
  "New York": { pays: "États-Unis", cp: "10001", lat: 40.7128, lon: -74.006 },
  Milan: { pays: "Italie", cp: "20121", lat: 45.4642, lon: 9.19 },
};

export const aplatir = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** La distance à vol d'oiseau, en kilomètres. */
export function volOiseauKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Hors de la France continentale et de la Corse : outre-mer (ou étranger lointain). */
export const outreMer = (p: { lat: number; lon: number }) => !(p.lat > 41 && p.lat < 52 && p.lon > -6 && p.lon < 10);
