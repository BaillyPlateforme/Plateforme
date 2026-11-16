import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined) }));

import { q } from "@/crm/lib/db";
import {
  aujourdhuiParis, comparaisonDe, creneauxDe, douzeMois, estPeriode, moisCourt, moisDansPeriode, periodeDe, PERIODE_PAR_DEFAUT, plusJours, type ClePeriode,
} from "@/crm/statistiques/periodes";
import { couleursUtilisateurs, NEUTRE, RAMPE, rampe, SERIES } from "@/crm/statistiques/palette";
import { statsCommerciales, statsExploitation } from "@/crm/statistiques/donnees";
import { deplier, estPeriodicite, numeroContrat, plusMois, prochaineEcheance, resumer } from "@/crm/garde-meuble/regles";
import { calculer, type Contrat } from "@/crm/garde-meuble/donnees";
import { controler, estJalon, estStatut, etatJalon, numeroNormalise, totaux, verifierNumero, type DonneesControle } from "@/crm/conteneurs/regles";

const le = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};
afterEach(() => vi.useRealTimers());

describe("statistiques/periodes · periodeDe", () => {
  it("le 8 novembre 2026 : mois, mois dernier, trimestre, année, 12 mois glissants (fin exclue)", () => {
    le("2026-11-08T10:00:00Z");
    expect(periodeDe("mois")).toMatchObject({ debut: "2026-11-01", fin: "2026-12-01", phrase: "novembre 2026" });
    expect(periodeDe("mois-dernier")).toMatchObject({ debut: "2026-10-01", fin: "2026-11-01", phrase: "octobre 2026" });
    expect(periodeDe("trimestre")).toMatchObject({ debut: "2026-10-01", fin: "2027-01-01", phrase: "4ᵉ trimestre 2026" });
    expect(periodeDe("annee")).toMatchObject({ debut: "2026-01-01", fin: "2027-01-01", phrase: "année 2026" });
    expect(periodeDe("12-mois")).toMatchObject({ debut: "2025-12-01", fin: "2026-12-01", phrase: "12 derniers mois" });
  });
  it("une clé inconnue donne la période par défaut (l'année)", () => {
    le("2026-11-08T10:00:00Z");
    expect(PERIODE_PAR_DEFAUT).toBe("annee");
    expect(periodeDe("pirate").cle).toBe("annee");
    expect(periodeDe(undefined).cle).toBe("annee");
    expect(estPeriode("toString")).toBe(false);
  });
  it("en janvier, le mois dernier est décembre de l'année d'avant ; le 31 décembre à 23 h 30 UTC, on est déjà en janvier à Paris", () => {
    le("2027-01-15T10:00:00Z");
    expect(periodeDe("mois-dernier")).toMatchObject({ debut: "2026-12-01", fin: "2027-01-01", phrase: "décembre 2026" });
    expect(periodeDe("trimestre")).toMatchObject({ debut: "2027-01-01", fin: "2027-04-01", phrase: "1ᵉ trimestre 2027" });
    le("2026-12-31T23:30:00Z");
    expect(periodeDe("mois")).toMatchObject({ debut: "2027-01-01", fin: "2027-02-01" });
    expect(aujourdhuiParis()).toBe("2027-01-01");
  });
  it("les douze derniers mois, celui en cours compris", () => {
    le("2026-11-08T10:00:00Z");
    const d = douzeMois();
    expect(d.mois).toHaveLength(12);
    expect(d.mois[0]).toBe("2025-12");
    expect(d.mois[11]).toBe("2026-11");
    expect(d).toMatchObject({ debut: "2025-12-01", fin: "2026-12-01" });
  });
  it("moisCourt et moisDansPeriode", () => {
    le("2026-11-08T10:00:00Z");
    expect(moisCourt("2026-03")).toBe("mars");
    expect(moisCourt("2027-01", true)).toBe("janv. 27");
    const p = periodeDe("trimestre");
    expect(["2026-09", "2026-10", "2026-12", "2027-01"].map((m) => moisDansPeriode(m, p))).toEqual([false, true, true, false]);
    expect(plusJours("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("statistiques/periodes · comparaisonDe", () => {
  it("« à date » : 1er–8 nov. contre 1er–8 oct.", () => {
    le("2026-11-08T10:00:00Z");
    const c = comparaisonDe(periodeDe("mois"), "a-date");
    expect(c.courante).toEqual({ debut: "2026-11-01", fin: "2026-11-09" });
    expect(c.precedente).toEqual({ debut: "2026-10-01", fin: "2026-10-09" });
    expect(c.libelle).toBe("vs oct. à date");
    expect(c.precis).toBe("du 1er oct. au 8 oct. 2026");
  });
  it("« entière » : le mois d'avant tout entier", () => {
    le("2026-11-08T10:00:00Z");
    const c = comparaisonDe(periodeDe("mois"), "entiere");
    expect(c.courante).toEqual({ debut: "2026-11-01", fin: "2026-12-01" });
    expect(c.precedente).toEqual({ debut: "2026-10-01", fin: "2026-11-01" });
    expect(c.libelle).toBe("vs octobre");
    expect(c.precis).toBe("du 1er oct. au 31 oct. 2026");
  });
  it("l'année à date : 312 jours de chaque côté (du 1er janv. au 8 nov.)", () => {
    le("2026-11-08T10:00:00Z");
    const c = comparaisonDe(periodeDe("annee"), "a-date");
    expect(c.precedente).toEqual({ debut: "2025-01-01", fin: "2025-11-09" });
    expect(c.libelle).toBe("vs 2025 à date");
    expect(c.precis).toBe("du 1er janv. au 8 nov. 2025");
  });
  it("la période d'avant « à date » ne déborde jamais du mois d'avant (31 mars contre février)", () => {
    le("2028-03-30T10:00:00Z"); // année bissextile : février a 29 jours
    const c = comparaisonDe(periodeDe("mois"), "a-date");
    expect(c.precedente).toEqual({ debut: "2028-02-01", fin: "2028-03-01" });
    expect(c.libelle).toBe("vs février");
  });
  it("le trimestre d'avant : T3 ; au premier trimestre, T4 de l'année d'avant", () => {
    le("2026-11-08T10:00:00Z");
    expect(comparaisonDe(periodeDe("trimestre"), "a-date")).toMatchObject({ libelle: "vs T3 à date", precedente: { debut: "2026-07-01", fin: "2026-08-09" } });
    le("2027-02-10T10:00:00Z");
    expect(comparaisonDe(periodeDe("trimestre"), "entiere").libelle).toBe("vs T4 2026");
  });
  it("mois dernier, 12 mois glissants : leurs libellés", () => {
    le("2027-01-15T10:00:00Z");
    expect(comparaisonDe(periodeDe("mois-dernier"), "a-date").libelle).toBe("vs novembre 2026");
    expect(comparaisonDe(periodeDe("12-mois"), "a-date").libelle).toBe("vs un an plus tôt");
  });
  it("propriété : la période d'avant finit avant la courante ; « à date », elle ne dure pas plus qu'elle", () => {
    for (const jour of ["2026-01-01", "2026-02-28", "2026-03-29", "2026-10-25", "2026-12-31", "2028-02-29", "2027-07-15"]) {
      le(`${jour}T12:00:00Z`);
      for (const cle of ["mois", "mois-dernier", "trimestre", "annee", "12-mois"] as ClePeriode[]) for (const mode of ["a-date", "entiere"] as const) {
        const c = comparaisonDe(periodeDe(cle), mode);
        const duree = (i: { debut: string; fin: string }) => (Date.parse(i.fin) - Date.parse(i.debut)) / 864e5;
        expect(c.precedente.fin <= c.courante.debut).toBe(true);
        expect(duree(c.precedente)).toBeGreaterThan(0);
        // Une période finie se compare à la précédente entière (février contre janvier) : seule une période en cours est arrêtée.
        if (mode === "a-date" && periodeDe(cle).fin > plusJours(aujourdhuiParis(), 1)) expect(duree(c.precedente)).toBeLessThanOrEqual(duree(c.courante) + 0.01);
      }
    }
  });
});

describe("statistiques/periodes · creneauxDe", () => {
  it("les jours du mois jusqu'à aujourd'hui, une étiquette tous les 5 jours", () => {
    le("2026-11-08T10:00:00Z");
    const c = creneauxDe(periodeDe("mois"));
    expect(c.map((x) => x.cle)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"].map((j) => `2026-11-${j}`));
    expect(c.map((x) => x.libelle)).toEqual(["1", "", "", "", "5", "", "", ""]);
    expect(c[0].detail).toBe("1er nov.");
    expect(creneauxDe(periodeDe("mois-dernier"))).toHaveLength(31);
  });
  it("les semaines du trimestre, du lundi, la première et la dernière coupées", () => {
    le("2026-11-08T10:00:00Z");
    const c = creneauxDe(periodeDe("trimestre"));
    expect(c.map((x) => [x.debut, x.fin])).toEqual([
      ["2026-10-01", "2026-10-05"], ["2026-10-05", "2026-10-12"], ["2026-10-12", "2026-10-19"], ["2026-10-19", "2026-10-26"], ["2026-10-26", "2026-11-02"], ["2026-11-02", "2026-11-09"],
    ]);
  });
  it("les mois de l'année, le dernier coupé à demain ; 12 mois glissants : l'année sur janvier", () => {
    le("2026-11-08T10:00:00Z");
    const a = creneauxDe(periodeDe("annee"));
    expect(a).toHaveLength(11);
    expect(a.at(-1)).toMatchObject({ cle: "2026-11", debut: "2026-11-01", fin: "2026-11-09" });
    const g = creneauxDe(periodeDe("12-mois"));
    expect(g).toHaveLength(12);
    expect(g.find((x) => x.cle === "2026-01")?.libelle).toBe("janv. 26");
  });
  it("propriété : des créneaux contigus, qui couvrent la période jusqu'à demain, 31 au plus", () => {
    for (const jour of ["2026-01-01", "2026-03-29", "2026-12-31", "2028-02-29"]) {
      le(`${jour}T12:00:00Z`);
      for (const cle of ["mois", "mois-dernier", "trimestre", "annee", "12-mois"] as ClePeriode[]) {
        const p = periodeDe(cle);
        const c = creneauxDe(p);
        const demain = plusJours(aujourdhuiParis(), 1);
        expect(c.length).toBeGreaterThan(0);
        expect(c.length).toBeLessThanOrEqual(31);
        expect(c[0].debut).toBe(p.debut);
        expect(c.at(-1)!.fin).toBe(p.fin < demain ? p.fin : demain);
        for (let i = 1; i < c.length; i++) expect(c[i].debut).toBe(c[i - 1].fin);
      }
    }
  });
});

describe("statistiques/palette", () => {
  it("rampe : n teintes de la rampe, extrémités gardées", () => {
    expect(rampe(5)).toEqual(RAMPE);
    expect(rampe(9)).toEqual(RAMPE);
    expect(rampe(1)).toEqual([RAMPE[4]]);
    expect(rampe(0)).toEqual([RAMPE[4]]);
    expect(rampe(2)).toEqual([RAMPE[0], RAMPE[4]]);
    expect(rampe(3)).toEqual([RAMPE[0], RAMPE[2], RAMPE[4]]);
    expect(rampe(4)).toEqual([RAMPE[0], RAMPE[1], RAMPE[3], RAMPE[4]]);
  });
  it("une couleur par personne, stable : commerciaux d'abord par identifiant, gris au-delà de cinq", () => {
    const m = couleursUtilisateurs([{ id: 9, role: "admin" }, { id: 4, role: "commercial" }, { id: 2, role: "commercial" }, { id: 1, role: "admin" }, { id: 5, role: "rh" }, { id: 6, role: "admin" }]);
    expect(m.get(2)).toBe(SERIES[0]);
    expect(m.get(4)).toBe(SERIES[1]);
    expect(m.get(1)).toBe(SERIES[2]);
    expect(m.get(9)).toBe(NEUTRE);
    expect(m.get(null)).toBe(NEUTRE);
    expect(couleursUtilisateurs([]).get(null)).toBe(NEUTRE);
  });
});

describe("statistiques/donnees · périodes vides et agrégats (base simulée)", () => {
  beforeEach(() => le("2026-11-08T10:00:00Z"));
  afterEach(() => vi.mocked(q).mockReset().mockResolvedValue([]));

  it("une base vide : tous les totaux à zéro, douze mois à zéro, ni NaN ni « sans date »", async () => {
    const s = await statsCommerciales(periodeDe("mois"), "signature");
    expect(s.lignes).toEqual([]);
    expect(s.totaux).toEqual({ visites: 0, vd: 0, vdv: 0, devises: 0, ds: 0, signes: 0, ca: 0, arrhes: 0 });
    expect(s.sansDate).toBeNull();
    expect(s.arrhes).toEqual({ n: 0, total: 0 });
    for (const serie of Object.values(s.mensuel)) expect(serie).toEqual(Array(12).fill(0));
    expect(s.comparaison.libelle).toBe("vs oct. à date");
    const e = await statsExploitation(periodeDe("annee"));
    expect(e.dem).toEqual({ n: 0, volume: 0, moyen: null, termines: 0 });
    expect(e.aPlanifier).toBe(0);
    for (const serie of Object.values(e.mensuel)) expect(serie).toEqual(Array(12).fill(0));
  });
  it("les totaux sont la somme des commerciaux ; « Sans commercial » n'apparaît que s'il porte quelque chose", async () => {
    vi.mocked(q).mockImplementation((async (sql: string) => {
      if (/with vis as/.test(sql)) return [
        { id: 1, nom: "Paul", initiales: "PD", visites: 3, visitesDossiers: 2, visitesDevisees: 1, devises: 2, devisesSignes: 1, signes: 1, ca: 2400 },
        { id: 2, nom: "Lina", initiales: "LM", visites: 1, visitesDossiers: 1, visitesDevisees: 1, devises: 1, devisesSignes: 0, signes: 0, ca: 0 },
        { id: null, nom: "Sans commercial", initiales: "—", visites: 0, visitesDossiers: 0, visitesDevisees: 0, devises: 0, devisesSignes: 0, signes: 0, ca: 0 },
      ];
      if (/'YYYY-MM'\) as mois, sum\(v\.montant\)::float8 as ca/.test(sql)) return [{ cid: 1, mois: "2026-11", ca: 2400, n: 1 }, { cid: 1, mois: "2026-03", ca: 1000, n: 1 }, { cid: 2, mois: "2026-11", ca: 600, n: 1 }];
      return [];
    }) as never);
    const s = await statsCommerciales(periodeDe("mois"), "signature");
    expect(s.lignes.map((l) => l.nom)).toEqual(["Paul", "Lina"]);
    expect(s.totaux).toMatchObject({ visites: 4, vd: 3, vdv: 2, devises: 3, ds: 1, signes: 1, ca: 2400 });
    expect(s.mensuel.ca.at(-1)).toBe(3000);
    expect(s.mensuel.ca[s.mois.indexOf("2026-03")]).toBe(1000);
    expect(s.mensuel.signes.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("garde-meuble/regles · échéances", () => {
  it("plus n mois, ramené à la fin du mois", () => {
    expect(plusMois("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMois("2028-01-31", 1)).toBe("2028-02-29");
    expect(plusMois("2026-03-31", -1)).toBe("2026-02-28");
    expect(plusMois("2026-12-15", 1)).toBe("2027-01-15");
    expect(plusMois("2026-11-30", 3)).toBe("2027-02-28");
    expect(plusMois("2026-08-31T22:00:00Z", 1)).toBe("2026-09-30");
    const d = new Date("2026-05-31T00:00:00Z");
    expect(plusMois(d, 1)).toBe("2026-06-30");
    expect(d.toISOString()).toBe("2026-05-31T00:00:00.000Z"); // la date reçue n'est pas modifiée
  });
  it("la prochaine échéance : une période après la dernière facture, sinon après le début", () => {
    expect(prochaineEcheance({ debut: "2026-01-15", periodicite: "mensuelle" })).toBe("2026-02-15");
    expect(prochaineEcheance({ debut: "2026-01-15", derniere_facture: "2026-10-15", periodicite: "mensuelle" })).toBe("2026-11-15");
    expect(prochaineEcheance({ debut: "2026-01-15", derniere_facture: "2026-10-15", periodicite: "trimestrielle" })).toBe("2027-01-15");
    expect(prochaineEcheance({ debut: "2026-01-15", periodicite: "annuelle" })).toBe("2026-02-15"); // inconnue : mensuelle
  });
  it("l'échéance saisie cale la suivante tant qu'elle n'est pas facturée", () => {
    expect(prochaineEcheance({ debut: "2026-01-15", derniere_facture: "2026-10-15", echeance: "2026-11-20", periodicite: "mensuelle" })).toBe("2026-11-20");
    expect(prochaineEcheance({ debut: "2026-01-15", derniere_facture: "2026-10-15", echeance: "2026-10-15", periodicite: "mensuelle" })).toBe("2026-11-15");
    expect(prochaineEcheance({ debut: "2026-01-15", echeance: new Date("2026-03-01T00:00:00Z"), periodicite: "mensuelle" })).toBe("2026-03-01");
  });
  it("estPeriodicite : mensuelle et trimestrielle", () => {
    expect(estPeriodicite("mensuelle") && estPeriodicite("trimestrielle")).toBe(true);
    expect(estPeriodicite("hebdo")).toBe(false);
    expect(estPeriodicite(3)).toBe(false);
  });
  it("calculer : retard en jours, montant d'une période, à facturer dès l'échéance", () => {
    le("2026-11-15T10:00:00Z");
    const c = (o: Partial<Contrat>) => ({ id: 1, loyer: 80, periodicite: "mensuelle", debut: new Date("2026-10-15T00:00:00Z"), derniere_facture: null, echeance_saisie: null, actif: true, ...o }) as Contrat;
    expect(calculer(c({}))).toMatchObject({ echeance: "2026-11-15", retard: 0, montant: 80, afacturer: true });
    expect(calculer(c({ periodicite: "trimestrielle" }))).toMatchObject({ echeance: "2027-01-15", retard: -61, montant: 240, afacturer: false });
    expect(calculer(c({ debut: new Date("2026-09-01T00:00:00Z") }))).toMatchObject({ echeance: "2026-10-01", retard: 45, afacturer: true });
    expect(calculer(c({ actif: false })).afacturer).toBe(false);
  });
});

describe("garde-meuble/regles · numéros de caisses", () => {
  it("déplie une liste et les suites « A à B », « A - B »", () => {
    expect(deplier("GM-0412, GM-0413")).toEqual(["GM-0412", "GM-0413"]);
    expect(deplier("GM-0600 à GM-0603")).toEqual(["GM-0600", "GM-0601", "GM-0602", "GM-0603"]);
    expect(deplier("GM-0009 - GM-0011")).toEqual(["GM-0009", "GM-0010", "GM-0011"]);
    expect(deplier("R2-R4;\nCaisse 1 a Caisse 2")).toEqual(["R2", "R3", "R4", "Caisse 1", "Caisse 2"]);
    expect(deplier("98 à 101")).toEqual(["98", "99", "100", "101"]);
  });
  it("ne déplie pas une suite à l'envers, de préfixes différents ou de 500 numéros et plus", () => {
    expect(deplier("GM-0611 à GM-0600")).toEqual(["GM-0611 à GM-0600"]);
    expect(deplier("GM-0600 à HM-0611")).toEqual(["GM-0600 à HM-0611"]);
    expect(deplier("1 à 600")).toEqual(["1 à 600"]);
    expect(deplier("1 à 500")).toHaveLength(500);
  });
  it("vide, doublons, morceaux énormes, liste interminable : au plus 500 numéros de 40 caractères", () => {
    expect(deplier(null)).toEqual([]);
    expect(deplier(" , ;; \n ")).toEqual([]);
    expect(deplier("A1, A1, A1")).toEqual(["A1"]);
    expect(deplier("x".repeat(10000))[0]).toHaveLength(40);
    expect(deplier(Array.from({ length: 3000 }, (_, i) => `C${i}`).join(","))).toHaveLength(500);
  });
  it("résume en repliant les suites de trois ou plus", () => {
    expect(resumer(["GM-0600", "GM-0601", "GM-0602", "GM-0610"])).toBe("GM-0600 à GM-0602, GM-0610");
    expect(resumer(["GM-0600", "GM-0601"])).toBe("GM-0600, GM-0601");
    expect(resumer(["A9", "A10", "A11"])).toBe("A9, A10, A11"); // largeurs différentes : pas une suite
    expect(resumer(["vrac", "B1"])).toBe("vrac, B1");
    expect(resumer([])).toBe("");
  });
  it("propriété : deplier(resumer(x)) rend x pour toute liste triée sans doublon", () => {
    let g = 5;
    const r = () => ((g = (g * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 300; k++) {
      const n = new Set<number>();
      const taille = 1 + Math.floor(r() * 40);
      let x = Math.floor(r() * 50);
      while (n.size < taille) { n.add(x); x += r() < 0.7 ? 1 : 2 + Math.floor(r() * 5); }
      const numeros = [...n].sort((a, b) => a - b).map((v) => `GM-${String(v).padStart(4, "0")}`);
      expect(deplier(resumer(numeros))).toEqual(numeros);
    }
  });
  it("numéro de contrat : CGM- et quatre chiffres au moins", () => {
    expect(numeroContrat(7)).toBe("CGM-0007");
    expect(numeroContrat(12345)).toBe("CGM-12345");
  });
});

describe("conteneurs/regles · numéro ISO 6346", () => {
  it("reconnaît un numéro juste, en majuscules ou non, avec espaces et tirets", () => {
    // C=13, S=30, Q=28, U=32 ; Σ = 13 + 60 + 112 + 256 + 3·16 + 0 + 5·64 + 4·128 + 3·256 + 8·512 = 6 185 ; 6 185 mod 11 = 3
    expect(verifierNumero("CSQU3054383")).toEqual({ valide: true, attendu: 3 });
    expect(verifierNumero("csqu 305438-3")).toEqual({ valide: true, attendu: 3 });
    expect(numeroNormalise("TCLU 507215-0")).toBe("TCLU5072150");
  });
  it("signale un chiffre de contrôle faux, avec l'attendu", () => {
    expect(verifierNumero("CSQU3054384")).toEqual({ valide: false, attendu: 3 });
  });
  it("rend null pour ce qui n'a pas la forme d'un numéro (provisoire, interne)", () => {
    for (const n of ["", "ABC1234567", "CSQA3054383", "CSQU305438", "CSQU30543833", "PROVISOIRE-12", "ÉSQU3054383"]) expect(verifierNumero(n)).toBeNull();
  });
  it("gardes : statuts et jalons connus", () => {
    expect(estStatut("en_mer")).toBe(true);
    expect(estStatut("coulé")).toBe(false);
    expect(estJalon("bae")).toBe(true);
    expect(estJalon("toString")).toBe(false);
  });
});

describe("conteneurs/regles · controler et totaux", () => {
  const base: DonneesControle = {
    numero: "CSQU3054383", statut: "preparation", plomb: null, capacite: 67, utilise: 30, depart_prevu: "2026-12-01", arrivee_prevue: "2026-12-20", navire: null,
    jalons: {}, clients: 3, clientsPerdus: [], clientsSansVolume: [], venteReelle: null, revientReel: null, aujourdhui: "2026-11-15",
  };
  const textes = (d: DonneesControle) => controler(d).map((a) => `${a.niveau}:${a.onglet}:${a.texte}`);

  it("une fiche cohérente ne signale rien", () => {
    expect(controler(base)).toEqual([]);
  });
  it("numéro faux, volume dépassé, arrivée avant le départ", () => {
    const a = textes({ ...base, numero: "CSQU3054384", utilise: 67.5, arrivee_prevue: "2026-11-30" });
    expect(a).toEqual([
      "attention:fiche:Le chiffre de contrôle du numéro CSQU3054384 ne correspond pas (attendu : 3). Vérifiez la saisie.",
      "erreur:contenu:Le volume chargé (67.5 m³) dépasse la capacité (67 m³).",
      "erreur:fiche:L'arrivée prévue précède le départ prévu.",
    ]);
    expect(controler({ ...base, utilise: 67 })).toEqual([]); // plein n'est pas dépassé
  });
  it("une date réelle dans le futur ; des jalons réels dans le désordre (erreur), prévus (attention)", () => {
    const a = controler({ ...base, jalons: { empote: { prevu: "2026-11-10", reel: "2026-11-16" }, embarquement: { prevu: "2026-11-05", reel: null } } });
    expect(a.map((x) => x.niveau)).toEqual(["erreur", "attention"]);
    expect(a[0].texte).toBe("Empoté : la date réelle (16 nov.) est dans le futur.");
    expect(a[1].texte).toBe("Dates prévues : embarquement (5 nov.) avant empoté (10 nov.).");
    const reel = controler({ ...base, statut: "en_mer", plomb: "P1", navire: "N", jalons: { empote: { prevu: null, reel: "2026-11-10" }, embarquement: { prevu: null, reel: "2026-11-08" } } });
    expect(reel).toEqual([{ niveau: "erreur", texte: "Dates réelles : embarquement (8 nov.) avant empoté (10 nov.).", onglet: "jalons" }]);
  });
  it("statut et jalons : en mer sans embarquement, embarqué mais « chargé », sans plomb, sans navire, sans client", () => {
    expect(textes({ ...base, statut: "en_mer", clients: 0 }).map((t) => t.split(":")[2])).toEqual([
      "Statut « En mer » sans date réelle d'embarquement.", "Statut « En mer » sans numéro de plomb.", "Conteneur en route sans navire renseigné.", "Conteneur chargé sans aucun client.",
    ]);
    expect(controler({ ...base, statut: "charge", plomb: "P", jalons: { embarquement: { prevu: null, reel: "2026-11-10" } } })[0].texte).toBe("Embarqué le 10 nov., mais le statut est « Chargé ».");
    expect(controler({ ...base, statut: "pirate" })).toEqual([]); // statut inconnu : lu « En préparation »
  });
  it("contenu et coûts : dossier perdu, client sans volume, vente réelle sans revient", () => {
    const a = controler({ ...base, clientsPerdus: ["Martin"], clientsSansVolume: ["Durand"], venteReelle: 1000 });
    expect(a.map((x) => [x.niveau, x.onglet])).toEqual([["erreur", "contenu"], ["attention", "contenu"], ["attention", "couts"]]);
  });
  it("état d'un jalon : fait, en retard, prévu, vide", () => {
    expect(etatJalon({ prevu: "2026-11-01", reel: "2026-11-02" }, "2026-11-15")).toBe("fait");
    expect(etatJalon({ prevu: "2026-11-14", reel: null }, "2026-11-15")).toBe("retard");
    expect(etatJalon({ prevu: "2026-11-15", reel: null }, "2026-11-15")).toBe("prevu");
    expect(etatJalon(undefined, "2026-11-15")).toBe("vide");
  });
  it("totaux des coûts : les marges seulement quand les deux côtés sont connus", () => {
    expect(totaux([])).toEqual({ revientPrevu: null, revientReel: null, ventePrevue: null, venteReelle: null, margePrevue: null, margeReelle: null });
    expect(totaux([
      { revient_prevu: 100, revient_reel: null, vente_prevue: 150, vente_reelle: 160 },
      { revient_prevu: 50, revient_reel: 40, vente_prevue: null, vente_reelle: null },
    ])).toEqual({ revientPrevu: 150, revientReel: 40, ventePrevue: 150, venteReelle: 160, margePrevue: 0, margeReelle: 120 });
  });
});
