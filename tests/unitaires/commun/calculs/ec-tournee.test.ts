import { afterEach, describe, expect, it, vi } from "vitest";
import { distanceKm, geocoder, PARAMS_TOURNEE, RouteOptimizerSimule, tournees, type Arret, type OptionsTournee, type Point } from "@/lib/espace-client/tournee";
import { volOiseauKm } from "@/lib/trajet";
import { hasard } from "./_outils";

const DEPOT = PARAMS_TOURNEE.depot;
const OPTIONS: OptionsTournee = {
  depart: DEPOT,
  heureDepart: PARAMS_TOURNEE.heureDepart,
  minutesParArret: PARAMS_TOURNEE.minutesParArret,
  vitesseKmh: PARAMS_TOURNEE.vitesseKmh,
  largeurCreneau: PARAMS_TOURNEE.largeurCreneau,
};
/** Un arrêt plein nord du dépôt, à `km` de route (vol d'oiseau × 1,35). */
const auNord = (id: string, km: number): Arret => ({ id, lat: DEPOT.lat + (km / 1.35 / 6371) * (180 / Math.PI), lng: DEPOT.lng });
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const longueur = (depart: Point, ordre: Point[]) => {
  let t = 0;
  let p = depart;
  for (const a of ordre) {
    t += distanceKm(p, a);
    p = a;
  }
  return t;
};
const optimiser = (arrets: Arret[]) => new RouteOptimizerSimule().optimiser(arrets, OPTIONS);

describe("distanceKm — vol d'oiseau corrigé du détour urbain (× 1,35)", () => {
  it("zéro entre un point et lui-même, symétrique", () => {
    const a = { lat: 48.85, lng: 2.35 };
    const b = { lat: 48.9, lng: 2.25 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });

  it("vaut le vol d'oiseau du module trajet × 1,35", () => {
    const a = { lat: 48.8157, lng: 2.3849 };
    const b = { lat: 48.7303, lng: 2.2769 };
    expect(distanceKm(a, b)).toBeCloseTo(volOiseauKm({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }) * 1.35, 9);
  });

  it("l'outil des tests place un arrêt à la distance voulue", () => {
    expect(distanceKm(DEPOT, auNord("x", 11))).toBeCloseTo(11, 9);
  });
});

describe("RouteOptimizerSimule — ordre de passage et créneaux", () => {
  it("aucun arrêt : distance nulle, fin à l'heure de départ", async () => {
    await expect(optimiser([])).resolves.toEqual({ arrets: [], distanceKm: 0, fin: "08:30" });
  });

  it("un arrêt à 4,4 km : 12 min de route à 22 km/h, arrivée 8 h 42, créneau 8 h 15 – 9 h 15", async () => {
    // 4,4 / 22 × 60 = 12 min → 8 h 42 ; début = arrondi au quart de (8 h 42 − 30 min = 8 h 12) = 8 h 15
    // fin de tournée = 8 h 42 + 15 min sur place = 8 h 57
    const r = await optimiser([auNord("a", 4.4)]);
    expect(r.arrets).toEqual([{ id: "a", ordre: 1, arrivee: "08:42", creneau_debut: "08:15", creneau_fin: "09:15", distanceKm: 4.4 }]);
    expect(r.distanceKm).toBe(4.4);
    expect(r.fin).toBe("08:57");
  });

  it("arrêts alignés : visités du plus proche au plus lointain, quel que soit l'ordre donné", async () => {
    const r = await optimiser([auNord("c9", 9), auNord("c3", 3), auNord("c12", 12), auNord("c6", 6)]);
    expect(r.arrets.map((a) => a.id)).toEqual(["c3", "c6", "c9", "c12"]);
    expect(r.arrets.map((a) => a.distanceKm)).toEqual([3, 3, 3, 3]);
    expect(r.distanceKm).toBe(12); // trajet ouvert : pas de retour au dépôt
  });

  it("la tournée partagée est la réalisation simulée", () => {
    expect(tournees).toBeInstanceOf(RouteOptimizerSimule);
  });

  describe("propriétés, sur des tournées tirées en Île-de-France", () => {
    const alea = hasard(7);
    const tirer = (n: number): Arret[] =>
      Array.from({ length: n }, (_, i) => ({ id: `s${i}`, lat: DEPOT.lat + (alea() - 0.5) * 0.4, lng: DEPOT.lng + (alea() - 0.5) * 0.6 }));
    const jeux = [1, 2, 3, 5, 8, 12].map(tirer);

    it("chaque arrêt est visité une fois, numéroté de 1 à n", async () => {
      for (const arrets of jeux) {
        const r = await optimiser(arrets);
        expect(r.arrets.map((a) => a.id).sort()).toEqual(arrets.map((a) => a.id).sort());
        expect(r.arrets.map((a) => a.ordre)).toEqual(arrets.map((_, i) => i + 1));
      }
    });

    it("les arrivées se suivent dans l'ordre de passage", async () => {
      for (const arrets of jeux) {
        const r = await optimiser(arrets);
        for (let i = 1; i < r.arrets.length; i++) expect(minutes(r.arrets[i].arrivee)).toBeGreaterThanOrEqual(minutes(r.arrets[i - 1].arrivee));
      }
    });

    it("créneaux d'une heure, calés au quart d'heure, qui contiennent l'arrivée", async () => {
      for (const arrets of jeux) {
        const r = await optimiser(arrets);
        for (const a of r.arrets) {
          const d = minutes(a.creneau_debut);
          expect(minutes(a.creneau_fin) - d).toBe(60);
          expect(d % 15).toBe(0);
          expect(minutes(a.arrivee)).toBeGreaterThanOrEqual(d);
          expect(minutes(a.arrivee)).toBeLessThanOrEqual(d + 60);
        }
      }
    });

    it("la distance totale est la somme des étapes (au dixième près)", async () => {
      for (const arrets of jeux) {
        const r = await optimiser(arrets);
        const somme = r.arrets.reduce((s, a) => s + a.distanceKm, 0);
        expect(Math.abs(r.distanceKm - somme)).toBeLessThanOrEqual(0.05 * (r.arrets.length + 1));
      }
    });

    it("2-opt : aucune inversion d'un tronçon ne raccourcit la tournée rendue (optimum local)", async () => {
      for (const arrets of jeux) {
        const r = await optimiser(arrets);
        const parId = new Map(arrets.map((a) => [a.id, a]));
        const ordre = r.arrets.map((a) => parId.get(a.id)!);
        const l = longueur(DEPOT, ordre);
        for (let i = 0; i < ordre.length - 1; i++)
          for (let k = i + 1; k < ordre.length; k++) {
            const candidat = [...ordre.slice(0, i), ...ordre.slice(i, k + 1).reverse(), ...ordre.slice(k + 1)];
            expect(longueur(DEPOT, candidat) + 1e-9).toBeGreaterThanOrEqual(l);
          }
      }
    });

    it("idempotente : la même tournée deux fois donne le même plan ; l'entrée n'est pas modifiée", async () => {
      for (const arrets of jeux) {
        const copie = arrets.map((a) => ({ ...a }));
        expect(await optimiser(arrets)).toEqual(await optimiser(arrets));
        expect(arrets).toEqual(copie);
      }
    });
  });

  // La retenue des minutes est reportée sur l'heure : 539,6 min s'écrit « 09:00 », jamais « 08:60 ».
  it("une heure ne s'écrit jamais avec 60 minutes (arrivée à 539,6 min → 09:00)", async () => {
    // 510 min (8 h 30) + 10,8533 km / 22 km/h × 60 = 539,6 min
    const r = await optimiser([auNord("a", (29.6 * 22) / 60)]);
    expect(r.arrets[0].arrivee).toMatch(/^\d{2}:[0-5]\d$/);
    expect(r.arrets[0].arrivee).toBe("09:00");
  });
});

describe("geocoder — la Base Adresse Nationale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rend { lat, lng } à partir de [lon, lat]", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.27, 48.73] } }] }) })));
    await expect(geocoder("1 rue A, 91300 Massy")).resolves.toEqual({ lat: 48.73, lng: 2.27 });
  });

  it("encode l'adresse dans la requête", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }));
    vi.stubGlobal("fetch", f);
    await geocoder("12 rue de l'Église & co");
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain(encodeURIComponent("12 rue de l'Église & co"));
  });

  it("adresse inconnue, réponse illisible ou réseau coupé : rien", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })));
    await expect(geocoder("nulle part")).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError("pas du JSON"); } })));
    await expect(geocoder("x")).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("réseau"); }));
    await expect(geocoder("x")).resolves.toBeNull();
  });

  it("la Géoplateforme d'abord ; muette ou en erreur, l'ancienne adresse prend le relais", async () => {
    const f = vi.fn(async (url: string) =>
      url.startsWith("https://data.geopf.fr/") ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) },
    );
    vi.stubGlobal("fetch", f);
    await expect(geocoder("Paris")).resolves.toEqual({ lat: 48.85, lng: 2.35 });
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/data\.geopf\.fr\/geocodage\/search\?/);
    expect(String((f.mock.calls[1] as unknown[])[0])).toMatch(/^https:\/\/api-adresse\.data\.gouv\.fr\/search\/\?/);
  });
});

describe("PARAMS_TOURNEE", () => {
  it("départ 8 h 30, 15 min par arrêt, 22 km/h, créneau d'une heure, 60 km au plus", () => {
    expect(PARAMS_TOURNEE).toMatchObject({ heureDepart: "08:30", minutesParArret: 15, vitesseKmh: 22, largeurCreneau: 60, rayonMaxKm: 60 });
  });
});
