import { describe, expect, it, vi } from "vitest";
import {
  bornesCartons,
  CAPACITE_SAMEDI,
  DELAI_MIN_JOURS,
  estimationCartons,
  plusJours,
  samediSuivant,
  samedisEntre,
} from "@/lib/espace-client/cartons";

const jourSemaine = (j: string) => new Date(`${j}T12:00:00Z`).getUTCDay();

describe("plusJours", () => {
  it.each([
    ["2026-11-15", 3, "2026-11-18"],
    ["2026-11-15", -1, "2026-11-14"],
    ["2026-11-15", 0, "2026-11-15"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2028-02-28", 1, "2028-02-29"], // bissextile
    ["2027-02-28", 1, "2027-03-01"],
    ["2026-03-28", 1, "2026-03-29"], // veille du passage à l'heure d'été
    ["2026-03-29", 1, "2026-03-30"],
    ["2026-10-24", 2, "2026-10-26"], // à travers le retour à l'heure d'hiver
  ])("%s %s jour(s) → %s", (j, n, attendu) => {
    expect(plusJours(j, n)).toBe(attendu);
  });
});

describe("bornesCartons — la fenêtre des samedis possibles", () => {
  it("après le délai de prévenance (3 jours), jusqu'à la veille du déménagement", () => {
    expect(DELAI_MIN_JOURS).toBe(3);
    expect(bornesCartons("2026-12-05", new Date("2026-11-15T10:00:00Z"))).toEqual({ min: "2026-11-18", max: "2026-12-04" });
  });

  it("le délai se compte depuis le jour de Paris : 23 h 30 UTC le 14 = le 15 à Paris", () => {
    expect(bornesCartons("2026-12-05", new Date("2026-11-14T23:30:00Z")).min).toBe("2026-11-18");
    expect(bornesCartons("2026-12-05", new Date("2026-11-14T22:30:00Z")).min).toBe("2026-11-17");
  });

  it("déménagement trop proche : la fenêtre est vide (min après max)", () => {
    const b = bornesCartons("2026-11-17", new Date("2026-11-15T10:00:00Z"));
    expect(b.min > b.max).toBe(true);
    expect(samedisEntre(b.min, b.max)).toEqual([]);
  });
});

describe("samedisEntre", () => {
  it("les samedis du 18 novembre au 4 décembre 2026 : le 21 et le 28", () => {
    expect(samedisEntre("2026-11-18", "2026-12-04")).toEqual(["2026-11-21", "2026-11-28"]);
  });

  it("bornes incluses quand ce sont des samedis", () => {
    expect(samedisEntre("2026-11-21", "2026-12-05")).toEqual(["2026-11-21", "2026-11-28", "2026-12-05"]);
    expect(samedisEntre("2026-11-21", "2026-11-21")).toEqual(["2026-11-21"]);
  });

  it("aucun samedi dans la fenêtre : liste vide", () => {
    expect(samedisEntre("2026-11-22", "2026-11-27")).toEqual([]);
    expect(samedisEntre("2026-12-01", "2026-11-01")).toEqual([]);
  });

  it("à travers le changement d'heure d'octobre : un samedi tous les sept jours", () => {
    expect(samedisEntre("2026-10-01", "2026-11-01")).toEqual(["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  });

  it("d'une année à l'autre", () => {
    expect(samedisEntre("2026-12-25", "2027-01-10")).toEqual(["2026-12-26", "2027-01-02", "2027-01-09"]);
  });

  it("à travers un 29 février", () => {
    expect(samedisEntre("2028-02-20", "2028-03-10")).toEqual(["2028-02-26", "2028-03-04"]);
  });

  // Une date illisible faisait boucler sans fin la recherche du premier samedi (getUTCDay() rend
  // NaN) ; une borne haute illisible, comparée en texte, ne s'arrêtait pas non plus. Délai court,
  // et les pas comptés : une boucle synchrone bloquerait le minuteur du délai, le compteur la coupe.
  it("une date illisible rend une liste vide, sans boucler", { timeout: 1_000 }, () => {
    const setUTCDate = Date.prototype.setUTCDate;
    let pas = 0;
    const espion = vi.spyOn(Date.prototype, "setUTCDate").mockImplementation(function (this: Date, jour: number) {
      if (++pas > 10_000) throw new Error("samedisEntre ne s'arrête pas");
      return setUTCDate.call(this, jour);
    });
    try {
      for (const [min, max] of [["", "2026-12-31"], ["abc", "2026-12-31"], ["2026-13-45", "2026-12-31"], ["2026-11-18", "zzz"], ["2026-11-18", "2026-02-30x"]]) {
        expect(samedisEntre(min, max), `${min} → ${max}`).toEqual([]);
      }
    } finally {
      espion.mockRestore();
    }
  });

  it("propriété : sur un an, que des samedis, espacés de 7 jours, dans la fenêtre", () => {
    const s = samedisEntre("2026-01-01", "2026-12-31");
    expect(s).toHaveLength(52);
    for (const j of s) {
      expect(jourSemaine(j)).toBe(6);
      expect(j >= "2026-01-01" && j <= "2026-12-31").toBe(true);
    }
    for (let i = 1; i < s.length; i++) expect(plusJours(s[i - 1], 7)).toBe(s[i]);
  });
});

describe("samediSuivant", () => {
  it.each([
    ["2026-11-15", "2026-11-21"], // dimanche
    ["2026-11-20", "2026-11-21"], // vendredi
    ["2026-11-21", "2026-11-21"], // samedi : lui-même
    ["2026-11-22", "2026-11-28"],
    ["2026-12-31", "2027-01-02"],
    ["2028-02-27", "2028-03-04"], // dimanche avant le 29 février
  ])("après le %s : le %s", (j, attendu) => {
    expect(samediSuivant(j)).toBe(attendu);
  });

  it("toujours un samedi, au plus six jours après", () => {
    for (let i = 0; i < 400; i++) {
      const j = plusJours("2026-01-01", i);
      const s = samediSuivant(j);
      expect(jourSemaine(s)).toBe(6);
      expect(s >= j && s <= plusJours(j, 6)).toBe(true);
    }
  });
});

describe("estimationCartons — une première estimation d'après le volume", () => {
  it.each([
    [0, 0], [1, 1], [20, 25], [6.5, 8], [9.5, 12], [33, 41], [100, 125], // 6,5 × 1,25 = 8,125 ; 9,5 × 1,25 = 11,875 ; 33 × 1,25 = 41,25
  ])("%s m³ → %s cartons (× 1,25, arrondi)", (v, n) => {
    expect(estimationCartons(v)).toBe(n);
  });

  it("croît avec le volume", () => {
    let prec = -1;
    for (let v = 0; v <= 150; v += 0.5) {
      const n = estimationCartons(v);
      expect(n).toBeGreaterThanOrEqual(prec);
      prec = n;
    }
  });

  it("capacité d'un samedi : un entier positif", () => {
    expect(Number.isInteger(CAPACITE_SAMEDI) && CAPACITE_SAMEDI > 0).toBe(true);
  });
});
