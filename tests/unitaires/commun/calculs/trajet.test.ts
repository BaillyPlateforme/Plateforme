import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chercherVille,
  communeDemandee,
  distanceEntrePoints,
  distanceEntreVilles,
  distanceRecevable,
  distanceRoutiereKm,
  distanceUneFois,
  enFrance,
  estOutreMer,
  lieuxDeLaDemande,
  memeCommune,
  routeVraisemblable,
  situerVille,
  territoire,
  territoireDuCodePostal,
  volOiseauKm,
  type Point,
} from "@/lib/trajet";

const PARIS: Point = { lat: 48.8566, lon: 2.3522 };
const LYON: Point = { lat: 45.764, lon: 4.8357 };

/** Une réponse HTTP minimale. */
const reponse = (corps: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => corps }) as unknown as Response;

/** Une commune telle que la Base Adresse Nationale la rend (type=municipality). */
const commune = (name: string, postcode: string, [lon, lat]: [number, number], score = 0.95, population?: number) => ({
  properties: { name, city: name, postcode, score, ...(population != null ? { population } : {}) },
  geometry: { coordinates: [lon, lat] },
});
const ban = (...features: unknown[]) => reponse({ features });

let fetchFaux: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFaux = vi.fn();
  vi.stubGlobal("fetch", fetchFaux);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("volOiseauKm — la distance à vol d'oiseau (haversine)", () => {
  it("zéro entre un point et lui-même", () => {
    expect(volOiseauKm(PARIS, PARIS)).toBe(0);
  });

  it("symétrique", () => {
    expect(volOiseauKm(PARIS, LYON)).toBeCloseTo(volOiseauKm(LYON, PARIS), 9);
  });

  it("Paris – Lyon : environ 392 km à vol d'oiseau", () => {
    expect(volOiseauKm(PARIS, LYON)).toBeGreaterThan(385);
    expect(volOiseauKm(PARIS, LYON)).toBeLessThan(400);
  });

  it("un degré de latitude ≈ 111,19 km (R = 6 371 km : 6371 × π / 180)", () => {
    expect(volOiseauKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo((6371 * Math.PI) / 180, 6);
  });

  it("deux antipodes : la demi-circonférence, π × R", () => {
    expect(volOiseauKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6371, 6);
  });

  it("de part et d'autre de l'antiméridien : courte distance, pas un tour du monde", () => {
    expect(volOiseauKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeCloseTo((6371 * Math.PI) / 180, 6);
  });

  it("inégalité triangulaire", () => {
    const MARSEILLE = { lat: 43.2965, lon: 5.3698 };
    expect(volOiseauKm(PARIS, MARSEILLE)).toBeLessThanOrEqual(volOiseauKm(PARIS, LYON) + volOiseauKm(LYON, MARSEILLE) + 1e-9);
  });
});

describe("situerVille — la Base Adresse Nationale (Géoplateforme, puis l'ancienne adresse), puis OpenStreetMap en repli", () => {
  it("lit les coordonnées de la BAN, dans l'ordre [lon, lat], par la Géoplateforme d'abord", async () => {
    fetchFaux.mockResolvedValueOnce(ban(commune("Lyon 3e Arrondissement", "69003", [4.8357, 45.764])));
    await expect(situerVille("Lyon", "69003")).resolves.toEqual({ lat: 45.764, lon: 4.8357, code_postal: "69003" });
    const url = String(fetchFaux.mock.calls[0][0]);
    expect(url).toContain("data.geopf.fr/geocodage/search");
    expect(url).toContain(`q=${encodeURIComponent("69003 Lyon")}`);
    expect(url).toContain("type=municipality");
  });

  it("la Géoplateforme muette : l'ancienne adresse (api-adresse.data.gouv.fr) en repli", async () => {
    fetchFaux.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(ban(commune("Lyon", "69001", [4.835, 45.758], 0.96)));
    await expect(situerVille("Lyon", null)).resolves.toEqual({ lat: 45.758, lon: 4.835, code_postal: "69001" });
    expect(String(fetchFaux.mock.calls[1][0])).toContain("api-adresse.data.gouv.fr/search/?q=Lyon");
  });

  it("encode les accents et les espaces de la ville", async () => {
    fetchFaux.mockResolvedValueOnce(ban(commune("Saint-Étienne", "42000", [4.39, 45.43])));
    await situerVille("  Saint-Étienne  ", null);
    expect(String(fetchFaux.mock.calls[0][0])).toContain(`q=${encodeURIComponent("Saint-Étienne")}`);
  });

  it("requête trop courte : rien, sans appel réseau", async () => {
    await expect(situerVille(" ", null)).resolves.toBeNull();
    await expect(situerVille("a", "")).resolves.toBeNull();
    expect(fetchFaux).not.toHaveBeenCalled();
  });

  it("ville inconnue de la BAN : rien, et pas de repli (le repli ne sert qu'à la panne)", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ features: [] }));
    await expect(situerVille("Atlantide", null)).resolves.toBeNull();
    expect(fetchFaux).toHaveBeenCalledTimes(1);
  });

  it("coordonnées illisibles de la BAN : rien", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ features: [{ properties: { name: "Lyon", postcode: "69001", score: 0.96 }, geometry: { coordinates: ["x", null] } }] }));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
  });

  it("BAN en panne (HTTP 503, aux deux adresses) : repli sur Nominatim, en France, avec le code postal", async () => {
    fetchFaux
      .mockResolvedValueOnce(reponse("sorry", false, 503))
      .mockResolvedValueOnce(reponse("sorry", false, 503))
      .mockResolvedValueOnce(reponse([{ lat: "45.764", lon: "4.8357", name: "Lyon", addresstype: "city" }]));
    await expect(situerVille("Lyon", "69003")).resolves.toEqual({ lat: 45.764, lon: 4.8357, code_postal: "69003" });
    const url = new URL(String(fetchFaux.mock.calls[2][0]));
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("countrycodes")).toBe("fr");
    expect(url.searchParams.get("city")).toBe("Lyon");
    expect(url.searchParams.get("postalcode")).toBe("69003");
  });

  it("BAN qui lève : repli, et côté serveur l'application se nomme (User-Agent)", async () => {
    fetchFaux
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(reponse([{ lat: "48.8566", lon: "2.3522", name: "Paris" }]));
    await expect(situerVille("Paris", null)).resolves.toEqual({ lat: 48.8566, lon: 2.3522 });
    const init = fetchFaux.mock.calls[2][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^BaillyPlateforme/);
  });

  it("Nominatim : un hameau au nom demandé n'est pas la commune (« Bruxelles », hameau du Loiret)", async () => {
    fetchFaux
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(reponse([{ lat: "47.77", lon: "2.88", name: "Bruxelles", addresstype: "hamlet" }]));
    await expect(situerVille("Bruxelles", null)).resolves.toBeNull();
  });

  it("tous les services en panne : rien, jamais d'exception", async () => {
    fetchFaux.mockRejectedValue(new Error("réseau coupé"));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
  });

  it("Nominatim renvoie une liste vide ou des nombres illisibles : rien", async () => {
    const enPanne = () => fetchFaux.mockResolvedValueOnce(reponse(null, false, 500)).mockResolvedValueOnce(reponse(null, false, 500));
    enPanne().mockResolvedValueOnce(reponse([]));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
    enPanne().mockResolvedValueOnce(reponse([{ lat: "abc", lon: "4", name: "Lyon" }]));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
    enPanne().mockResolvedValueOnce(reponse(null, false, 429));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
  });
});

describe("distanceRoutiereKm — par la route, ou à vol d'oiseau majoré d'un quart", () => {
  it("distance OSRM en mètres, rendue en km arrondis (465 432 m → 465 km)", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ routes: [{ distance: 465432 }] }));
    await expect(distanceRoutiereKm(PARIS, LYON)).resolves.toBe(465);
    expect(String(fetchFaux.mock.calls[0][0])).toContain(`${PARIS.lon},${PARIS.lat};${LYON.lon},${LYON.lat}`);
  });

  it("arrondi au km le plus proche (465 500 m → 466 km)", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ routes: [{ distance: 465500 }] }));
    await expect(distanceRoutiereKm(PARIS, LYON)).resolves.toBe(466);
  });

  it("OSRM en panne : vol d'oiseau × 1,25, arrondi", async () => {
    fetchFaux.mockRejectedValueOnce(new Error("panne"));
    await expect(distanceRoutiereKm(PARIS, LYON)).resolves.toBe(Math.round(volOiseauKm(PARIS, LYON) * 1.25));
  });

  it("OSRM renvoie une distance nulle, négative ou absente : repli", async () => {
    const attendu = Math.round(volOiseauKm(PARIS, LYON) * 1.25);
    for (const corps of [{ routes: [{ distance: 0 }] }, { routes: [{ distance: -5 }] }, { routes: [] }, {}]) {
      fetchFaux.mockResolvedValueOnce(reponse(corps));
      await expect(distanceRoutiereKm(PARIS, LYON)).resolves.toBe(attendu);
    }
  });

  it("le repli ne sous-estime jamais le vol d'oiseau (la route n'est jamais droite)", async () => {
    fetchFaux.mockRejectedValue(new Error("panne"));
    const km = await distanceRoutiereKm(PARIS, LYON);
    expect(km).toBeGreaterThanOrEqual(Math.floor(volOiseauKm(PARIS, LYON)));
  });
});

describe("distanceEntreVilles", () => {
  it("une ville manquante : rien, sans appel réseau", async () => {
    await expect(distanceEntreVilles({ ville: "Paris" }, { ville: null })).resolves.toBeNull();
    await expect(distanceEntreVilles({ ville: "" }, { ville: "Lyon" })).resolves.toBeNull();
    expect(fetchFaux).not.toHaveBeenCalled();
  });

  it("une ville introuvable : rien", async () => {
    fetchFaux.mockImplementation(async (url: string) =>
      url.includes("Atlantide") ? reponse({ features: [] }) : reponse({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }),
    );
    await expect(distanceEntreVilles({ ville: "Paris" }, { ville: "Atlantide" })).resolves.toBeNull();
  });

  it("deux villes connues : la distance routière", async () => {
    fetchFaux.mockImplementation(async (url: string) => {
      if (url.includes("router.project-osrm.org")) return reponse({ routes: [{ distance: 465000 }] });
      if (url.includes("Lyon")) return ban(commune("Lyon", "69001", [4.8357, 45.764]));
      return ban(commune("Paris 11e Arrondissement", "75011", [2.3522, 48.8566]));
    });
    await expect(distanceEntreVilles({ ville: "Paris", code_postal: "75011" }, { ville: "Lyon" })).resolves.toBe(465);
  });
});

/*
 * La campagne de 100 simulations du 18/11/2026 : la Base Adresse Nationale
 * rend toujours la commune française la plus proche du texte tapé, et le
 * service d'itinéraires rapproche l'outre-mer d'une route d'Europe. Les
 * réponses ci-dessous sont celles de la vraie base, relevées ce jour-là.
 */
describe("memeCommune — le nom tapé est-il celui de la commune rendue ?", () => {
  it.each([
    ["Lyon", "Lyon"],
    ["saint-etienne", "Saint-Étienne"],
    ["St Etienne", "Saint-Étienne"],
    ["Ste Maxime", "Sainte-Maxime"],
    ["L'Haÿ-les-Roses", "L'Haÿ-les-Roses"],
    ["  PARIS  ", "Paris"],
    ["Paris", "Paris 11e Arrondissement"],
    ["Paris 15", "Paris 15e Arrondissement"],
    ["Marseille 1er", "Marseille 1er Arrondissement"],
    ["Lyon 3e Arrondissement", "Lyon"],
    ["Paris Cedex 08", "Paris"],
  ])("« %s » = « %s »", (a, b) => {
    expect(memeCommune(a, b)).toBe(true);
  });

  it.each([
    ["Berlin", "Berling"],
    ["Barcelone", "Barcelonne"],
    ["Londres", "Saint-Martin-de-Londres"],
    ["Marrakech", "Mont-de-Marsan"],
    ["Zzyzx-sur-Mer", "Méry-sur-Marne"],
    ["Genève", "Genevrey"],
    ["Paris 15", "Paris 11e Arrondissement"],
    ["Évry", "Évry-Courcouronnes"],
    ["", "Paris"],
  ])("« %s » ≠ « %s »", (a, b) => {
    expect(memeCommune(a, b)).toBe(false);
  });
});

describe("communeDemandee — n'accepter que la ville demandée", () => {
  const BERLING = commune("Berling", "57370", [7.242329, 48.80112], 0.839);
  const BARCELONNE = commune("Barcelonne", "26120", [5.0, 44.85], 0.75);
  const SAINT_MARTIN = commune("Saint-Martin-de-Londres", "34380", [3.73, 43.79], 0.67);
  const MONTREAL = [
    commune("Montréal", "11290", [2.129618, 43.201178], 0.939, 2136),
    commune("Montréal", "32250", [0.211957, 43.952633], 0.936, 1171),
    commune("Montréal", "07110", [4.29813, 44.513479], 0.933, 573),
  ];
  const SAINT_DENIS = [
    commune("Saint-Denis", "97400", [55.444588, -20.909778], 0.958, 155634),
    commune("Saint-Denis", "93200", [2.361503, 48.937483], 0.958, 149077),
    commune("Saint-Denis", "11310", [2.220158, 43.35103], 0.933, 523),
  ];

  it("Berlin → Berling (Moselle) : introuvable, même avec un bon score", () => {
    expect(communeDemandee([BERLING], "Berlin")).toEqual({ introuvable: true });
  });

  it("Barcelone → Barcelonne, Londres → Saint-Martin-de-Londres : introuvables", () => {
    expect(communeDemandee([BARCELONNE], "Barcelone")).toEqual({ introuvable: true });
    expect(communeDemandee([SAINT_MARTIN], "Londres")).toEqual({ introuvable: true });
  });

  it("« 16000 Alger » → Angoulême (16000) : le code postal ne suffit pas, le nom doit être le même", () => {
    expect(communeDemandee([commune("Angoulême", "16000", [0.156, 45.648], 0.5)], "Alger", "16000")).toEqual({ introuvable: true });
  });

  it("Montréal : quatre communes en France, aucune ne l'emporte — homonymes, pas de ville retenue", () => {
    expect(communeDemandee(MONTREAL, "Montréal")).toEqual({ homonymes: true });
  });

  it("Saint-Denis sans code postal : La Réunion et la Seine-Saint-Denis se valent — homonymes", () => {
    expect(communeDemandee(SAINT_DENIS, "Saint-Denis")).toEqual({ homonymes: true });
  });

  it("Saint-Denis avec 93200 : la Seine-Saint-Denis, et elle seule", () => {
    expect(communeDemandee(SAINT_DENIS, "Saint-Denis", "93200")).toEqual({ commune: { lat: 48.937483, lon: 2.361503, code_postal: "93200" } });
  });

  it("Valence : la Drôme est dix fois plus peuplée que ses homonymes, elle l'emporte", () => {
    const r = communeDemandee(
      [commune("Valence", "26000", [4.89, 44.93], 0.954, 64458), commune("Valence", "82400", [0.89, 44.11], 0.943, 5289), commune("Valence", "16460", [0.2, 45.9], 0.928, 192)],
      "Valence",
    );
    expect(r).toEqual({ commune: { lat: 44.93, lon: 4.89, code_postal: "26000" } });
  });

  it("des homonymes sans population connue : homonymes", () => {
    expect(communeDemandee([commune("Beaumont", "63110", [3.08, 45.75], 0.946), commune("Beaumont", "74160", [6.11, 46.1], 0.941)], "Beaumont")).toEqual({ homonymes: true });
  });

  it("Paris et ses arrondissements : une seule ville (même département), retenue", () => {
    const r = communeDemandee([commune("Paris", "75001", [2.347, 48.859], 0.97), commune("Paris 15e Arrondissement", "75015", [2.295, 48.842], 0.869)], "Paris");
    expect(r).toEqual({ commune: { lat: 48.859, lon: 2.347, code_postal: "75001" } });
  });

  it("« Lyon » avec 69003 : Lyon 3e Arrondissement", () => {
    expect(communeDemandee([commune("Lyon 3e Arrondissement", "69003", [4.87, 45.75], 0.866), commune("Lyon", "69001", [4.835, 45.758], 0.575)], "Lyon", "69003")).toEqual({
      commune: { lat: 45.75, lon: 4.87, code_postal: "69003" },
    });
  });

  it("un code postal d'un autre département : la ville n'est pas retenue", () => {
    expect(communeDemandee([commune("Lyon", "69001", [4.835, 45.758], 0.6)], "Lyon", "75011")).toEqual({ introuvable: true });
  });

  it("un score trop faible : écarté, même au bon nom ; sans score (autre source), le nom seul décide", () => {
    expect(communeDemandee([commune("Lyon", "69001", [4.835, 45.758], 0.3)], "Lyon")).toEqual({ introuvable: true });
    expect(communeDemandee([{ properties: { name: "Lyon", postcode: "69001" }, geometry: { coordinates: [4.835, 45.758] } }], "Lyon")).toEqual({ commune: { lat: 45.758, lon: 4.835, code_postal: "69001" } });
    expect(communeDemandee([{ properties: { name: "Berling", postcode: "57370" }, geometry: { coordinates: [7.24, 48.8] } }], "Berlin")).toEqual({ introuvable: true });
  });

  it("une réponse illisible : introuvable, jamais d'exception", () => {
    expect(communeDemandee(null, "Lyon")).toEqual({ introuvable: true });
    expect(communeDemandee([null, 3, { properties: null }], "Lyon")).toEqual({ introuvable: true });
  });
});

describe("chercherVille — la recherche, et ce qu'elle dit au formulaire", () => {
  it("demande cinq réponses, pour trouver la bonne commune parmi elles", async () => {
    fetchFaux.mockResolvedValueOnce(ban(commune("Lyon", "69001", [4.835, 45.758], 0.96)));
    await chercherVille("Lyon");
    expect(String(fetchFaux.mock.calls[0][0])).toContain("limit=5");
  });

  it("« Zzyzx-sur-Mer » : introuvable (la base proposait Méry-sur-Marne)", async () => {
    fetchFaux.mockResolvedValueOnce(ban(commune("Méry-sur-Marne", "77730", [3.2, 48.96], 0.34)));
    await expect(chercherVille("Zzyzx-sur-Mer")).resolves.toEqual({ introuvable: true });
  });

  it("un code postal étranger n'entre pas dans la recherche", async () => {
    fetchFaux.mockResolvedValueOnce(ban());
    await chercherVille("Londres", "SW1A 1AA");
    expect(String(fetchFaux.mock.calls[0][0])).toContain(`q=${encodeURIComponent("Londres")}&`);
  });

  it("les services muets : « panne », sans ville", async () => {
    fetchFaux.mockRejectedValue(new Error("réseau coupé"));
    await expect(chercherVille("Lyon")).resolves.toEqual({ panne: true });
  });

  it("le repli Nominatim exige lui aussi le même nom", async () => {
    fetchFaux
      .mockResolvedValueOnce(reponse(null, false, 503))
      .mockResolvedValueOnce(reponse(null, false, 503))
      .mockResolvedValueOnce(reponse([{ lat: "48.8", lon: "7.24", name: "Berling", addresstype: "village" }]));
    await expect(situerVille("Berlin", null)).resolves.toBeNull();
    expect(String(fetchFaux.mock.calls[2][0])).toContain("nominatim.openstreetmap.org");
  });
});

describe("territoires — la métropole, l'outre-mer, l'étranger", () => {
  it.each([
    ["97200", "972"], ["97400", "974"], ["97110", "971"], ["97300", "973"], ["97600", "976"], ["97500", "975"],
    ["97133", "977"], ["97150", "978"], ["98600", "986"], ["98714", "987"], ["98800", "988"],
    ["75011", "metropole"], ["20000", "metropole"], ["20200", "metropole"], ["06000", "metropole"], [" 69 003", "metropole"],
  ])("%s → %s", (cp, t) => {
    expect(territoireDuCodePostal(cp)).toBe(t);
  });

  it.each([["98000"], ["SW1A 1AA"], ["1000"], ["H2X 1Y4"], [""], [null], [undefined]])("%s → aucun territoire connu", (cp) => {
    expect(territoireDuCodePostal(cp)).toBeNull();
  });

  it("estOutreMer", () => {
    expect(estOutreMer("97200")).toBe(true);
    expect(estOutreMer("75001")).toBe(false);
    expect(estOutreMer("1000")).toBe(false);
  });

  it("sans code postal, la position : la Corse est en métropole, Fort-de-France non", () => {
    expect(territoire({ lat: 41.92, lon: 8.74 })).toBe("metropole");
    expect(territoire({ lat: 14.6, lon: -61.06 })).toBe("hors-metropole");
    expect(territoire({})).toBeNull();
  });

  it("enFrance : la France ou rien de dit", () => {
    for (const p of [undefined, null, "", "France", " france "]) expect(enFrance(p), String(p)).toBe(true);
    for (const p of ["Belgique", "Suisse", "Royaume-Uni", "Autre", 3]) expect(enFrance(p), String(p)).toBe(false);
  });
});

describe("routeVraisemblable — le garde-fou du vol d'oiseau", () => {
  it("Paris → Fort-de-France à 1 940 km par la route (6 852 km à vol d'oiseau) : rejetée", () => {
    expect(routeVraisemblable(1940, 6852)).toBe(false);
  });
  it("La Réunion → Seine-Saint-Denis à 0 km (9 373 km à vol d'oiseau) : rejetée", () => {
    expect(routeVraisemblable(0, 9373)).toBe(false);
  });
  it("démesurée (2 000 km pour 100 km à vol d'oiseau) : rejetée", () => {
    expect(routeVraisemblable(2000, 100)).toBe(false);
  });
  it("Paris → Lyon 465 km pour 392 ; même commune 0 pour 0 ; quartier 2 km pour 0,4 : retenues", () => {
    expect(routeVraisemblable(465, 392)).toBe(true);
    expect(routeVraisemblable(0, 0)).toBe(true);
    expect(routeVraisemblable(2, 0.4)).toBe(true);
  });
});

describe("distanceRoutiereKm, distanceEntrePoints — pas de route vers l'outre-mer", () => {
  const FORT_DE_FRANCE = { lat: 14.647821, lon: -61.062126, code_postal: "97200" };
  const LE_LAMENTIN = { lat: 14.61, lon: -60.99, code_postal: "97232" };

  it("le service répond 1 940 km pour Paris → Fort-de-France : rien", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ routes: [{ distance: 1_940_000 }] }));
    await expect(distanceRoutiereKm(PARIS, FORT_DE_FRANCE)).resolves.toBeNull();
  });

  it("la métropole et la Martinique, La Réunion et la Seine-Saint-Denis : rien, sans même interroger le service", async () => {
    await expect(distanceEntrePoints({ ...PARIS, code_postal: "75001" }, FORT_DE_FRANCE)).resolves.toBeNull();
    await expect(distanceEntrePoints({ lat: -20.9, lon: 55.44, code_postal: "97400" }, { lat: 48.94, lon: 2.36, code_postal: "93200" })).resolves.toBeNull();
    expect(fetchFaux).not.toHaveBeenCalled();
  });

  it("dans un même territoire d'outre-mer, la route vaut", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ routes: [{ distance: 12_000 }] }));
    await expect(distanceEntrePoints(FORT_DE_FRANCE, LE_LAMENTIN)).resolves.toBe(12);
  });

  it("la Corse et le continent : la même métropole", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ routes: [{ distance: 420_000 }] }));
    await expect(distanceEntrePoints({ lat: 42.7, lon: 9.45, code_postal: "20200" }, { lat: 43.3, lon: 5.37, code_postal: "13001" })).resolves.toBe(420);
  });
});

describe("distanceEntreVilles — l'étranger et l'outre-mer côté serveur", () => {
  it("une adresse hors de France : rien, sans appel réseau (la base ne connaît que la France)", async () => {
    await expect(distanceEntreVilles({ ville: "Strasbourg" }, { ville: "Berlin", code_postal: "10115", pays: "Allemagne" })).resolves.toBeNull();
    await expect(distanceEntreVilles({ ville: "New York", pays: "États-Unis" }, { ville: "Paris" })).resolves.toBeNull();
    expect(fetchFaux).not.toHaveBeenCalled();
  });

  it("Paris → Fort-de-France : rien (le service d'itinéraires n'est pas interrogé)", async () => {
    fetchFaux.mockImplementation(async (url: string) => {
      if (url.includes("Fort-de-France")) return ban(commune("Fort-de-France", "97200", [-61.062126, 14.647821], 0.955));
      if (url.includes("router.project-osrm.org")) return reponse({ routes: [{ distance: 1_940_000 }] });
      return ban(commune("Paris", "75001", [2.347, 48.859], 0.97));
    });
    await expect(distanceEntreVilles({ ville: "Paris", code_postal: "75001" }, { ville: "Fort-de-France", code_postal: "97200" })).resolves.toBeNull();
    expect(fetchFaux.mock.calls.some(([u]) => String(u).includes("osrm"))).toBe(false);
  });

  it("« Berlin » tapé sans pays (devis express) : introuvable, donc rien", async () => {
    fetchFaux.mockImplementation(async (url: string) =>
      url.includes("Berlin") ? ban(commune("Berling", "57370", [7.242329, 48.80112], 0.839)) : ban(commune("Strasbourg", "67000", [7.76, 48.58], 0.96)),
    );
    await expect(distanceEntreVilles({ ville: "Strasbourg" }, { ville: "Berlin" })).resolves.toBeNull();
  });
});

describe("distanceRecevable — la distance envoyée par le formulaire", () => {
  it("France métropolitaine : gardée", () => {
    expect(distanceRecevable(465, { code_postal: "75001" }, { code_postal: "69001", pays: "France" })).toBe(465);
    expect(distanceRecevable(12, {}, {})).toBe(12);
  });
  it("l'étranger : écartée", () => {
    expect(distanceRecevable(63, { code_postal: "67000" }, { code_postal: "10115", pays: "Allemagne" })).toBeNull();
  });
  it("l'outre-mer vers la métropole : écartée ; dans un même territoire : gardée", () => {
    expect(distanceRecevable(1940, { code_postal: "75001" }, { code_postal: "97200" })).toBeNull();
    expect(distanceRecevable(0, { code_postal: "97400" }, { code_postal: "93200" })).toBeNull();
    expect(distanceRecevable(12, { code_postal: "97200" }, { code_postal: "97232" })).toBe(12);
  });
  it("rien, ou un nombre illisible : rien", () => {
    expect(distanceRecevable(undefined, {}, {})).toBeNull();
    expect(distanceRecevable(Number.NaN, {}, {})).toBeNull();
  });
});

describe("lieuxDeLaDemande, distanceUneFois — une seule distance par demande", () => {
  const demande = {
    depart_ville: "Paris", depart_code_postal: "75001", depart_adresse: null,
    arrivee_ville: "Lyon", arrivee_code_postal: "69001", arrivee_adresse: null,
    raw_payload: { details: { arrivee: { pays: "France" } } },
  };

  it("le pays de chaque adresse vient du formulaire (details.depart.pays)", () => {
    expect(lieuxDeLaDemande({ ...demande, raw_payload: { details: { arrivee: { pays: "Suisse" } } } }).arrivee).toEqual({ ville: "Lyon", code_postal: "69001", adresse: null, pays: "Suisse" });
    expect(lieuxDeLaDemande({ ...demande, raw_payload: null }).depart).toEqual({ ville: "Paris", code_postal: "75001", adresse: null });
  });

  it("demandée deux fois en même temps (chiffrage et Créagidem) : un seul calcul, une seule valeur", async () => {
    fetchFaux.mockImplementation(async (url: string) => {
      if (url.includes("router.project-osrm.org")) return reponse({ routes: [{ distance: 465_000 }] });
      if (url.includes("Lyon")) return ban(commune("Lyon", "69001", [4.835, 45.758], 0.96));
      return ban(commune("Paris", "75001", [2.347, 48.859], 0.97));
    });
    const distance = distanceUneFois(demande);
    const [a, b] = await Promise.all([distance(), distance()]);
    expect(a).toBe(465);
    expect(b).toBe(465);
    expect(fetchFaux).toHaveBeenCalledTimes(3); // deux villes, une route
  });

  it("un calcul qui échoue : rien, sans lever", async () => {
    fetchFaux.mockRejectedValue(new Error("réseau coupé"));
    await expect(distanceUneFois(demande)()).resolves.toBeNull();
  });
});
