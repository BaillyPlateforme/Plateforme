import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listRequests, listDevis } = vi.hoisted(() => ({ listRequests: vi.fn(), listDevis: vi.fn() }));
vi.mock("@/lib/requests", () => ({ listRequests }));
vi.mock("@/lib/devis", () => ({ listDevis }));

import { preparerTableauDeBord } from "@/lib/tableau-de-bord";
import type { RequestRow } from "@/lib/types";
import { esp } from "./_outils";

const JOUR = 86_400_000;
const MAINTENANT = Date.parse("2026-11-15T11:00:00Z"); // midi à Paris
const ilYa = (jours: number) => new Date(MAINTENANT - jours * JOUR).toISOString();

let n = 0;
const req = (created_at: string, o: Partial<RequestRow> = {}): RequestRow =>
  ({
    id: `r${++n}`, source: "form", status: "new", client_email: null, estimation_prix: null, volume_m3: null,
    depart_ville: null, depart_code_postal: null, created_at, ...o,
  }) as RequestRow;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  listRequests.mockReset();
  listDevis.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
});

const tuile = (t: Awaited<ReturnType<typeof preparerTableauDeBord>>, label: string) => t.tuiles.find((x) => x.label === label)!;

describe("preparerTableauDeBord — base indisponible", () => {
  it("la page s'affiche à zéro plutôt que de planter", async () => {
    listRequests.mockRejectedValue(new Error("base indisponible"));
    const t = await preparerTableauDeBord();
    expect(t.tuiles.map((x) => esp(x.valeur))).toEqual(["0", "0 €", "0 m³", "0"]);
    expect(t.tuiles.every((x) => x.delta === null)).toBe(true);
    expect(t.flux.every((s) => s.data.every((v) => v === 0))).toBe(true);
    expect(t.villes).toEqual([]);
    expect(t.villeMax).toBe(1);
    expect(t.depMax).toBe(1);
    expect(t.totalRecues).toBe(0);
  });
});

describe("preparerTableauDeBord — tuiles (fenêtre de 90 jours, comparée aux 90 précédents)", () => {
  const jeu = () => [
    // fenêtre courante
    req(ilYa(1), { estimation_prix: 600, volume_m3: 20, client_email: "a@x.fr" }),
    req(ilYa(10), { estimation_prix: 300, volume_m3: 10.5, client_email: "a@x.fr" }),
    req(ilYa(90), { client_email: "b@x.fr" }), // pile 90 jours : encore dans la fenêtre
    // fenêtre précédente
    req(ilYa(100), { estimation_prix: 300, volume_m3: 15, client_email: "c@x.fr" }),
    req(ilYa(180), { estimation_prix: 300, volume_m3: 15 }), // pile 180 jours : encore dans la précédente
    // hors des deux fenêtres
    req(ilYa(181), { estimation_prix: 99999, volume_m3: 999, client_email: "z@x.fr" }),
  ];

  it("demandes reçues : 3 contre 2 → +50 %", async () => {
    listRequests.mockResolvedValue(jeu());
    const t = tuile(await preparerTableauDeBord(), "Demandes reçues");
    expect(t.valeur).toBe("3");
    expect(t.delta).toBe(50); // (3 − 2) / 2
  });

  it("estimations cumulées : 900 € contre 600 € → +50 %", async () => {
    listRequests.mockResolvedValue(jeu());
    const t = tuile(await preparerTableauDeBord(), "Estimations cumulées");
    expect(esp(t.valeur)).toBe("900 €");
    expect(t.delta).toBe(50);
  });

  it("volume : 30,5 m³ affiché à l'unité (31 m³), contre 30 → +2 %", async () => {
    listRequests.mockResolvedValue(jeu());
    const t = tuile(await preparerTableauDeBord(), "Volume à déménager");
    expect(esp(t.valeur)).toBe("31 m³");
    expect(t.delta).toBe(2); // (30,5 − 30) / 30 = 1,67 % → 2
  });

  it("nouveaux clients : adresses distinctes, sans les vides — 2 contre 1 → +100 %", async () => {
    listRequests.mockResolvedValue(jeu());
    const t = tuile(await preparerTableauDeBord(), "Nouveaux clients");
    expect(t.valeur).toBe("2");
    expect(t.delta).toBe(100);
  });

  it("sans période précédente, pas de variation (null, pas « +100 % »)", async () => {
    listRequests.mockResolvedValue([req(ilYa(1), { estimation_prix: 500 })]);
    const t = await preparerTableauDeBord();
    expect(t.tuiles.every((x) => x.delta === null)).toBe(true);
  });

  it("variation négative : 1 contre 4 → −75 %", async () => {
    listRequests.mockResolvedValue([req(ilYa(1)), ...[100, 110, 120, 130].map((j) => req(ilYa(j)))]);
    expect(tuile(await preparerTableauDeBord(), "Demandes reçues").delta).toBe(-75);
  });

  it("au-delà de 1 000 € : en k€ (12 000 € → 12 k€)", async () => {
    listRequests.mockResolvedValue([req(ilYa(1), { estimation_prix: 12000 })]);
    expect(esp(tuile(await preparerTableauDeBord(), "Estimations cumulées").valeur)).toBe("12 k€");
  });

  // Pas de double arrondi des k€ : 1 500 € s'affiche « 1,5 k€ », pas « 2 k€ ».
  it("1 500 € s'affiche 1,5 k€", async () => {
    listRequests.mockResolvedValue([req(ilYa(1), { estimation_prix: 1500 })]);
    expect(esp(tuile(await preparerTableauDeBord(), "Estimations cumulées").valeur)).toBe("1,5 k€");
  });
});

describe("preparerTableauDeBord — séries", () => {
  it("douze mois glissants, de décembre 2025 à novembre 2026", async () => {
    listRequests.mockResolvedValue([]);
    const t = await preparerTableauDeBord();
    expect(t.fluxLabels).toEqual(["déc", "janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov"]);
    expect(t.septLabels).toEqual(t.fluxLabels.slice(-7));
    expect(t.sixLabels).toEqual(t.fluxLabels.slice(-6));
  });

  it("un 31 du mois : douze mois distincts, aucun sauté (31 mars → avril…mars)", async () => {
    vi.setSystemTime(Date.parse("2027-03-31T10:00:00Z"));
    listRequests.mockResolvedValue([]);
    const t = await preparerTableauDeBord();
    expect(new Set(t.fluxLabels).size).toBe(12);
    expect(t.fluxLabels[0]).toBe("avr");
    expect(t.fluxLabels[11]).toBe("mars");
  });

  it("flux mensuel : reçues, qualifiées (qualified, quoted, won), devisées (quoted, won)", async () => {
    listRequests.mockResolvedValue([
      req("2026-11-03T10:00:00Z", { status: "qualified" }),
      req("2026-11-04T10:00:00Z", { status: "won" }),
      req("2026-10-10T10:00:00Z", { status: "quoted" }),
      req("2026-10-11T10:00:00Z", { status: "lost" }),
      req("2025-12-15T10:00:00Z", { status: "new" }),
      req("2025-11-15T10:00:00Z", { status: "won" }), // il y a douze mois : hors de la série
    ]);
    const t = await preparerTableauDeBord();
    const [recues, qualifiees, devisees] = t.flux.map((s) => s.data);
    expect(recues).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2]);
    expect(qualifiees).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
    expect(devisees).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it("propriété : chaque mois, devisées ≤ qualifiées ≤ reçues", async () => {
    const statuts = ["new", "qualified", "quoted", "won", "lost", "archived"];
    listRequests.mockResolvedValue(Array.from({ length: 120 }, (_, i) => req(ilYa(i * 3), { status: statuts[i % 6] as RequestRow["status"] })));
    const t = await preparerTableauDeBord();
    const [recues, qualifiees, devisees] = t.flux.map((s) => s.data);
    for (let m = 0; m < 12; m++) {
      expect(devisees[m]).toBeLessThanOrEqual(qualifiees[m]);
      expect(qualifiees[m]).toBeLessThanOrEqual(recues[m]);
    }
  });

  it("estimations par jour : lundi en premier, dimanche en dernier, formulaire et e-mail à part", async () => {
    listRequests.mockResolvedValue([
      req("2026-11-09T10:00:00+01:00", { source: "form", estimation_prix: 1000.4 }), // lundi
      req("2026-11-15T09:00:00+01:00", { source: "email", estimation_prix: 250 }), // dimanche
    ]);
    const t = await preparerTableauDeBord();
    expect(t.JOURS[0]).toBe("Lundi");
    expect(t.revenus[0].data).toEqual([1000, 0, 0, 0, 0, 0, 0]);
    expect(t.revenus[1].data).toEqual([0, 0, 0, 0, 0, 0, 250]);
  });

  it("douze semaines : la dernière couvre les sept derniers jours ; les totaux sont les sommes", async () => {
    listRequests.mockResolvedValue([
      req(ilYa(1), { status: "qualified" }),
      req(ilYa(6.9)),
      req(ilYa(8), { status: "won" }),
      req(ilYa(80)), // première semaine : de J−84 à J−77
      req(ilYa(84.5)), // hors des douze semaines (84 jours en tout)
      req(ilYa(100)), // hors des douze semaines
    ]);
    const t = await preparerTableauDeBord();
    expect(t.semaines[0].data).toHaveLength(t.SEMAINES);
    expect(t.semaines[0].data.at(-1)).toBe(2);
    expect(t.semaines[0].data.at(-2)).toBe(1);
    expect(t.semaines[0].data[0]).toBe(1);
    expect(t.totalRecues).toBe(t.semaines[0].data.reduce((a, b) => a + b, 0));
    expect(t.totalRecues).toBe(4);
    expect(t.totalQualifiees).toBe(2);
  });

  it("villes de départ : cinq premières, espaces retirés, vides ignorées", async () => {
    const villes = ["Massy", "Massy ", " Massy", "Lyon", "Lyon", "Paris", "Nantes", "Lille", "Nice", "", null];
    listRequests.mockResolvedValue(villes.map((v) => req(ilYa(1), { depart_ville: v })));
    const t = await preparerTableauDeBord();
    expect(t.villes).toHaveLength(5);
    expect(t.villes[0]).toEqual(["Massy", 3]);
    expect(t.villes[1]).toEqual(["Lyon", 2]);
    expect(t.villeMax).toBe(3);
  });

  it("départements : deux premiers chiffres du code postal, codes trop courts ignorés", async () => {
    const cps = ["75011", "75015", " 69003 ", "2A004", "97411", "1", "", null];
    listRequests.mockResolvedValue(cps.map((c) => req(ilYa(1), { depart_code_postal: c })));
    const t = await preparerTableauDeBord();
    expect(Object.fromEntries(t.deps)).toEqual({ "75": 2, "69": 1, "2A": 1, "97": 1 });
    expect(t.deps[0]).toEqual(["75", 2]);
    expect(t.depMax).toBe(2);
  });

  it("volume des six derniers mois : qualifié et en attente se partagent le total", async () => {
    listRequests.mockResolvedValue([
      req("2026-11-02T10:00:00Z", { status: "qualified", volume_m3: 20.4 }),
      req("2026-11-03T10:00:00Z", { status: "new", volume_m3: 10 }),
      req("2026-06-03T10:00:00Z", { status: "won", volume_m3: 5 }),
      req("2026-05-03T10:00:00Z", { status: "won", volume_m3: 50 }), // hors des six mois
    ]);
    const t = await preparerTableauDeBord();
    expect(t.volQualifie).toEqual([5, 0, 0, 0, 0, 20]);
    expect(t.volAttente).toEqual([0, 0, 0, 0, 0, 10]);
  });
});
