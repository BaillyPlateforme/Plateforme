import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Le module lit et écrit la base ailleurs : ici on ne teste que la note, qui est pure.
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => { throw new Error("pas de base en test"); } }));
vi.mock("@/lib/settings", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/alerts", () => ({ fireEvent: vi.fn() }));
vi.mock("@/lib/messaging", () => ({ contexteDemande: () => ({}) }));

import { analyzeRequest, CRITERIA_ORDER, DEFAULT_CRITERIA, type CriterionConfig } from "@/lib/qualification";
import type { RequestRow } from "@/lib/types";

/** Une demande sans aucune donnée notable : chaque test n'ajoute que ce qu'il note. */
function demande(o: Partial<RequestRow> = {}): RequestRow {
  return {
    id: "r", source: "form", status: "new", client_nom: null, client_email: null, client_tel: null,
    depart_adresse: null, depart_code_postal: null, depart_ville: null, depart_etage: null, depart_ascenseur: null,
    arrivee_adresse: null, arrivee_code_postal: null, arrivee_ville: null, arrivee_etage: null, arrivee_ascenseur: null,
    date_souhaitee: null, flexibilite: null, volume_m3: null, volume_method: null,
    type_logement_depart: null, type_logement_arrivee: null, distance_km: null, formule: null,
    services: null as never, estimation_prix: null, grid_id: null,
    score_potentiel: null, score_difficulte: null, score_notes: null, completion_token: null, raw_payload: {},
    created_at: "2026-11-15T00:00:00Z", updated_at: "2026-11-15T00:00:00Z",
    ...o,
  } as RequestRow;
}
const note = (r: RequestRow, cle: string, criteres = DEFAULT_CRITERIA) => analyzeRequest(r, criteres).lines.find((l) => l.key === cle)?.note;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("critères par défaut", () => {
  it("sept critères, dans l'ordre affiché, tous actifs", () => {
    expect(DEFAULT_CRITERIA.map((c) => c.key)).toEqual(CRITERIA_ORDER);
    expect(DEFAULT_CRITERIA.every((c) => c.enabled)).toBe(true);
  });

  it("les poids par défaut font 100", () => {
    expect(DEFAULT_CRITERIA.reduce((s, c) => s + c.poids, 0)).toBe(100);
  });

  it("chaque critère a un plancher distinct de sa cible", () => {
    for (const c of DEFAULT_CRITERIA) expect(c.floor).not.toBe(c.target);
  });
});

describe("analyzeRequest — notes par critère (interpolation linéaire plancher → cible)", () => {
  it("valeur : 2 750 € TTC entre 500 et 5 000 → (2750−500)/4500 = 50", () => {
    expect(note(demande({ estimation_prix: 2750 }), "valeur")).toBe(50);
  });

  it("volume : 22,5 m³ entre 5 et 40 → 17,5/35 = 50", () => {
    expect(note(demande({ volume_m3: 22.5 }), "volume")).toBe(50);
  });

  it("distance : 200 km entre 0 et 400 → 50", () => {
    expect(note(demande({ distance_km: 200 }), "distance")).toBe(50);
  });

  it("bornée à 0 sous le plancher et à 100 au-delà de la cible", () => {
    expect(note(demande({ estimation_prix: 100 }), "valeur")).toBe(0);
    expect(note(demande({ estimation_prix: 50000 }), "valeur")).toBe(100);
    expect(note(demande({ volume_m3: 400 }), "volume")).toBe(100);
  });

  it("services : deux options cochées sur une cible de 4 → 50 ; les options décochées ne comptent pas", () => {
    expect(note(demande({ services: { emballage: true, demontage: true, montage: false } }), "services")).toBe(50);
  });

  it("formule : Premium 100, Standard 66, Économique 33, autre 50", () => {
    expect(note(demande({ formule: "luxe" }), "formule")).toBe(100);
    expect(note(demande({ formule: "standard" }), "formule")).toBe(66);
    expect(note(demande({ formule: "eco" }), "formule")).toBe(33);
    expect(note(demande({ formule: "inconnue" }), "formule")).toBe(50);
  });

  it("accès : 100 − 15 par étage sans ascenseur, des deux côtés, jamais sous 0", () => {
    expect(note(demande({ depart_etage: 2, depart_ascenseur: false, arrivee_etage: 0 }), "acces")).toBe(70);
    expect(note(demande({ depart_etage: 2, depart_ascenseur: false, arrivee_etage: 3, arrivee_ascenseur: false }), "acces")).toBe(25);
    expect(note(demande({ depart_etage: 6, depart_ascenseur: true, arrivee_etage: 0 }), "acces")).toBe(100);
    expect(note(demande({ depart_etage: 10, depart_ascenseur: false }), "acces")).toBe(0);
  });

  it("planning : dates flexibles = 100", () => {
    expect(note(demande({ flexibilite: "souple" }), "planning")).toBe(100);
  });

  it("planning : plus de 30 jours → 85 ; de 11 à 30 → 60 ; 10 ou moins → 35 (bornes au jour près)", () => {
    // « maintenant » = 2026-11-15T00:00:00Z
    expect(note(demande({ date_souhaitee: "2026-12-16" }), "planning")).toBe(85); // 31 jours
    expect(note(demande({ date_souhaitee: "2026-12-15" }), "planning")).toBe(60); // 30 jours
    expect(note(demande({ date_souhaitee: "2026-11-26" }), "planning")).toBe(60); // 11 jours
    expect(note(demande({ date_souhaitee: "2026-11-25" }), "planning")).toBe(35); // 10 jours
    expect(note(demande({ date_souhaitee: "2026-11-01" }), "planning")).toBe(35); // passée
  });

  it("planning : une date illisible compte comme une date inconnue (60)", () => {
    expect(note(demande({ date_souhaitee: "pas une date" }), "planning")).toBe(60);
  });
});

describe("analyzeRequest — seuls les critères renseignés sont notés", () => {
  it("demande vide : aucun critère, score 0, difficulté 50", () => {
    expect(analyzeRequest(demande(), DEFAULT_CRITERIA)).toEqual({ score: 0, difficulte: 50, lines: [] });
  });

  it("une distance nulle n'est pas une donnée", () => {
    expect(note(demande({ distance_km: 0 }), "distance")).toBeUndefined();
  });

  it("un volume nul en est une (note 0)", () => {
    expect(note(demande({ volume_m3: 0 }), "volume")).toBe(0);
  });

  it("le score se repondère sur les seuls critères présents : volume seul à 40 m³ → 100", () => {
    expect(analyzeRequest(demande({ volume_m3: 40 }), DEFAULT_CRITERIA).score).toBe(100);
  });

  it("un critère désactivé ou de poids nul n'est pas noté", () => {
    const criteres = DEFAULT_CRITERIA.map((c) =>
      c.key === "volume" ? { ...c, enabled: false } : c.key === "distance" ? { ...c, poids: 0 } : c,
    );
    const r = analyzeRequest(demande({ volume_m3: 40, distance_km: 400, estimation_prix: 500 }), criteres);
    expect(r.lines.map((l) => l.key)).toEqual(["valeur"]);
    expect(r.score).toBe(0);
  });

  it("tous les critères désactivés : score 0 sans division par zéro", () => {
    const r = analyzeRequest(demande({ volume_m3: 40 }), DEFAULT_CRITERIA.map((c) => ({ ...c, enabled: false })));
    expect(r.score).toBe(0);
  });
});

describe("analyzeRequest — score et difficulté", () => {
  const complete = demande({
    estimation_prix: 2750, volume_m3: 22.5, distance_km: 200,
    services: { emballage: true, demontage: true }, formule: "standard",
    depart_etage: 2, depart_ascenseur: false, arrivee_etage: 0, arrivee_ascenseur: false,
    flexibilite: "souple",
  });

  it("demande complète : score pondéré calculé à la main = 62, difficulté = 100 − 70 = 30", () => {
    // notes : 50, 50, 50, 50, 66, 70, 100 ; poids : 25, 15, 10, 10, 10, 15, 15 (somme 100)
    // 12,5 + 7,5 + 5 + 5 + 6,6 + 10,5 + 15 = 62,1 → 62
    const r = analyzeRequest(complete, DEFAULT_CRITERIA);
    expect(r.score).toBe(62);
    expect(r.difficulte).toBe(30);
    expect(r.lines.map((l) => l.key)).toEqual(CRITERIA_ORDER);
  });

  it("chaque contribution = note × poids / somme des poids, arrondie", () => {
    const r = analyzeRequest(complete, DEFAULT_CRITERIA);
    for (const l of r.lines) expect(l.contribution).toBe(Math.round((l.note * l.poids) / 100));
  });

  it("la somme des contributions arrondies ne s'écarte du score que d'un demi-point par ligne au plus", () => {
    const r = analyzeRequest(complete, DEFAULT_CRITERIA);
    const somme = r.lines.reduce((s, l) => s + l.contribution, 0);
    expect(Math.abs(somme - r.score)).toBeLessThanOrEqual(r.lines.length / 2);
  });

  it("le score reste entre 0 et 100, et la difficulté aussi, quelles que soient les données", () => {
    for (const prix of [0, 400, 3000, 1e7])
      for (const vol of [0, 5, 100])
        for (const etage of [0, 3, 50]) {
          const r = analyzeRequest(demande({ estimation_prix: prix, volume_m3: vol, depart_etage: etage, depart_ascenseur: false }), DEFAULT_CRITERIA);
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(100);
          expect(r.difficulte).toBeGreaterThanOrEqual(0);
          expect(r.difficulte).toBeLessThanOrEqual(100);
        }
  });

  it("à critères égaux, un prix plus élevé ne baisse jamais le score", () => {
    let prec = -1;
    for (let prix = 0; prix <= 8000; prix += 250) {
      const s = analyzeRequest(demande({ estimation_prix: prix, volume_m3: 20 }), DEFAULT_CRITERIA).score;
      expect(s).toBeGreaterThanOrEqual(prec);
      prec = s;
    }
  });

  it("réglages inversés (cible sous le plancher) : la note décroît avec la valeur", () => {
    const criteres: CriterionConfig[] = DEFAULT_CRITERIA.map((c) => (c.key === "volume" ? { ...c, floor: 100, target: 0 } : c));
    expect(note(demande({ volume_m3: 25 }), "volume", criteres)).toBe(75);
  });

  it("plancher égal à la cible : note 0 plutôt qu'une division par zéro", () => {
    const criteres = DEFAULT_CRITERIA.map((c) => (c.key === "volume" ? { ...c, floor: 10, target: 10 } : c));
    expect(note(demande({ volume_m3: 25 }), "volume", criteres)).toBe(0);
  });

  it("détails lisibles : « 2750 € TTC », « 200 km », « dates flexibles »", () => {
    const d = Object.fromEntries(analyzeRequest(complete, DEFAULT_CRITERIA).lines.map((l) => [l.key, l.detail]));
    expect(d).toMatchObject({ valeur: "2750 € TTC", distance: "200 km", services: "2 prestation(s)", formule: "standard", acces: "70/100 de facilité", planning: "dates flexibles" });
  });

  it("idempotente : deux analyses de la même demande donnent le même résultat", () => {
    expect(analyzeRequest(complete, DEFAULT_CRITERIA)).toEqual(analyzeRequest(complete, DEFAULT_CRITERIA));
  });
});
