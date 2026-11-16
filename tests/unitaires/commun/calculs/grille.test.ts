import { describe, expect, it } from "vitest";
import {
  FORMULES,
  PRESTATIONS,
  SUPPLEMENTS,
  TARIFS,
  TRANCHES_DISTANCE,
  TRANCHES_VOLUME,
  TVA_DEFAUT,
  type Formule,
} from "@/lib/pricing/grille";

const r2 = (n: number) => Math.round(n * 100) / 100;
const FORMULES_CLES: Formule[] = ["eco", "standard", "luxe"];

describe("grille tarifaire — structure", () => {
  it("compte 13 tranches de volume et 13 tranches de distance", () => {
    expect(TRANCHES_VOLUME).toHaveLength(13);
    expect(TRANCHES_DISTANCE).toHaveLength(13);
  });

  it("chaque formule a une matrice pleine de 13 lignes (distance) sur 13 colonnes (volume)", () => {
    for (const f of FORMULES_CLES) {
      expect(TARIFS[f]).toHaveLength(TRANCHES_DISTANCE.length);
      for (const ligne of TARIFS[f]) expect(ligne).toHaveLength(TRANCHES_VOLUME.length);
    }
  });

  it("toutes les cases sont des nombres finis strictement positifs", () => {
    for (const f of FORMULES_CLES)
      for (const ligne of TARIFS[f])
        for (const v of ligne) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThan(0);
        }
  });

  it("les tranches de volume se suivent sans trou : min = plafond précédent + 1", () => {
    for (let i = 1; i < TRANCHES_VOLUME.length; i++) {
      expect(TRANCHES_VOLUME[i].min).toBe((TRANCHES_VOLUME[i - 1].max as number) + 1);
    }
  });

  it("seule la dernière tranche de volume n'a pas de plafond", () => {
    const sansPlafond = TRANCHES_VOLUME.filter((t) => t.max === null);
    expect(sansPlafond).toHaveLength(1);
    expect(TRANCHES_VOLUME.at(-1)!.max).toBeNull();
  });

  it("seule la première tranche (1 à 5 m³) se facture au forfait", () => {
    expect(TRANCHES_VOLUME[0]).toMatchObject({ min: 1, max: 5, forfait: true });
    expect(TRANCHES_VOLUME.slice(1).every((t) => !t.forfait)).toBe(true);
  });

  it("les tranches de distance couvrent 0 à 1200 km sans trou", () => {
    expect(TRANCHES_DISTANCE[0].min).toBe(0);
    expect(TRANCHES_DISTANCE.at(-1)!.max).toBe(1200);
    for (let i = 1; i < TRANCHES_DISTANCE.length; i++) {
      expect(TRANCHES_DISTANCE[i].min).toBe(TRANCHES_DISTANCE[i - 1].max + 1);
    }
  });

  it("les libellés de tranche reprennent leurs bornes", () => {
    for (const t of TRANCHES_DISTANCE) expect(t.label).toBe(`${t.min} à ${t.max} km`);
    for (const t of TRANCHES_VOLUME.slice(1, -1)) expect(t.label).toBe(`${t.min} à ${t.max} m³`);
  });
});

describe("grille tarifaire — rapports entre formules (en-tête de grille.ts)", () => {
  // « L'ancienne grille était la formule standard multipliée par 0,92 et 1,15 ;
  //   celle-ci ne l'est plus : sur la ligne 0 à 50 km, à partir de la tranche
  //   11–15 m³, l'économique tombe à 0,90 du standard. Onze cellules sur 169. »

  it("le Premium vaut le Standard × 1,15 au centime près, dans les 169 cases", () => {
    for (let d = 0; d < 13; d++)
      for (let v = 0; v < 13; v++) expect(TARIFS.luxe[d][v]).toBeCloseTo(r2(TARIFS.standard[d][v] * 1.15), 2);
  });

  it("l'Économique vaut le Standard × 0,92, sauf la ligne 0–50 km dès 11–15 m³ (× 0,90)", () => {
    for (let d = 0; d < 13; d++)
      for (let v = 0; v < 13; v++) {
        const coef = d === 0 && v >= 2 ? 0.9 : 0.92;
        expect(TARIFS.eco[d][v]).toBeCloseTo(r2(TARIFS.standard[d][v] * coef), 2);
      }
  });

  it("exactement onze cases sont à 0,90 du standard", () => {
    let n = 0;
    for (let d = 0; d < 13; d++)
      for (let v = 0; v < 13; v++) if (Math.abs(TARIFS.eco[d][v] - r2(TARIFS.standard[d][v] * 0.9)) < 0.005) n++;
    expect(n).toBe(11);
  });

  it("dans chaque case : Économique < Standard < Premium", () => {
    for (let d = 0; d < 13; d++)
      for (let v = 0; v < 13; v++) {
        expect(TARIFS.eco[d][v]).toBeLessThan(TARIFS.standard[d][v]);
        expect(TARIFS.standard[d][v]).toBeLessThan(TARIFS.luxe[d][v]);
      }
  });

  it("valeurs témoins lues dans le fichier : forfait 0–50 km = 345 / 375 / 431,25 €", () => {
    expect([TARIFS.eco[0][0], TARIFS.standard[0][0], TARIFS.luxe[0][0]]).toEqual([345, 375, 431.25]);
    // 375 × 0,92 = 345 ; 375 × 1,15 = 431,25
  });
});

describe("grille tarifaire — monotonie", () => {
  it("à tranche de volume égale, la case ne baisse jamais quand la distance augmente", () => {
    for (const f of FORMULES_CLES)
      for (let v = 0; v < 13; v++)
        for (let d = 1; d < 13; d++) expect(TARIFS[f][d][v]).toBeGreaterThanOrEqual(TARIFS[f][d - 1][v]);
  });

  it("le prix au m³ ne monte jamais d'une tranche de volume à la suivante (tarif dégressif)", () => {
    for (const f of FORMULES_CLES)
      for (let d = 0; d < 13; d++)
        for (let v = 2; v < 13; v++) expect(TARIFS[f][d][v]).toBeLessThanOrEqual(TARIFS[f][d][v - 1]);
  });
});

describe("suppléments — valeurs conformes aux commentaires de grille.ts", () => {
  it("portage : au-delà de 20 m, par tranche de 20 m entamée, 2,20 €/m³", () => {
    expect(SUPPLEMENTS.portage).toEqual({ seuilMetres: 20, trancheMetres: 20, prixParM3: 2.2 });
  });

  it("monte-meubles : 260 € la demi-journée, 390 € la journée au-delà de 35 m³, dès 25 m³ et un 2e étage", () => {
    expect(SUPPLEMENTS.monteMeubles).toEqual({
      demiJournee: 260,
      journee: 390,
      seuilJourneeM3: 35,
      declenche: { volumeM3: 25, etage: 2 },
    });
  });

  it("transbordement : demi-journée moins chère que la journée", () => {
    expect(SUPPLEMENTS.transbordement.demiJournee).toBeLessThan(SUPPLEMENTS.transbordement.journee);
  });

  it("piano (plus de 150 kg) plus cher qu'une charge lourde (80 à 150 kg)", () => {
    expect(SUPPLEMENTS.piano.prix).toBeGreaterThan(SUPPLEMENTS.chargeLourde.prix);
  });

  it("garantie : la Luxe n'a pas de franchise (« c'est son argument ») et coûte plus que la standard", () => {
    const { standard, luxe } = SUPPLEMENTS.garantie.niveaux;
    expect(luxe.franchise).toBe(0);
    expect(standard.franchise).toBeGreaterThan(0);
    expect(luxe.taux).toBeGreaterThan(standard.taux);
  });

  it("on écrit « garantie », jamais « assurance », dans les libellés et textes de garantie", () => {
    for (const n of Object.values(SUPPLEMENTS.garantie.niveaux)) {
      expect(n.label.toLowerCase()).toContain("garantie");
      expect(`${n.label} ${n.texte}`.toLowerCase()).not.toContain("assurance");
    }
  });

  it("TVA par défaut : 20 %", () => {
    expect(TVA_DEFAUT).toBe(20);
  });
});

describe("formules et prestations", () => {
  it("trois formules, dans l'ordre eco / standard / luxe, la luxe affichée « Premium »", () => {
    expect(FORMULES.map((f) => f.key)).toEqual(["eco", "standard", "luxe"]);
    expect(FORMULES.find((f) => f.key === "luxe")!.label).toBe("Premium");
  });

  it("chaque ligne de prestation désigne Bailly, le client, ou personne", () => {
    for (const c of PRESTATIONS)
      for (const l of c.lignes) for (const f of FORMULES_CLES) expect(["Bailly", "Client", ""]).toContain(l[f]);
  });

  it("Premium : Bailly emballe tout (catégorie des emballages)", () => {
    const emballages = PRESTATIONS.find((c) => c.categorie.startsWith("Mise à disposition cartons"))!;
    expect(emballages.lignes.every((l) => l.luxe === "Bailly")).toBe(true);
  });

  it("une formule supérieure ne rend jamais au client ce qu'une formule inférieure confie à Bailly", () => {
    for (const c of PRESTATIONS)
      for (const l of c.lignes) {
        if (l.eco === "Bailly") expect(l.standard).toBe("Bailly");
        if (l.standard === "Bailly") expect(l.luxe).toBe("Bailly");
      }
  });
});
