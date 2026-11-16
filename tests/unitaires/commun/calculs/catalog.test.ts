import { describe, expect, it } from "vitest";
import { CATALOG, REPERE_LOGEMENT } from "@/lib/catalog";

describe("CATALOG — le mobilier courant", () => {
  it("n'est pas vide et chaque objet a un libellé, un groupe et un volume", () => {
    expect(CATALOG.length).toBeGreaterThan(0);
    for (const o of CATALOG) {
      expect(o.label.trim()).toBe(o.label);
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.groupe.length).toBeGreaterThan(0);
    }
  });

  it("chaque volume est un nombre fini strictement positif, en m³ raisonnables (< 5 m³ l'objet)", () => {
    for (const o of CATALOG) {
      expect(Number.isFinite(o.volume)).toBe(true);
      expect(o.volume).toBeGreaterThan(0);
      expect(o.volume).toBeLessThan(5);
    }
  });

  it("aucun libellé en double (le formulaire s'en sert de clé)", () => {
    const labels = CATALOG.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("les groupes attendus du formulaire sont présents", () => {
    expect(new Set(CATALOG.map((o) => o.groupe))).toEqual(new Set(["Cartons", "Salon", "Chambre", "Cuisine", "Divers"]));
  });

  it("valeurs témoins : un carton standard 0,1 m³, un canapé 3 places 1,5 m³", () => {
    expect(CATALOG.find((o) => o.label === "Carton standard")!.volume).toBe(0.1);
    expect(CATALOG.find((o) => o.label === "Canapé 3 places")!.volume).toBe(1.5);
  });
});

describe("REPERE_LOGEMENT — le volume d'après le logement", () => {
  it("environ un mètre cube pour deux mètres carrés : 0,5 m³/m²", () => {
    expect(REPERE_LOGEMENT.m3ParM2).toBe(0.5);
  });

  it("chaque type de logement a un volume positif, et les libellés sont uniques", () => {
    for (const t of REPERE_LOGEMENT.types) expect(t.volume).toBeGreaterThan(0);
    const labels = REPERE_LOGEMENT.types.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("ameublement : « normal » vaut 1, « peu » moins, « très » plus", () => {
    const coef = Object.fromEntries(REPERE_LOGEMENT.ameublement.map((a) => [a.key, a.coef]));
    expect(coef.normal).toBe(1);
    expect(coef.peu).toBeLessThan(1);
    expect(coef.tres).toBeGreaterThan(1);
  });

  it("chaque annexe ajoute un volume positif, clés uniques", () => {
    for (const a of REPERE_LOGEMENT.annexes) expect(a.volume).toBeGreaterThan(0);
    const cles = REPERE_LOGEMENT.annexes.map((a) => a.key);
    expect(new Set(cles).size).toBe(cles.length);
  });
});
