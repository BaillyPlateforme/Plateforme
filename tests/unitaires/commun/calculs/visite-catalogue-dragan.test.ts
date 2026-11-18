import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/catalog";
import {
  CATALOGUE_DRAGAN, CATALOGUE_TABLETTE, FAMILLES, REFERENCES, SYNONYMES, famillesPourLaPiece, genreDePiece, referenceDuLibelle,
} from "@/lib/visite/catalogue";
import { normaliser, objetsConnus, rechercherObjets, type ObjetConnu } from "@/lib/visite/objets";

/*
 * Le catalogue de la tablette : celui de Dragan (catalogue bilingue
 * V7, mail du 18/11/2026), version de travail. 533 références, les volumes
 * du PDF et rien d'autre ; les familles et les synonymes sont déduits, et ne
 * créent ni référence ni volume.
 */

const libelles = (l: ObjetConnu[]) => l.map((o) => o.label);
const connus = objetsConnus(CATALOGUE_TABLETTE, [], []);

describe("catalogue de Dragan — chargé tel que le PDF", () => {
  it("533 références, dans l'ordre du PDF, chacune avec sa désignation française et anglaise", () => {
    expect(REFERENCES).toHaveLength(533);
    expect(REFERENCES.map((r) => r.n)).toEqual(Array.from({ length: 533 }, (_, i) => i + 1));
    for (const r of REFERENCES) {
      expect(r.fr.trim()).toBe(r.fr);
      expect(r.fr.length).toBeGreaterThan(0);
      expect(r.en.trim().length).toBeGreaterThan(0);
      expect(["mobilier", "contenant", "protection"]).toContain(r.nature);
    }
    // Aucune désignation française en double : la ligne se retrouve à son libellé.
    expect(new Set(REFERENCES.map((r) => normaliser(r.fr))).size).toBe(533);
  });

  it("aucun volume inventé : 497 chiffrés, 2 « À estimer », 10 « À mesurer », 24 « Non compté » (les protections)", () => {
    const sans = REFERENCES.filter((r) => r.volume == null);
    expect(REFERENCES.filter((r) => r.volume != null)).toHaveLength(497);
    expect(sans.filter((r) => r.volume_pdf === "À estimer")).toHaveLength(2);
    expect(sans.filter((r) => r.volume_pdf === "À mesurer")).toHaveLength(10);
    expect(sans.filter((r) => r.volume_pdf === "Non compté")).toHaveLength(24);
    expect(sans).toHaveLength(36);
    for (const r of REFERENCES.filter((x) => x.nature === "protection")) expect(r.volume).toBeNull();
    for (const r of REFERENCES) if (r.volume != null) expect(r.volume).toBeGreaterThan(0), expect(r.volume).toBeLessThanOrEqual(6);
  });

  it("valeurs témoins du PDF : carton penderie 0,50, canapé 3 places 2,10, piano droit 1,80, lave-linge 0,35, KALLAX 2 cases 0,20", () => {
    const v = (fr: string) => REFERENCES.find((r) => r.fr === fr)?.volume;
    expect(v("Carton penderie")).toBe(0.5);
    expect(v("Canapé 3 places")).toBe(2.1);
    expect(v("Piano droit")).toBe(1.8);
    expect(v("Lave-linge")).toBe(0.35);
    expect(v("KALLAX / meuble à cases 2 cases")).toBe(0.2);
    expect(v("Caisse vaisselle")).toBeNull();
    expect(REFERENCES.find((r) => r.fr === "Carton tableaux")?.volume).toBe(0.15);
  });

  it("les familles sont déduites (21), chaque référence en a une ; l'anglais douteux est signalé (124 + 10 faux-sens)", () => {
    expect(FAMILLES).toHaveLength(21);
    const cles = new Set(FAMILLES.map((f) => f.cle));
    for (const r of REFERENCES) expect(cles.has(r.famille)).toBe(true);
    expect(REFERENCES.filter((r) => r.en_a_relire === "mots français")).toHaveLength(124);
    expect(REFERENCES.filter((r) => r.en_a_relire === "faux-sens")).toHaveLength(10);
    expect(REFERENCES.find((r) => r.fr === "Tapis course")?.en_a_relire).toBeTruthy();
    expect(CATALOGUE_DRAGAN.avertissement).toMatch(/ne constituent pas un barème validé/);
  });

  it("pour la saisie : « à mesurer » et protections s'ajoutent à volume nul ; tout le catalogue est cherchable", () => {
    expect(CATALOGUE_TABLETTE.filter((a) => a.aMesurer)).toHaveLength(12);
    expect(CATALOGUE_TABLETTE.filter((a) => a.horsCubage)).toHaveLength(24);
    for (const a of CATALOGUE_TABLETTE.filter((x) => x.aMesurer || x.horsCubage)) expect(a.volume).toBe(0);
    expect(connus).toHaveLength(533);
    expect(new Set(connus.map((o) => o.label))).toEqual(new Set(REFERENCES.map((r) => r.fr)));
  });

  it("le formulaire public garde son catalogue court (44 références, volumes d'avant)", () => {
    expect(CATALOG).toHaveLength(44);
    expect(CATALOG.find((o) => o.label === "Canapé 3 places")!.volume).toBe(1.5);
    expect(CATALOG.find((o) => o.label === "Carton penderie")!.volume).toBe(0.25);
  });

  it("referenceDuLibelle retrouve la référence sans accents ni majuscules", () => {
    expect(referenceDuLibelle("canape 3 PLACES")).toMatchObject({ label: "Canapé 3 places", en: "Sofa 3-seater", volume: 2.1 });
    expect(referenceDuLibelle("Objet inconnu")).toBeNull();
  });
});

describe("recherche : synonymes et anglais", () => {
  it("« Kallax » et ses synonymes mènent au meuble à cases, sans référence ni volume nouveaux", () => {
    const kallax = REFERENCES.find((r) => r.fr.startsWith("KALLAX"))!;
    for (const frappe of ["kallax", "KALLAX", "étagère à cases", "etagere a cases", "expedit", "meuble cube"]) {
      const r = rechercherObjets(frappe, connus, 10);
      expect(libelles(r), frappe).toContain(kallax.fr);
      expect(r.find((o) => o.label === kallax.fr)!.volume).toBe(0.2);
    }
    // Un synonyme désigne toujours une référence existante.
    for (const s of SYNONYMES) for (const d of s.designations) expect(REFERENCES.some((r) => normaliser(r.fr).startsWith(normaliser(d))), d).toBe(true);
  });

  it("un synonyme passe après le libellé : « frigo » trouve les réfrigérateurs, « canapé-lit » les convertibles", () => {
    expect(libelles(rechercherObjets("frigo", connus, 10)).every((l) => l.startsWith("Réfrigérateur"))).toBe(true);
    expect(rechercherObjets("frigo", connus, 10)).toHaveLength(5);
    expect(libelles(rechercherObjets("canapé-lit", connus, 10))).toEqual(expect.arrayContaining(["Clic-clac", "BZ", "Canapé convertible 2 places"]));
  });

  it("l'anglais trouve aussi la référence, après le français", () => {
    expect(libelles(rechercherObjets("wardrobe box", connus))).toContain("Carton penderie");
    expect(libelles(rechercherObjets("dishwasher", connus))).toEqual(["Lave-vaisselle"]);
    // « table » : les libellés français d'abord.
    expect(rechercherObjets("table", connus, 3).every((o) => normaliser(o.label).includes("table"))).toBe(true);
  });

  it("une référence « à mesurer » se propose, à volume nul, et le dit", () => {
    const [c] = rechercherObjets("caisse vaisselle", connus);
    expect(c).toMatchObject({ label: "Caisse vaisselle", volume: 0, aMesurer: true, en: "Dish packing crate" });
    expect(rechercherObjets("bullpack", connus)[0]).toMatchObject({ label: "Bullpack", volume: 0, horsCubage: true });
  });
});

describe("les familles proposées d'abord selon la pièce", () => {
  it("la pièce visitée d'abord, puis les contenants, tout le reste, les protections en dernier", () => {
    const toutes = FAMILLES.map((f) => f.cle).sort();
    for (const nom of ["Chambre 2", "Salon", "Cuisine", "Garage", "Pièce inconnue", "Chambre d'enfant", "Salle de bain"]) {
      const l = famillesPourLaPiece(nom);
      expect([...l].sort(), nom).toEqual(toutes);
      expect(l.at(-1)).toBe("protections");
    }
    expect(famillesPourLaPiece("Chambre 2")[0]).toBe("chambre");
    expect(famillesPourLaPiece("Chambre d'enfant").slice(0, 2)).toEqual(["enfant", "chambre"]);
    expect(famillesPourLaPiece("Séjour")[0]).toBe("salon");
    expect(famillesPourLaPiece("Salle à manger")[0]).toBe("salle_a_manger");
    expect(famillesPourLaPiece("Pièce inconnue")[0]).toBe("contenants");
  });

  it("le genre d'une pièce, pour les références les plus utilisées : « Chambre 2 » compte avec « chambre »", () => {
    expect(genreDePiece("Chambre 2")).toBe("chambre");
    expect(genreDePiece(" Salle à manger ")).toBe("salle a manger");
  });
});
