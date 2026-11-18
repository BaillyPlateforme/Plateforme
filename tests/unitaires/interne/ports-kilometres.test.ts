import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn() }));

import { q } from "@/crm/lib/db";
import { communeDuPort, distanceTrajet, distancesTrajet, majDistanceDossier, memeRive, situerPort, type PointTrajet } from "@/crm/creation/distance";
import {
  SANS_KM, casePortVisible, cotesDuTrajet, horsMetropole, kilometresDuDossier, kmEnBref, kmLisibles, kmRecevable, lignesKilometres, portsDuTrajet,
} from "@/crm/creation/kilometres";
import { adresseDepuisEtape, lireLieux } from "@/crm/creation/commun";
import { PORTS } from "@/lib/ports";
import { volOiseauKm, type Point } from "@/lib/trajet";

/*
 * Les kilomètres d'un dossier par la mer (Céline, 18/11/2026) : une case Port
 * au départ et à la livraison ; la route de l'adresse au port, la mer à vol
 * d'oiseau d'un port à l'autre. Sans port, le calcul d'avant. Aucun service
 * appelé : la Base Adresse et le calcul d'itinéraire sont simulés.
 */

const port = (nom: string) => PORTS.find((p) => p.nom === nom)!;

/** Les adresses que la Base Adresse « connaît » : [lon, lat], comme ses réponses. */
const ADRESSES: Record<string, [number, number]> = {
  "12 Rue de la Paix, 75002 Paris": [2.3311, 48.8698],
  "8 Avenue de Paris, 94300 Vincennes": [2.4381, 48.8475],
  "Rue Victor Hugo, 97200 Fort-de-France": [-61.0705, 14.6033],
  "5 Place Bellecour, 69002 Lyon": [4.8322, 45.7578],
};
/** Les communes (type=municipality) : nom, code postal, [lon, lat]. */
const COMMUNES: Record<string, { name: string; postcode: string; c: [number, number] }[]> = {
  "Saint-Malo": [{ name: "Saint-Malo", postcode: "35400", c: [-2.0257, 48.6493] }],
  // La base rend la commune la plus proche du texte : jamais Anvers (Belgique).
  Anvers: [{ name: "Auvers-sur-Oise", postcode: "95430", c: [2.1706, 49.0717] }],
};

const reponse = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
/** La route simulée : le vol d'oiseau de proche en proche, majoré d'un cinquième, en kilomètres entiers. */
const routeSimulee = (points: Point[]) => {
  let vol = 0;
  for (let i = 1; i < points.length; i++) vol += volOiseauKm(points[i - 1], points[i]);
  return Math.round(vol * 1.2);
};

let routesDemandees: Point[][];
let osrmEnPanne: boolean;
let fetchFaux: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Les réponses déjà obtenues sont retenues le temps du serveur : chaque test repart de zéro.
  const g = globalThis as unknown as { __crmSitues?: Map<string, unknown>; __crmRoutes?: Map<string, unknown> };
  g.__crmSitues?.clear();
  g.__crmRoutes?.clear();
  routesDemandees = [];
  osrmEnPanne = false;
  fetchFaux = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.hostname === "router.project-osrm.org") {
      if (osrmEnPanne) throw new Error("hors service");
      const points = u.pathname.split("/").pop()!.split(";").map((x) => {
        const [lon, lat] = x.split(",").map(Number);
        return { lat, lon };
      });
      routesDemandees.push(points);
      return reponse({ routes: [{ distance: routeSimulee(points) * 1000 }] });
    }
    const texte = u.searchParams.get("q") ?? "";
    if (u.searchParams.get("type") === "municipality") {
      const l = COMMUNES[texte] ?? [];
      return reponse({ features: l.map((x) => ({ properties: { name: x.name, city: x.name, postcode: x.postcode, score: 0.9 }, geometry: { coordinates: x.c } })) });
    }
    const c = ADRESSES[texte];
    return reponse({ features: c ? [{ geometry: { coordinates: c } }] : [] });
  });
  vi.stubGlobal("fetch", fetchFaux);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(q).mockReset();
});

const pt = (adresse: string): Point => ({ lon: ADRESSES[adresse][0], lat: ADRESSES[adresse][1] });
const PARIS = "12 Rue de la Paix, 75002 Paris";
const VINCENNES = "8 Avenue de Paris, 94300 Vincennes";
const FDF = "Rue Victor Hugo, 97200 Fort-de-France";
const LYON = "5 Place Bellecour, 69002 Lyon";

describe("sans port : le calcul d'avant, inchangé", () => {
  it("d'une adresse à la suivante, un seul appel au calcul d'itinéraire, rien pour la mer", async () => {
    const etapes: PointTrajet[] = [{ genre: "depart", adresse: PARIS }, { genre: "arrivee", adresse: LYON }];
    const k = await distancesTrajet(etapes);
    expect(k).toEqual({ km: routeSimulee([pt(PARIS), pt(LYON)]), versPort: null, mer: null, depuisPort: null });
    expect(k.km).toBe(await distanceTrajet(etapes));
    expect(routesDemandees).toHaveLength(1);
  });
  it("une adresse introuvable : pas de km", async () => {
    expect(await distancesTrajet([{ genre: "depart", adresse: PARIS }, { genre: "arrivee", adresse: "Quelque part d'inconnu" }])).toEqual(SANS_KM);
  });
  it("des étapes sans genre (l'ancien écran) : tout le trajet, comme avant", async () => {
    const k = await distancesTrajet([{ adresse: PARIS }, { adresse: VINCENNES }, { adresse: LYON }]);
    expect(k.km).toBe(routeSimulee([pt(PARIS), pt(VINCENNES), pt(LYON)]));
  });
});

describe("avec deux ports : la route jusqu'au port, la mer à vol d'oiseau, la route depuis le port", () => {
  const etapes: PointTrajet[] = [
    { genre: "depart", adresse: PARIS },
    { genre: "depart", adresse: VINCENNES, port: "Le Havre" },
    { genre: "arrivee", adresse: FDF, port: "Port de Fort-de-France" },
  ];
  it("trois distances, la route en tout = la somme des deux tronçons routiers", async () => {
    const k = await distancesTrajet(etapes);
    const havre = port("Le Havre"), fdf = port("Fort-de-France");
    const versPort = routeSimulee([pt(PARIS), pt(VINCENNES), havre]);
    const depuisPort = routeSimulee([fdf, pt(FDF)]);
    expect(k).toEqual({ versPort, depuisPort, mer: Math.round(volOiseauKm(havre, fdf)), km: versPort + depuisPort });
    expect(k.mer).toBeGreaterThan(6500);
    // Jamais un itinéraire routier qui traverserait l'océan.
    expect(routesDemandees).toHaveLength(2);
    for (const r of routesDemandees) expect(new Set(r.map((p) => (p.lon < -40 ? "antilles" : "europe"))).size).toBe(1);
  });
  it("le calcul d'itinéraire en panne : chaque tronçon au vol d'oiseau majoré d'un quart, la mer inchangée", async () => {
    osrmEnPanne = true;
    const k = await distancesTrajet(etapes);
    expect(k.depuisPort).toBe(Math.round(volOiseauKm(port("Fort-de-France"), pt(FDF)) * 1.25));
    expect(k.mer).toBe(Math.round(volOiseauKm(port("Le Havre"), port("Fort-de-France"))));
  });
  it("le port de départ : celui du dernier chargement qui en note un ; un garde-meuble reste du côté du départ", () => {
    const c = cotesDuTrajet([
      { genre: "depart", port: "Marseille" }, { genre: "depart", port: " Le Havre " }, { genre: "garde_meuble" },
      { genre: "arrivee" }, { genre: "arrivee", port: "Fort-de-France" }, { genre: "arrivee", port: "Nouméa" },
    ]);
    expect(c.portDepart).toBe("Le Havre");
    expect(c.portArrivee).toBe("Fort-de-France");
    expect(c.avant.map((e) => e.genre)).toEqual(["depart", "depart", "garde_meuble"]);
    expect(c.apres).toHaveLength(3);
  });
});

describe("un seul port : ce qu'il permet, rien de plus", () => {
  it("le port d'arrivée seul : la route depuis le port ; ni mer, ni route en tout", async () => {
    const k = await distancesTrajet([{ genre: "depart", adresse: PARIS }, { genre: "arrivee", adresse: FDF, port: "Fort-de-France" }]);
    expect(k).toEqual({ km: null, versPort: null, mer: null, depuisPort: routeSimulee([port("Fort-de-France"), pt(FDF)]) });
  });
  it("le port de départ seul, sans encore de livraison : la route jusqu'au port", async () => {
    const k = await distancesTrajet([{ genre: "depart", adresse: PARIS, port: "Le Havre" }]);
    expect(k).toEqual({ km: null, versPort: routeSimulee([pt(PARIS), port("Le Havre")]), mer: null, depuisPort: null });
  });
});

describe("un port saisi librement", () => {
  it("introuvable (la base rend une autre commune) : son tronçon et la mer restent sans km", async () => {
    const k = await distancesTrajet([{ genre: "depart", adresse: PARIS, port: "Anvers" }, { genre: "arrivee", adresse: FDF, port: "Fort-de-France" }]);
    expect(k.versPort).toBeNull();
    expect(k.mer).toBeNull();
    expect(k.km).toBeNull();
    expect(k.depuisPort).toBe(routeSimulee([port("Fort-de-France"), pt(FDF)]));
    expect(await situerPort("Anvers")).toBeNull();
  });
  it("une commune que la base connaît sous ce nom exactement : situé comme elle", async () => {
    const p = await situerPort("Port de Saint-Malo");
    expect(p).toEqual({ lat: 48.6493, lon: -2.0257, territoire: "metropole" });
    const k = await distancesTrajet([{ genre: "depart", adresse: PARIS, port: "Port de Saint-Malo" }]);
    expect(k.versPort).toBe(routeSimulee([pt(PARIS), { lat: 48.6493, lon: -2.0257 }]));
  });
  it("avec un code postal : situé comme une adresse", async () => {
    expect(await situerPort(LYON)).toEqual({ lat: 45.7578, lon: 4.8322, territoire: "metropole" });
  });
  it("« Port de … » donne la commune, son article rendu ; « Port-Vendres » est une commune", () => {
    expect(communeDuPort("Port de Saint-Malo")).toBe("Saint-Malo");
    expect(communeDuPort("port d'Ajaccio")).toBe("Ajaccio");
    expect(communeDuPort("Port du Havre")).toBe("Le Havre");
    expect(communeDuPort("Port de La Turballe")).toBe("La Turballe");
    expect(communeDuPort("Port de l'Île-Rousse")).toBe("L'Île-Rousse");
    expect(communeDuPort("Port des Sables-d'Olonne")).toBe("Les Sables-d'Olonne");
    expect(communeDuPort("Port-Vendres")).toBe("Port-Vendres");
    expect(communeDuPort("Saint-Malo")).toBe("Saint-Malo");
  });
});

describe("la route ne traverse pas la mer", () => {
  it("un port d'outre-mer noté au départ de Paris : pas de route, et aucun appel au calcul d'itinéraire", async () => {
    const k = await distancesTrajet([{ genre: "depart", adresse: PARIS, port: "Fort-de-France" }, { genre: "arrivee", adresse: FDF, port: "Le Havre" }]);
    expect(k.versPort).toBeNull();
    expect(k.depuisPort).toBeNull();
    expect(k.km).toBeNull();
    expect(k.mer).toBe(Math.round(volOiseauKm(port("Le Havre"), port("Fort-de-France"))));
    expect(routesDemandees).toHaveLength(0);
  });
  it("deux territoires : le même, ou un inconnu ; « hors-metropole » ne contredit que la métropole", () => {
    expect(memeRive("metropole", "metropole")).toBe(true);
    expect(memeRive("972", "972")).toBe(true);
    expect(memeRive(null, "972")).toBe(true);
    expect(memeRive("metropole", "972")).toBe(false);
    expect(memeRive("971", "972")).toBe(false);
    expect(memeRive("hors-metropole", "972")).toBe(true);
    expect(memeRive("hors-metropole", "metropole")).toBe(false);
  });
});

describe("l'enregistrement sur le dossier", () => {
  it("relit les étapes avec leur port, puis écrit les quatre colonnes", async () => {
    vi.mocked(q).mockImplementation((async (sql: string) =>
      sql.startsWith("select") ? [{ genre: "depart", adresse: PARIS, port: "Le Havre" }, { genre: "arrivee", adresse: FDF, port: "Fort-de-France" }] : []) as typeof q);
    const km = await majDistanceDossier(42);
    const [select, update] = vi.mocked(q).mock.calls;
    expect(select[0]).toContain("port");
    expect(update[0]).toMatch(/distance_km=\$2, distance_vers_port_km=\$3, distance_mer_km=\$4, distance_depuis_port_km=\$5/);
    const versPort = routeSimulee([pt(PARIS), port("Le Havre")]), depuisPort = routeSimulee([port("Fort-de-France"), pt(FDF)]);
    expect(update[1]).toEqual([42, versPort + depuisPort, versPort, Math.round(volOiseauKm(port("Le Havre"), port("Fort-de-France"))), depuisPort]);
    expect(km).toBe(versPort + depuisPort);
  });
  it("sans port : les trois distances de la mer restent vides", async () => {
    vi.mocked(q).mockImplementation((async (sql: string) => (sql.startsWith("select") ? [{ genre: "depart", adresse: PARIS }, { genre: "arrivee", adresse: LYON }] : [])) as typeof q);
    await majDistanceDossier(7);
    expect(vi.mocked(q).mock.calls[1][1]).toEqual([7, routeSimulee([pt(PARIS), pt(LYON)]), null, null, null]);
  });
});

describe("l'affichage", () => {
  const ports = { depart: "Le Havre", arrivee: "Fort-de-France" };
  it("trois lignes, l'une sous l'autre, aucun total qui mélange la route et la mer", () => {
    expect(lignesKilometres({ km: 222, versPort: 210, mer: 6850, depuisPort: 12 }, ports)).toEqual([
      `Départ → port du Havre : ${kmLisibles(210)} par la route`,
      `Le Havre → Fort-de-France : ${kmLisibles(6850)} à vol d’oiseau`,
      `Port de Fort-de-France → livraison : ${kmLisibles(12)} par la route`,
    ]);
    expect(kmLisibles(6850)).toMatch(/^6\s850 km$/u);
  });
  it("un tronçon inconnu le dit ; un port qui manque est « à indiquer » ; un port libre reste tel quel", () => {
    expect(lignesKilometres(SANS_KM, { depart: "Martinique", arrivee: null })).toEqual([
      "Départ → port de Fort-de-France : km non calculés",
      "Fort-de-France → port d’arrivée : à indiquer",
    ]);
    expect(lignesKilometres({ ...SANS_KM, depuisPort: 12 }, { depart: null, arrivee: "Port de Saint-Malo" })).toEqual([
      "Port de départ → Port de Saint-Malo : à indiquer",
      `Port de Saint-Malo → livraison : ${kmLisibles(12)} par la route`,
    ]);
  });
  it("sans port : aucune ligne (l'affichage d'avant vaut)", () => {
    expect(lignesKilometres({ ...SANS_KM, km: 465 }, { depart: null, arrivee: null })).toEqual([]);
  });
  it("en bref : « 465 km » sans port, comme avant ; par la mer, la route et la mer côte à côte", () => {
    expect(kmEnBref({ ...SANS_KM, km: 465 }, { depart: null, arrivee: null })).toEqual([kmLisibles(465)]);
    expect(kmEnBref({ km: 222, versPort: 210, mer: 6850, depuisPort: 12 }, ports)).toEqual([`${kmLisibles(222)} par la route`, `${kmLisibles(6850)} par mer`]);
    expect(kmEnBref({ ...SANS_KM, depuisPort: 12 }, { depart: null, arrivee: "Fort-de-France" })).toEqual([]);
  });
  it("les km d'un dossier relus : des entiers de 0 à 40 000, sinon rien", () => {
    expect(kilometresDuDossier({ distance_km: 222, distance_vers_port_km: 210, distance_mer_km: 6850, distance_depuis_port_km: 12 })).toEqual({ km: 222, versPort: 210, mer: 6850, depuisPort: 12 });
    expect(kilometresDuDossier({ distance_km: null })).toEqual(SANS_KM);
    expect([kmRecevable("210"), kmRecevable(""), kmRecevable("12.5"), kmRecevable(-1), kmRecevable(40_001), kmRecevable(null)]).toEqual([210, null, null, null, null, null]);
  });
  it("les ports d'un trajet enregistré (les étapes de la fiche)", () => {
    expect(portsDuTrajet([{ genre: "depart", port: "Le Havre" }, { genre: "garde_meuble", port: null }, { genre: "arrivee", port: "" }])).toEqual({ depart: "Le Havre", arrivee: null });
  });
});

describe("quand la case Port se montre", () => {
  it("toujours pour un CIMOB/DICOM", () => {
    expect(casePortVisible(true, [{ adresse: PARIS }])).toBe(true);
  });
  it("pour les autres : dès qu'une adresse est outre-mer ou à l'étranger, ou qu'une case est remplie", () => {
    expect(casePortVisible(false, [{ adresse: PARIS, pays: "France" }, { adresse: LYON }])).toBe(false);
    expect(casePortVisible(false, [{ adresse: PARIS }, { adresse: FDF }])).toBe(true);
    expect(casePortVisible(false, [{ adresse: "Rue X", code_postal: "97400" }])).toBe(true);
    expect(casePortVisible(false, [{ adresse: "Rue X", departement_om: "976" }])).toBe(true);
    expect(casePortVisible(false, [{ adresse: "Rue de la Loi 16, Bruxelles", pays: "Belgique" }])).toBe(true);
    expect(casePortVisible(false, [{ adresse: PARIS, port: "Le Havre" }])).toBe(true);
  });
  it("Monaco (98000) n'est pas l'outre-mer", () => {
    expect(horsMetropole({ code_postal: "98000" })).toBe(false);
  });
});

describe("la case Port suit l'adresse", () => {
  it("relue par le serveur à la création, bornée", () => {
    const e = lireLieux(JSON.stringify([
      { genre: "depart", adresse: PARIS, port: "  Le   Havre " },
      { genre: "arrivee", adresse: FDF, port: "x".repeat(200) },
    ]));
    expect(e.map((x) => x.port)).toEqual(["Le Havre", "x".repeat(80)]);
    expect(lireLieux("[]").map((x) => x.port)).toEqual([null, null]);
  });
  it("reprise d'un dossier passé (le même client, une duplication)", () => {
    expect(adresseDepuisEtape({ adresse: FDF, etage: null, ascenseur: false, acces: null, port: "Fort-de-France" }, true).port).toBe("Fort-de-France");
    expect(adresseDepuisEtape({ adresse: PARIS, etage: null, ascenseur: false, acces: null }, true).port).toBe("");
  });
});
