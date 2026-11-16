import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  caseGrille,
  entreeDepuisDemande,
  estimerDemande,
  indexDistance,
  indexVolume,
  simuler,
  valeurDeclaree,
  type SimulationInput,
} from "@/lib/pricing/engine";
import { TARIFS, TRANCHES_VOLUME, type Formule } from "@/lib/pricing/grille";
import type { RequestRow } from "@/lib/types";
import { esp, hasard } from "./_outils";

const base: SimulationInput = { formule: "standard", volume_m3: 20, distance_km: 30 };
const sim = (o: Partial<SimulationInput> = {}) => simuler({ ...base, ...o });
const ligne = (s: ReturnType<typeof simuler>, label: string) => s.lines.find((l) => l.label === label);
const auCentime = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

function demande(o: Partial<RequestRow> = {}): RequestRow {
  return {
    id: "req-1", source: "form", status: "new",
    client_nom: "Claire Dumont", client_email: "claire@example.com", client_tel: null,
    depart_adresse: null, depart_code_postal: "91300", depart_ville: "Massy", depart_etage: 0, depart_ascenseur: false,
    arrivee_adresse: null, arrivee_code_postal: "69003", arrivee_ville: "Lyon", arrivee_etage: 0, arrivee_ascenseur: false,
    date_souhaitee: null, flexibilite: null,
    volume_m3: 20, volume_method: null,
    type_logement_depart: null, type_logement_arrivee: null,
    distance_km: 30, formule: "standard", services: {}, estimation_prix: null, grid_id: null,
    score_potentiel: null, score_difficulte: null, score_notes: null, completion_token: null,
    raw_payload: {},
    created_at: "2026-11-15T10:00:00.000Z", updated_at: "2026-11-15T10:00:00.000Z",
    ...o,
  } as RequestRow;
}

describe("indexVolume — la tranche de volume", () => {
  it.each([
    [0, 0], [1, 0], [4.99, 0], [5, 0],
    [5.01, 1], [6, 1], [10, 1],
    [10.01, 2], [15, 2], [20, 3], [30, 4], [40, 5], [100, 11],
    [100.01, 12], [1_000_000, 12],
  ])("%s m³ → tranche %s", (v, i) => {
    expect(indexVolume(v)).toBe(i);
  });

  it("un volume négatif tombe dans la première tranche", () => {
    expect(indexVolume(-3)).toBe(0);
  });
});

describe("indexDistance — la tranche de distance", () => {
  it.each([
    [0, 0], [50, 0], [50.5, 1], [51, 1], [100, 1], [101, 2], [1200, 12], [1201, 12], [5000, 12],
  ])("%s km → tranche %s", (km, i) => {
    expect(indexDistance(km)).toBe(i);
  });
});

describe("caseGrille — ce que la grille donne", () => {
  it("moins de 5 m³ : un forfait", () => {
    expect(caseGrille("standard", 3, 30)).toEqual({ valeur: 375, forfait: true });
  });

  it("25 m³ à 250 km en Premium : la case 21–30 m³ × 201–300 km, au m³", () => {
    expect(caseGrille("luxe", 25, 250)).toEqual({ valeur: TARIFS.luxe[3][4], forfait: false });
    expect(TARIFS.luxe[3][4]).toBe(69);
  });
});

describe("simuler — transport", () => {
  it("20 m³ à 30 km en Standard : 20 × 43 = 860 € HT, TVA 172 €, 1 032 € TTC", () => {
    const s = sim();
    expect(s.transport).toBe(860);
    expect(s.supplements).toBe(0);
    expect(s.ht).toBe(860);
    expect(s.tva).toBe(172);
    expect(s.ttc).toBe(1032);
    expect(s).toMatchObject({
      valeur_case: 43, est_forfait: false, tarif_m3: 43,
      tranche_volume: "16 à 20 m³", tranche_distance: "0 à 50 km", index_volume: 3, index_distance: 0,
    });
    expect(s.lines).toEqual([
      { label: "Transport et manutention", detail: "20 m³ × 43 €/m³ — 16 à 20 m³, 0 à 50 km", amount: 860 },
    ]);
    expect(s.alertes).toEqual([]);
    expect(s.mentions).toEqual(["Frais de stationnement : sur justificatif."]);
  });

  it("3 m³ en Standard : le forfait de 375 €, sans prix au m³, avec sa mention", () => {
    const s = sim({ volume_m3: 3, distance_km: 10 });
    expect(s.transport).toBe(375);
    expect(s.est_forfait).toBe(true);
    expect(s.tarif_m3).toBe(0);
    expect(s.lines[0].detail).toBe("forfait 375 € — 1 à 5 m³ — forfait, 0 à 50 km");
    expect(s.mentions[0]).toBe("Moins de 5 m³ : le transport est facturé au forfait de la tranche.");
    // 375 × 20 % = 75 ; 375 + 75 = 450
    expect([s.tva, s.ttc]).toEqual([75, 450]);
  });

  it("le forfait ne dépend pas du volume dans la tranche (1 m³ = 5 m³)", () => {
    expect(sim({ volume_m3: 1 }).transport).toBe(sim({ volume_m3: 5 }).transport);
  });

  it("forfait Premium à 120 km : 546,25 € écrit à la française", () => {
    const s = sim({ formule: "luxe", volume_m3: 2, distance_km: 120 });
    expect(s.transport).toBe(546.25);
    expect(s.lines[0].detail).toBe("forfait 546,25 € — 1 à 5 m³ — forfait, 101 à 200 km");
    // 546,25 × 0,2 = 109,25 ; 546,25 + 109,25 = 655,50
    expect([s.tva, s.ttc]).toEqual([109.25, 655.5]);
  });

  it("volume décimal : 12,5 m³ à 75 km = 12,5 × 55 = 687,50 €", () => {
    const s = sim({ volume_m3: 12.5, distance_km: 75 });
    expect(s.transport).toBe(687.5);
    expect(s.lines[0].detail).toBe("12,5 m³ × 55 €/m³ — 11 à 15 m³, 51 à 100 km");
  });

  it("arrondi au centime : 6,3 m³ × 64,69 = 407,547 → 407,55 ; TVA 81,51 ; TTC 489,06", () => {
    const s = sim({ formule: "luxe", volume_m3: 6.3 });
    expect(s.transport).toBe(407.55);
    expect(s.tva).toBe(81.51);
    expect(s.ttc).toBe(489.06);
  });

  it("Économique 7,2 m³ : 51,75 × 7,2 = 372,60 ; TVA 74,52 ; TTC 447,12", () => {
    const s = sim({ formule: "eco", volume_m3: 7.2 });
    expect([s.transport, s.tva, s.ttc]).toEqual([372.6, 74.52, 447.12]);
  });

  it("très gros volume, très loin : 150 m³ à 1 200 km = 150 × 95 = 14 250 €, sans alerte", () => {
    const s = sim({ volume_m3: 150, distance_km: 1200 });
    expect(s.transport).toBe(14250);
    expect(s.alertes).toEqual([]);
  });

  it("au-delà de 1 200 km : la dernière tranche est prolongée, et une alerte le dit", () => {
    const s = sim({ distance_km: 1200.4 });
    expect(s.alertes).toEqual([
      "Distance au-delà de la grille (1200 km) : tarif de la tranche 1101 à 1200 km appliqué.",
    ]);
    expect(sim({ distance_km: 5000 }).transport).toBe(sim({ distance_km: 1200 }).transport);
  });

  it("valeurs hostiles : volume ou distance négatifs, NaN → ramenés à zéro", () => {
    expect(sim({ volume_m3: -10 }).transport).toBe(375); // 0 m³ → forfait
    expect(sim({ volume_m3: Number.NaN }).transport).toBe(375);
    expect(sim({ distance_km: -50 }).index_distance).toBe(0);
    expect(sim({ distance_km: Number.NaN }).index_distance).toBe(0);
    expect(Number.isFinite(sim({ volume_m3: Number.NaN, distance_km: Number.NaN }).ttc)).toBe(true);
  });

  it("formule absente : la Standard", () => {
    const s = simuler({ volume_m3: 20, distance_km: 30 } as SimulationInput);
    expect(s.transport).toBe(860);
  });
});

describe("simuler — TVA", () => {
  it("taux réduit 5,5 % : 860 × 5,5 % = 47,30 ; TTC 907,30", () => {
    const s = sim({ tva: 5.5 });
    expect([s.tva, s.ttc]).toEqual([47.3, 907.3]);
  });

  it("taux zéro : TTC = HT", () => {
    const s = sim({ tva: 0 });
    expect(s.tva).toBe(0);
    expect(s.ttc).toBe(s.ht);
  });
});

describe("simuler — suppléments", () => {
  it("voyage spécial : + 15 % du transport (860 × 0,15 = 129)", () => {
    const s = sim({ voyage_special: true });
    expect(ligne(s, "Voyage spécial")).toEqual({ label: "Voyage spécial", detail: "date imposée · +15 % du transport", amount: 129 });
    expect(s.ht).toBe(989);
  });

  it("portage : rien jusqu'à 20 m inclus", () => {
    const s = sim({ portage_depart_m: 20, portage_arrivee_m: 0 });
    expect(s.lines).toHaveLength(1);
  });

  it("portage à 21 m : une tranche entamée, 1 × 2,20 × 20 m³ = 44 €", () => {
    expect(ligne(sim({ portage_depart_m: 21 }), "Portage au départ")).toEqual({
      label: "Portage au départ", detail: "21 m · 1 tranche de 20 m × 2,2 €/m³", amount: 44,
    });
  });

  it.each([
    [20.5, 1, 44], [40, 1, 44], [41, 2, 88], [60, 2, 88], [100, 4, 176],
  ])("portage à %s m : %s tranche(s), %s €", (m, tranches, montant) => {
    const l = ligne(sim({ portage_arrivee_m: m }), "Portage à l'arrivée")!;
    expect(l.amount).toBe(montant);
    expect(l.detail).toContain(`${tranches} tranche${tranches > 1 ? "s" : ""} de 20 m`);
  });

  it("portage des deux côtés : deux lignes distinctes", () => {
    const s = sim({ portage_depart_m: 30, portage_arrivee_m: 50 });
    expect(s.lines.map((l) => l.label)).toEqual(["Transport et manutention", "Portage au départ", "Portage à l'arrivée"]);
    expect(s.supplements).toBe(44 + 88);
  });

  it("portage négatif ou NaN : ignoré", () => {
    expect(sim({ portage_depart_m: -40, portage_arrivee_m: Number.NaN }).lines).toHaveLength(1);
  });

  it("transbordement : demi-journée (180 €) jusqu'à 20 m³, journée (250 €) au-delà", () => {
    expect(ligne(sim({ volume_m3: 20, transbordement: true }), "Transbordement")).toEqual({
      label: "Transbordement", detail: "demi-journée · jusqu'à 20 m³", amount: 180,
    });
    expect(ligne(sim({ volume_m3: 20.5, transbordement: true }), "Transbordement")).toEqual({
      label: "Transbordement", detail: "journée · au-delà de 20 m³", amount: 250,
    });
  });

  it("monte-meubles déclenché seul à 25 m³ et un 2e étage sans ascenseur : demi-journée 260 €", () => {
    const s = sim({ volume_m3: 25, etages_sans_ascenseur: 2 });
    expect(ligne(s, "Monte-meubles avec opérateur")).toEqual({
      label: "Monte-meubles avec opérateur",
      detail: "demi-journée · 260 € — nécessaire dès 25 m³ et un 2e étage sans ascenseur",
      amount: 260,
    });
    expect(s.mentions).toContain("Monte-meubles inclus : 25 m³ à déménager et un 2e étage sans ascenseur l'imposent.");
  });

  it("pas de monte-meubles sous 25 m³ ni sous le 2e étage", () => {
    expect(ligne(sim({ volume_m3: 24.99, etages_sans_ascenseur: 5 }), "Monte-meubles avec opérateur")).toBeUndefined();
    expect(ligne(sim({ volume_m3: 60, etages_sans_ascenseur: 1 }), "Monte-meubles avec opérateur")).toBeUndefined();
  });

  it("monte-meubles : 35 m³ reste en demi-journée, au-delà la journée à 390 €", () => {
    expect(ligne(sim({ volume_m3: 35, etages_sans_ascenseur: 2 }), "Monte-meubles avec opérateur")!.amount).toBe(260);
    const l = ligne(sim({ volume_m3: 36, etages_sans_ascenseur: 3 }), "Monte-meubles avec opérateur")!;
    expect(l.amount).toBe(390);
    expect(l.detail).toMatch(/^journée · 390 €/);
  });

  it("monte-meubles posé à la main : 2 × 260 € sur un petit volume", () => {
    expect(ligne(sim({ volume_m3: 10, monte_meubles: 2 }), "Monte-meubles avec opérateur")).toEqual({
      label: "Monte-meubles avec opérateur", detail: "2 × demi-journée · 260 €", amount: 520,
    });
  });

  it("monte-meubles : le plus grand du manuel et de l'automatique, jamais la somme", () => {
    const un = ligne(sim({ volume_m3: 30, etages_sans_ascenseur: 3, monte_meubles: 1 }), "Monte-meubles avec opérateur")!;
    expect(un.amount).toBe(260);
    const deux = ligne(sim({ volume_m3: 30, etages_sans_ascenseur: 3, monte_meubles: 2 }), "Monte-meubles avec opérateur")!;
    expect(deux.amount).toBe(520);
    expect(deux.detail).toMatch(/, 2 mises en œuvre$/);
  });

  it("étages et monte-meubles décimaux sont arrondis ; négatifs ramenés à zéro", () => {
    expect(ligne(sim({ volume_m3: 25, etages_sans_ascenseur: 1.5 }), "Monte-meubles avec opérateur")).toBeDefined();
    expect(ligne(sim({ volume_m3: 25, etages_sans_ascenseur: 1.4 }), "Monte-meubles avec opérateur")).toBeUndefined();
    expect(ligne(sim({ monte_meubles: -3 }), "Monte-meubles avec opérateur")).toBeUndefined();
  });

  it("pianos : 220 € l'unité", () => {
    expect(ligne(sim({ pianos: 2 }), "Portage piano")).toEqual({
      label: "Portage piano",
      detail: "2 × 220 € · plus de 150 kg — les pianos électriques, légers, n'entrent pas dans cette catégorie",
      amount: 440,
    });
  });

  it("charges lourdes : 120 € l'unité, trois exemples cités", () => {
    expect(ligne(sim({ charges_lourdes: 3 }), "Portage charges lourdes")).toEqual({
      label: "Portage charges lourdes",
      detail: "3 × 120 € · 80 à 150 kg (aquarium de plus de 150 litres, frigo américain, juke-box…)",
      amount: 360,
    });
    expect(ligne(sim({ charges_lourdes: 1.4 }), "Portage charges lourdes")!.amount).toBe(120);
    expect(ligne(sim({ charges_lourdes: -2 }), "Portage charges lourdes")).toBeUndefined();
  });

  it("garantie standard par défaut dès qu'une valeur est déclarée : 0,5 % de 30 000 = 150 €, franchise 300 €", () => {
    const s = sim({ valeur_declaree: 30000 });
    const l = ligne(s, "Garantie dommages standard")!;
    expect(l.amount).toBe(150);
    expect(esp(l.detail!)).toBe("0,5 % de 30 000 € déclarés");
    expect(s.mentions).toContain("Garantie avec tableau de vétusté pour le mobilier.");
    expect(s.mentions).toContain("Franchise de 300 € par sinistre.");
  });

  it("garantie nulle explicitement + valeur déclarée : la standard est retenue (aide de l'espace pro)", () => {
    expect(ligne(sim({ valeur_declaree: 30000, garantie: null }), "Garantie dommages standard")!.amount).toBe(150);
  });

  it("garantie Luxe : 0,8 % de 30 000 = 240 €, sans franchise", () => {
    const s = sim({ valeur_declaree: 30000, garantie: "luxe" });
    const l = ligne(s, "Garantie dommages Luxe")!;
    expect(l.amount).toBe(240);
    expect(esp(l.detail!)).toBe("0,8 % de 30 000 € déclarés");
    expect(s.mentions).toContain("Sans franchise.");
    expect(s.mentions).not.toContain("Franchise de 300 € par sinistre.");
  });

  it("sans valeur déclarée (0 ou négative), aucune garantie, même choisie", () => {
    expect(sim({ valeur_declaree: 0, garantie: "luxe" }).lines).toHaveLength(1);
    expect(sim({ valeur_declaree: -100, garantie: "standard" }).lines).toHaveLength(1);
  });

  it("la mention du stationnement est toujours la dernière", () => {
    for (const o of [{}, { volume_m3: 3 }, { valeur_declaree: 60000 }, { volume_m3: 30, etages_sans_ascenseur: 4 }]) {
      expect(sim(o).mentions.at(-1)).toBe("Frais de stationnement : sur justificatif.");
    }
  });

  it("scénario complet calculé à la main : HT 2 430 €, TVA 486 €, TTC 2 916 €", () => {
    // Standard, 30 m³, 250 km : case 21–30 m³ × 201–300 km = 60 €/m³ → 1 800 €
    // + monte-meubles déclenché (30 m³, 3e étage), demi-journée → 260 €
    // + 1 piano → 220 € ; + garantie standard 0,5 % de 30 000 € → 150 €
    // HT = 1 800 + 630 = 2 430 ; TVA = 486 ; TTC = 2 916
    const s = simuler({ formule: "standard", volume_m3: 30, distance_km: 250, etages_sans_ascenseur: 3, pianos: 1, valeur_declaree: 30000 });
    expect([s.transport, s.supplements, s.ht, s.tva, s.ttc]).toEqual([1800, 630, 2430, 486, 2916]);
  });
});

describe("simuler — propriétés", { timeout: 30_000 }, () => {
  const alea = hasard(2026);
  const formules: Formule[] = ["eco", "standard", "luxe"];
  const entrees: SimulationInput[] = Array.from({ length: 300 }, () => ({
    formule: formules[Math.floor(alea() * 3)],
    volume_m3: Math.round(alea() * 1500) / 10,
    distance_km: Math.round(alea() * 1400),
    voyage_special: alea() < 0.2,
    portage_depart_m: alea() < 0.3 ? Math.round(alea() * 120) : 0,
    portage_arrivee_m: alea() < 0.3 ? Math.round(alea() * 120) : 0,
    transbordement: alea() < 0.2,
    monte_meubles: alea() < 0.1 ? 1 + Math.floor(alea() * 3) : 0,
    etages_sans_ascenseur: Math.floor(alea() * 8),
    pianos: alea() < 0.1 ? 1 : 0,
    charges_lourdes: Math.floor(alea() * 3),
    valeur_declaree: alea() < 0.5 ? Math.round(alea() * 100000) : 0,
    garantie: alea() < 0.5 ? "luxe" : null,
    tva: alea() < 0.1 ? 10 : undefined,
  }));

  it("HT = somme des lignes, au centime près", () => {
    for (const e of entrees) {
      const s = simuler(e);
      expect(s.ht).toBeCloseTo(s.lines.reduce((t, l) => t + l.amount, 0), 2);
      expect(s.ht).toBeCloseTo(s.transport + s.supplements, 2);
    }
  });

  it("TVA = HT × taux, TTC = HT + TVA, au centime près", () => {
    for (const e of entrees) {
      const s = simuler(e);
      expect(s.tva).toBeCloseTo((s.ht * (e.tva ?? 20)) / 100, 2);
      expect(s.ttc).toBeCloseTo(s.ht + s.tva, 2);
    }
  });

  it("chaque montant est positif ou nul et arrondi au centime", () => {
    for (const e of entrees) {
      const s = simuler(e);
      for (const n of [...s.lines.map((l) => l.amount), s.transport, s.supplements, s.ht, s.tva, s.ttc]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(auCentime(n)).toBe(true);
      }
    }
  });

  it("la première ligne est toujours le transport", () => {
    for (const e of entrees) {
      const s = simuler(e);
      expect(s.lines[0].label).toBe("Transport et manutention");
      expect(s.lines[0].amount).toBe(s.transport);
    }
  });

  it("idempotente et sans effet de bord : même entrée, même résultat ; l'entrée n'est pas modifiée", () => {
    for (const e of entrees.slice(0, 50)) {
      const gele = Object.freeze({ ...e });
      expect(simuler(gele)).toEqual(simuler(gele));
    }
  });

  it("à distance égale, le transport ne baisse pas quand le volume croît dans une même tranche", () => {
    for (const f of formules)
      for (let t = 0; t < TRANCHES_VOLUME.length; t++) {
        const bas = t === 0 ? 0 : (TRANCHES_VOLUME[t - 1].max as number) + 0.01;
        const haut = TRANCHES_VOLUME[t].max ?? 200;
        let prec = -1;
        for (let v = bas; v <= haut; v += 0.73) {
          const p = simuler({ formule: f, volume_m3: v, distance_km: 120 }).transport;
          expect(p).toBeGreaterThanOrEqual(prec);
          prec = p;
        }
      }
  });

  it("à volume égal, le transport ne baisse jamais quand la distance augmente", () => {
    // Échantillon : de part et d'autre de chaque borne de tranche, puis au-delà de la grille.
    const kms = [0, ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200].flatMap((m) => [m - 1, m, m + 0.5, m + 1]), 1500, 3000];
    for (const f of formules)
      for (const v of [0, 3, 5, 7.5, 12, 20, 33, 47, 88, 100, 140]) {
        let prec = -1;
        for (const km of kms) {
          const p = simuler({ formule: f, volume_m3: v, distance_km: km }).transport;
          expect(p).toBeGreaterThanOrEqual(prec);
          prec = p;
        }
      }
  });

  it("Économique < Standard < Premium, quel que soit le chantier", () => {
    for (const e of entrees) {
      const [eco, std, lux] = formules.map((f) => simuler({ formule: f, volume_m3: e.volume_m3, distance_km: e.distance_km }).transport);
      expect(eco).toBeLessThan(std);
      expect(std).toBeLessThan(lux);
    }
  });

  it("ajouter un supplément n'abaisse jamais le HT", () => {
    for (const e of entrees.slice(0, 100)) {
      const nu = simuler({ formule: e.formule, volume_m3: e.volume_m3, distance_km: e.distance_km });
      expect(simuler(e).ht).toBeGreaterThanOrEqual(nu.ht);
    }
  });

  it("caractéristique de la grille (pas du moteur) : le prix baisse en passant du forfait au m³", () => {
    // 5 m³ : forfait 375 € ; 6 m³ : 6 × 56,25 = 337,50 €. C'est la grille du client.
    expect(sim({ volume_m3: 5 }).transport).toBe(375);
    expect(sim({ volume_m3: 6 }).transport).toBe(337.5);
  });
});

describe("simuler — volume coté par un espace pro", () => {
  // engine.ts : « le prix se calcule sur volume_m3, mais les libellés — qui
  // finissent sur le devis du client — citent [le volume déclaré], et taisent
  // le détail du calcul. » espaces.ts : la cote n'est « jamais montrée au
  // client : ni dans son espace, ni sur son devis ».

  it("le prix suit le volume chiffré, le libellé cite le volume déclaré, sans tranche ni prix au m³", () => {
    // 33 m³ chiffrés (30 déclarés + 10 %) : case 31–40 m³ × 0–50 km = 39 €/m³ → 1 287 €
    const s = sim({ volume_m3: 33, volume_declare: 30 });
    expect(s.transport).toBe(1287);
    expect(s.lines[0].detail).toBe("30 m³ — 0 à 50 km");
    expect(s.lines[0].detail).not.toContain("€/m³");
    expect(s.lines[0].detail).not.toContain("31 à 40");
  });

  it("volume déclaré égal au volume chiffré : libellé ordinaire", () => {
    expect(sim({ volume_m3: 20, volume_declare: 20 }).lines[0].detail).toBe("20 m³ × 43 €/m³ — 16 à 20 m³, 0 à 50 km");
  });

  it("le montant ne dépend que du volume chiffré", () => {
    const a = sim({ volume_m3: 33, volume_declare: 30, portage_depart_m: 30, valeur_declaree: 10000 });
    const b = sim({ volume_m3: 33, portage_depart_m: 30, valeur_declaree: 10000 });
    expect(a.ttc).toBe(b.ttc);
  });

  // En volume coté, le portage tait son prix au m³ : le client ne retrouve pas la cote en divisant.
  it("en volume coté, aucune ligne ne montre de prix au m³ (portage compris)", () => {
    const s = sim({ volume_m3: 33, volume_declare: 30, portage_depart_m: 30 });
    for (const l of s.lines) expect(l.detail ?? "").not.toContain("€/m³");
  });

  // En volume coté, le transbordement tait son seuil, comparé au volume chiffré et non au déclaré.
  it("en volume coté, le libellé du transbordement ne contredit pas le volume déclaré", () => {
    const s = sim({ volume_m3: 21, volume_declare: 19, transbordement: true });
    expect(ligne(s, "Transbordement")!.detail).not.toContain("au-delà de 20 m³");
  });

  // En volume coté, le monte-meubles tait le seuil de 25 m³ (comparé au volume chiffré) et le volume déclaré.
  it("en volume coté, le monte-meubles ne cite ni son seuil ni le volume déclaré", () => {
    // 24 m³ déclarés, 26 chiffrés, 2e étage sans ascenseur : le monte-meubles se déclenche (≥ 25 m³ chiffrés).
    const s = sim({ volume_m3: 26, volume_declare: 24, etages_sans_ascenseur: 2 });
    const mm = ligne(s, "Monte-meubles avec opérateur");
    expect(mm, "monte-meubles déclenché").toBeTruthy();
    expect(mm!.detail).not.toMatch(/25 m³/);
    expect(s.mentions.join(" ")).not.toMatch(/24 m³|25 m³|26 m³/);
  });
});

describe("simuler — format des nombres dans les mentions", () => {
  // Les nombres des libellés s'écrivent à la française (engine.ts, nb).
  it("le volume de la mention du monte-meubles s'écrit à la française (25,5 m³)", () => {
    const s = sim({ volume_m3: 25.5, etages_sans_ascenseur: 2 });
    expect(s.mentions.find((m) => m.startsWith("Monte-meubles inclus"))).toContain("25,5 m³");
  });
});

describe("valeurDeclaree — la tranche de valeur du formulaire", () => {
  it.each([
    ["< 10 000 €", 10000],
    ["10 000 – 30 000 €", 30000],
    ["30 000 – 60 000 €", 60000],
    ["> 60 000 €", 100000],
  ])("%s → %s €", (t, v) => {
    expect(valeurDeclaree(t)).toBe(v);
  });

  it.each([[""], [" < 10 000 €"], ["10 000 - 30 000 €"], [30000], [null], [undefined], [{}]])(
    "valeur inconnue ou d'un autre type (%j) → 0",
    (t) => {
      expect(valeurDeclaree(t)).toBe(0);
    },
  );

  it("chaque tranche proposée par le formulaire (DemandeForm.tsx) est reconnue par le moteur, en ordre croissant", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../../../apps/externe/src/app/demande/DemandeForm.tsx"),
      "utf8",
    );
    const m = /export const VALEURS = \[([^\]]+)\]/.exec(source);
    expect(m).not.toBeNull();
    const valeurs = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(valeurs.length).toBeGreaterThan(0);
    const euros = valeurs.map(valeurDeclaree);
    expect(euros.every((e) => e > 0)).toBe(true);
    expect([...euros].sort((a, b) => a - b)).toEqual(euros);
  });
});

describe("entreeDepuisDemande — une demande devient une entrée de moteur", () => {
  it("le plus haut des deux étages sans ascenseur", () => {
    const e = entreeDepuisDemande(demande({ depart_etage: 3, depart_ascenseur: false, arrivee_etage: 5, arrivee_ascenseur: true }));
    expect(e.etages_sans_ascenseur).toBe(3);
  });

  it("ascenseur inconnu (null) : l'étage compte", () => {
    expect(entreeDepuisDemande(demande({ depart_etage: 4, depart_ascenseur: null, arrivee_etage: null })).etages_sans_ascenseur).toBe(4);
  });

  it("étages inconnus ou en sous-sol : zéro", () => {
    expect(entreeDepuisDemande(demande({ depart_etage: null, arrivee_etage: null })).etages_sans_ascenseur).toBe(0);
    expect(entreeDepuisDemande(demande({ depart_etage: -1, arrivee_etage: 0 })).etages_sans_ascenseur).toBe(0);
  });

  it("portage lu dans raw_payload, seulement s'il est numérique", () => {
    const e = entreeDepuisDemande(demande({ raw_payload: { depart: { portage_m: 35 }, arrivee: { portage_m: "35" } } }));
    expect(e.portage_depart_m).toBe(35);
    expect(e.portage_arrivee_m).toBe(0);
  });

  it("charges lourdes comptées ligne par ligne ; piano seulement si vrai booléen", () => {
    expect(entreeDepuisDemande(demande({ raw_payload: { charges_lourdes: ["frigo", "flipper"], piano: true } }))).toMatchObject({
      charges_lourdes: 2, pianos: 1,
    });
    expect(entreeDepuisDemande(demande({ raw_payload: { charges_lourdes: "frigo", piano: "true" } }))).toMatchObject({
      charges_lourdes: 0, pianos: 0,
    });
  });

  it("garantie : « luxe » et « standard » reconnues, le reste nul", () => {
    expect(entreeDepuisDemande(demande({ raw_payload: { assurance: "luxe" } })).garantie).toBe("luxe");
    expect(entreeDepuisDemande(demande({ raw_payload: { assurance: "standard" } })).garantie).toBe("standard");
    expect(entreeDepuisDemande(demande({ raw_payload: { assurance: "premium" } })).garantie).toBeNull();
    expect(entreeDepuisDemande(demande({ raw_payload: {} })).garantie).toBeNull();
  });

  it("valeur du mobilier traduite en euros", () => {
    expect(entreeDepuisDemande(demande({ raw_payload: { valeur_mobilier: "30 000 – 60 000 €" } })).valeur_declaree).toBe(60000);
  });

  it("valeurs absentes : formule Standard, volume et distance à zéro, pas de monte-meubles", () => {
    const e = entreeDepuisDemande(demande({ formule: null, volume_m3: null, distance_km: null, services: null as never, raw_payload: null as never }));
    expect(e).toMatchObject({ formule: "standard", volume_m3: 0, distance_km: 0, monte_meubles: 0, volume_declare: undefined });
  });

  it("monte-meubles demandé par le client : un posé d'office", () => {
    expect(entreeDepuisDemande(demande({ services: { monte_meuble: true } })).monte_meubles).toBe(1);
  });

  it("le voyage spécial n'est jamais posé d'office", () => {
    expect(entreeDepuisDemande(demande({ raw_payload: { voyage_special: true } })).voyage_special).toBe(false);
  });

  it("cote de l'espace pro (+10 %) : chiffré sur 33 m³, 30 m³ déclarés", () => {
    const e = entreeDepuisDemande(demande({ volume_m3: 30, raw_payload: { espace: { slug: "carrefour", nom: "Carrefour", ajustement_volume: 10 } } }));
    expect(e.volume_m3).toBe(33);
    expect(e.volume_declare).toBe(30);
  });

  it("décote de l'espace pro (−20 %) : 30 m³ → 24 m³", () => {
    const e = entreeDepuisDemande(demande({ volume_m3: 30, raw_payload: { espace: { slug: "x", nom: "X", ajustement_volume: -20 } } }));
    expect(e.volume_m3).toBe(24);
  });

  it("espace sans cote, ou espace illisible : pas de volume déclaré à part", () => {
    expect(entreeDepuisDemande(demande({ raw_payload: { espace: { slug: "x", nom: "X", ajustement_volume: 0 } } })).volume_declare).toBeUndefined();
    expect(entreeDepuisDemande(demande({ raw_payload: { espace: { nom: "X", ajustement_volume: 30 } } })).volume_declare).toBeUndefined();
  });
});

describe("estimerDemande — l'estimation automatique et ses alertes", () => {
  it("demande complète : le prix du moteur, sans alerte", () => {
    const r = demande();
    const s = estimerDemande(r);
    expect(s.ttc).toBe(simuler(entreeDepuisDemande(r)).ttc);
    expect(s.alertes).toEqual([]);
  });

  it("volume manquant ou nul : alerte", () => {
    for (const v of [null, 0, -2]) {
      expect(estimerDemande(demande({ volume_m3: v })).alertes).toContain(
        "Volume non renseigné : l'estimation ne vaut rien tant qu'il manque.",
      );
    }
  });

  it("distance manquante : alerte, et tranche 0 à 50 km", () => {
    const s = estimerDemande(demande({ distance_km: null }));
    expect(s.alertes).toContain("Distance non renseignée : tarif de la tranche 0 à 50 km appliqué par défaut.");
    expect(s.tranche_distance).toBe("0 à 50 km");
  });

  it("objets lourds signalés sans détail (ancien formulaire) : alerte avec le prix unitaire", () => {
    expect(estimerDemande(demande({ raw_payload: { articles_lourds: true } })).alertes).toContain(
      "Objets lourds signalés sans détail : charge lourde 120 € l'unité, à ajouter selon le relevé.",
    );
    expect(estimerDemande(demande({ raw_payload: { articles_lourds: true, charges_lourdes: [] } })).alertes).toEqual([]);
  });
});
