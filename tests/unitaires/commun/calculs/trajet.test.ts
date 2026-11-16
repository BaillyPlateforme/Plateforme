import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { distanceEntreVilles, distanceRoutiereKm, situerVille, volOiseauKm, type Point } from "@/lib/trajet";

const PARIS: Point = { lat: 48.8566, lon: 2.3522 };
const LYON: Point = { lat: 45.764, lon: 4.8357 };

/** Une réponse HTTP minimale. */
const reponse = (corps: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => corps }) as unknown as Response;

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

describe("situerVille — la Base Adresse Nationale, puis OpenStreetMap en repli", () => {
  it("lit les coordonnées de la BAN, dans l'ordre [lon, lat]", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ features: [{ geometry: { coordinates: [4.8357, 45.764] } }] }));
    await expect(situerVille("Lyon", "69003")).resolves.toEqual({ lat: 45.764, lon: 4.8357 });
    const url = String(fetchFaux.mock.calls[0][0]);
    expect(url).toContain("api-adresse.data.gouv.fr");
    expect(url).toContain(`q=${encodeURIComponent("69003 Lyon")}`);
    expect(url).toContain("type=municipality");
  });

  it("encode les accents et les espaces de la ville", async () => {
    fetchFaux.mockResolvedValueOnce(reponse({ features: [{ geometry: { coordinates: [4.39, 45.43] } }] }));
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
    fetchFaux.mockResolvedValueOnce(reponse({ features: [{ geometry: { coordinates: ["x", null] } }] }));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
  });

  it("BAN en panne (HTTP 503) : repli sur Nominatim, en France, avec le code postal", async () => {
    fetchFaux
      .mockResolvedValueOnce(reponse("sorry", false, 503))
      .mockResolvedValueOnce(reponse([{ lat: "45.764", lon: "4.8357" }]));
    await expect(situerVille("Lyon", "69003")).resolves.toEqual({ lat: 45.764, lon: 4.8357 });
    const url = new URL(String(fetchFaux.mock.calls[1][0]));
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("countrycodes")).toBe("fr");
    expect(url.searchParams.get("city")).toBe("Lyon");
    expect(url.searchParams.get("postalcode")).toBe("69003");
  });

  it("BAN qui lève : repli, et côté serveur l'application se nomme (User-Agent)", async () => {
    fetchFaux.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(reponse([{ lat: "48.8566", lon: "2.3522" }]));
    await expect(situerVille("Paris", null)).resolves.toEqual({ lat: 48.8566, lon: 2.3522 });
    const init = fetchFaux.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^BaillyPlateforme/);
  });

  it("les deux services en panne : rien, jamais d'exception", async () => {
    fetchFaux.mockRejectedValue(new Error("réseau coupé"));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
  });

  it("Nominatim renvoie une liste vide ou des nombres illisibles : rien", async () => {
    fetchFaux.mockResolvedValueOnce(reponse(null, false, 500)).mockResolvedValueOnce(reponse([]));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
    fetchFaux.mockResolvedValueOnce(reponse(null, false, 500)).mockResolvedValueOnce(reponse([{ lat: "abc", lon: "4" }]));
    await expect(situerVille("Lyon", null)).resolves.toBeNull();
    fetchFaux.mockResolvedValueOnce(reponse(null, false, 500)).mockResolvedValueOnce(reponse(null, false, 429));
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
      if (url.includes("Lyon")) return reponse({ features: [{ geometry: { coordinates: [4.8357, 45.764] } }] });
      return reponse({ features: [{ geometry: { coordinates: [2.3522, 48.8566] } }] });
    });
    await expect(distanceEntreVilles({ ville: "Paris", code_postal: "75011" }, { ville: "Lyon" })).resolves.toBe(465);
  });
});
