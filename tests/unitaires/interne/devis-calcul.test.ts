import { describe, expect, it } from "vitest";
import { arrhes, calculer, lignesPourBase, marge, montantLigne, prixDeVente, primes, r2, totauxAchats } from "@/crm/devis/calcul";
import type { Achat, Assurance, Chiffrage, LigneDevis } from "@/crm/devis/modele";

/* Un générateur pseudo-aléatoire à graine : les propriétés se rejouent à l'identique. */
function hasard(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SANS_ASSURANCE: Assurance = { tva: null, contractuelle: { valeur: null, taux: null }, dommage: { valeur: null, taux: null, franchise: null, sansFranchise: false } };

const ligne = (id: string, qte: number, pu: number, tva: number, charge: "bailly" | "client" = "bailly"): LigneDevis => ({
  id, groupe: "base", libelle: `Ligne ${id}`, detail: "", qte, unite: "", pu, tva, charge,
});

const chiffrage = (o: Partial<Chiffrage> = {}): Chiffrage => ({ mode: "postes", saisie: "ht", remisePct: 0, lignes: [], assurance: SANS_ASSURANCE, ...o });

describe("devis/calcul · r2 (arrondi au centime)", () => {
  it("arrondit 1,005 à 1,01 malgré l'erreur des flottants", () => {
    expect(r2(1.005)).toBe(1.01);
    expect(r2(2.675)).toBe(2.68);
    expect(r2(0.1 + 0.2)).toBe(0.3);
  });
  it("laisse un montant déjà au centime intact, zéro compris", () => {
    expect(r2(0)).toBe(0);
    expect(r2(12.34)).toBe(12.34);
    expect(r2(1e9 + 0.01)).toBe(1e9 + 0.01);
  });
  it("arrondit les très grands montants sans perdre l'ordre de grandeur", () => {
    expect(r2(123456789.123)).toBe(123456789.12);
  });
});

describe("devis/calcul · montantLigne et primes", () => {
  it("multiplie quantité et prix unitaire, au centime", () => {
    // 3 × 33,333 = 99,999 → 100,00
    expect(montantLigne({ qte: 3, pu: 33.333 })).toBe(100);
    expect(montantLigne({ qte: 0.5, pu: 19.99 })).toBe(10); // 9,995 → 10,00
  });
  it("lit une quantité ou un prix absent, NaN ou infini comme zéro", () => {
    expect(montantLigne({ qte: NaN, pu: 10 })).toBe(0);
    expect(montantLigne({ qte: 2, pu: Infinity })).toBe(0);
    expect(montantLigne({ qte: undefined as unknown as number, pu: 10 })).toBe(0);
  });
  it("calcule les primes d'assurance : valeur × taux / 100", () => {
    // 10 000 × 0,5 % = 50 ; 2 000 × 1 % = 20
    expect(primes({ ...SANS_ASSURANCE, contractuelle: { valeur: 10000, taux: 0.5 }, dommage: { valeur: 2000, taux: 1, franchise: null, sansFranchise: false } })).toEqual({ c: 50, d: 20 });
    expect(primes(SANS_ASSURANCE)).toEqual({ c: 0, d: 0 });
  });
});

describe("devis/calcul · calculer (saisie HT)", () => {
  const ch = chiffrage({
    remisePct: 10,
    lignes: [ligne("a", 2, 100, 20), ligne("b", 1, 50, 10), ligne("c", 3, 10, 20, "client")],
    assurance: { tva: null, contractuelle: { valeur: 10000, taux: 0.5 }, dommage: { valeur: 2000, taux: 1, franchise: null, sansFranchise: false } },
  });
  const c = calculer(ch, 20);

  it("donne le montant de chaque ligne, même à la charge du client", () => {
    expect(c.montants).toEqual({ a: 200, b: 50, c: 30 });
  });
  it("ventile par taux, du plus fort au plus faible, remise déduite", () => {
    // 20 % : brut 200, remise 20, net 180, TVA 36 ; 10 % : brut 50, remise 5, net 45, TVA 4,50
    expect(c.parTaux).toEqual([
      { taux: 20, brut: 200, remise: 20, net: 180, ht: 180, tva: 36, ttc: 216 },
      { taux: 10, brut: 50, remise: 5, net: 45, ht: 45, tva: 4.5, ttc: 49.5 },
    ]);
  });
  it("ajoute l'assurance en HT, avec la TVA par défaut quand elle n'a pas la sienne", () => {
    // primes 50 + 20 = 70 HT ; TVA 20 % = 14
    expect(c.assuranceHt).toBe(70);
    expect(c.assuranceTva).toBe(14);
  });
  it("fait les totaux : HT 295, TVA 54,50, TTC 349,50", () => {
    // HT = 180 + 45 + 70 ; TVA = 36 + 4,5 + 14 ; TTC = HT + TVA
    expect(c.brut).toBe(250);
    expect(c.remise).toBe(25);
    expect(c.net).toBe(225);
    expect(c.ht).toBe(295);
    expect(c.tva).toBe(54.5);
    expect(c.ttc).toBe(349.5);
  });
  it("prend la TVA propre de l'assurance quand elle est posée", () => {
    const c2 = calculer({ ...ch, assurance: { ...ch.assurance, tva: 0 } }, 20);
    expect(c2.assuranceTva).toBe(0);
    expect(c2.ttc).toBe(r2(295 + 40.5));
  });
});

describe("devis/calcul · calculer (saisie TTC, devis d'avant)", () => {
  it("déduit le HT du TTC net : TTC ÷ (1 + taux)", () => {
    // 120 TTC à 20 % → 100 HT + 20 ; 110 TTC à 10 % → 100 HT + 10
    const c = calculer(chiffrage({ saisie: "ttc", lignes: [ligne("a", 1, 120, 20), ligne("b", 1, 110, 10)] }), 20);
    expect(c.ht).toBe(200);
    expect(c.tva).toBe(30);
    expect(c.ttc).toBe(230);
  });
  it("garde le TTC saisi exactement, la TVA prenant l'écart d'arrondi", () => {
    // 100 TTC à 20 % : HT 83,33 (83,333…), TVA 16,67
    const c = calculer(chiffrage({ saisie: "ttc", lignes: [ligne("a", 1, 100, 20)] }), 20);
    expect(c.parTaux[0]).toMatchObject({ ht: 83.33, tva: 16.67, ttc: 100 });
    expect(c.ttc).toBe(100);
  });
});

describe("devis/calcul · calculer (bornes)", () => {
  it("un devis vide vaut zéro partout", () => {
    const c = calculer(chiffrage(), 20);
    expect(c).toMatchObject({ brut: 0, remise: 0, net: 0, ht: 0, tva: 0, ttc: 0, parTaux: [] });
  });
  it("une remise au-delà de 100 % est ramenée à 100 %, une remise négative à 0", () => {
    const lignes = [ligne("a", 1, 100, 20)];
    expect(calculer(chiffrage({ remisePct: 250, lignes }), 20).ttc).toBe(0);
    expect(calculer(chiffrage({ remisePct: -30, lignes }), 20).ttc).toBe(120);
    expect(calculer(chiffrage({ remisePct: NaN, lignes }), 20).ttc).toBe(120);
  });
  it("une ligne à TVA non numérique est rangée au taux 0", () => {
    const c = calculer(chiffrage({ lignes: [ligne("a", 1, 100, NaN)] }), 20);
    expect(c.parTaux.map((t) => t.taux)).toEqual([0]);
    expect(c.ttc).toBe(100);
  });
  it("tout à la charge du client : rien n'est facturé", () => {
    const c = calculer(chiffrage({ lignes: [ligne("a", 5, 99, 20, "client")] }), 20);
    expect(c.ttc).toBe(0);
    expect(c.montants.a).toBe(495);
  });
});

describe("devis/calcul · propriétés (200 devis tirés au hasard)", () => {
  const tirer = hasard(20261115);
  const TAUX = [20, 10, 5.5, 2.1, 0];
  const devis = Array.from({ length: 200 }, (_, k) => {
    const n = 1 + Math.floor(tirer() * 8);
    const lignes = Array.from({ length: n }, (_, i) =>
      ligne(`l${k}-${i}`, Math.round(tirer() * 40) / 4, Math.round(tirer() * 300000) / 100, TAUX[Math.floor(tirer() * TAUX.length)], tirer() < 0.15 ? "client" : "bailly"),
    );
    const assurance: Assurance = tirer() < 0.5 ? SANS_ASSURANCE : { tva: null, contractuelle: { valeur: Math.round(tirer() * 50000), taux: 0.45 }, dommage: { valeur: Math.round(tirer() * 9000), taux: 1.2, franchise: null, sansFranchise: false } };
    return chiffrage({ saisie: tirer() < 0.5 ? "ht" : "ttc", remisePct: Math.round(tirer() * 30), lignes, assurance });
  });

  it("TTC = HT + TVA au centime, et HT = somme des HT par taux + assurance", () => {
    for (const ch of devis) {
      const c = calculer(ch, 20);
      expect(c.ttc).toBe(r2(c.ht + c.tva));
      expect(c.ht).toBe(r2(c.parTaux.reduce((a, t) => a + t.ht, 0) + c.assuranceHt));
      for (const t of c.parTaux) {
        expect(t.net).toBe(r2(t.brut - t.remise));
        expect(Math.abs(t.ttc - (t.ht + t.tva))).toBeLessThan(0.005);
      }
    }
  });
  it("le brut est la somme des lignes facturées (jamais celles du client)", () => {
    for (const ch of devis) {
      const c = calculer(ch, 20);
      const attendu = r2(ch.lignes.filter((l) => l.charge !== "client").reduce((a, l) => a + montantLigne(l), 0));
      expect(c.brut).toBeCloseTo(attendu, 2);
    }
  });
  it("lignesPourBase : la somme des prix des lignes facturées vaut exactement le TTC", () => {
    for (const ch of devis) {
      const c = calculer(ch, 20);
      const lignes = lignesPourBase(ch, c, 20);
      const facturees = lignes.filter((l) => l.charge !== "client");
      expect(r2(facturees.reduce((a, l) => a + (l.prix as number), 0))).toBe(c.ttc);
      for (const l of lignes.filter((x) => x.charge === "client")) expect(l.prix).toBe(0);
    }
  });
});

describe("devis/calcul · lignesPourBase", () => {
  it("donne à chaque ligne son TTC net et ajoute l'assurance en lignes automatiques", () => {
    const ch = chiffrage({
      remisePct: 10,
      lignes: [ligne("a", 2, 100, 20), ligne("b", 1, 50, 10), ligne("c", 3, 10, 20, "client")],
      assurance: { tva: null, contractuelle: { valeur: 10000, taux: 0.5 }, dommage: { valeur: 2000, taux: 1, franchise: null, sansFranchise: false } },
    });
    const lignes = lignesPourBase(ch, calculer(ch, 20), 20);
    // a : 200 × 0,9 × 1,2 = 216 ; b : 50 × 0,9 × 1,1 = 49,50 ; c : client, 0 ; assurances 50 × 1,2 et 20 × 1,2
    expect(lignes.map((l) => [l.id, l.prix])).toEqual([["a", 216], ["b", 49.5], ["c", 0], ["assurance-c", 60], ["assurance-d", 24]]);
    expect(lignes.filter((l) => l.auto === "assurance")).toHaveLength(2);
  });
  it("reporte l'écart d'arrondi sur la plus grosse ligne (la première à égalité)", () => {
    // 3 × 1,01 à 5,5 % : TVA du taux = 3,03 × 0,055 = 0,16665 → 0,17, TTC 3,20 ;
    // chaque ligne : 1,01 × 1,055 = 1,06555 → 1,07, soit 3,21 : 1 centime de trop, retiré à la première.
    const ch = chiffrage({ lignes: [ligne("x", 1, 1.01, 5.5), ligne("y", 1, 1.01, 5.5), ligne("z", 1, 1.01, 5.5)] });
    const c = calculer(ch, 20);
    expect(c.ttc).toBe(3.2);
    const lignes = lignesPourBase(ch, c, 20);
    expect(lignes.map((l) => l.prix)).toEqual([1.06, 1.07, 1.07]);
  });
  it("n'ajoute pas de ligne d'assurance sans prime", () => {
    const ch = chiffrage({ lignes: [ligne("a", 1, 10, 20)] });
    expect(lignesPourBase(ch, calculer(ch, 20), 20).some((l) => l.auto)).toBe(false);
  });
});

describe("devis/calcul · arrhes, achats, marge, prix de vente", () => {
  it("arrhes = TTC × pourcentage, au centime", () => {
    // 349,50 × 30 % = 104,85
    expect(arrhes(349.5, 30)).toBe(104.85);
    expect(arrhes(0, 30)).toBe(0);
    expect(arrhes(100, 0)).toBe(0);
  });
  it("totaux des achats : prévu, réel saisi, réel estimé, achats sans réel", () => {
    const a = (prevu: number | null, reel: number | null): Achat => ({ id: "h", date: "", libelle: "", fournisseur: "", prevu, reel, tva: null, compte: "", piece: "", poste: null });
    // prévu 100 + 50 = 150 ; réel 60 + 10 = 70 ; estimé 100 (prévu) + 60 + 10 + 0 = 170 ; un seul achat prévu sans réel
    expect(totauxAchats([a(100, null), a(50, 60), a(null, 10), a(0, null)])).toEqual({ prevu: 150, reelSaisi: 70, reelEstime: 170, manquants: 1 });
    expect(totauxAchats([])).toEqual({ prevu: 0, reelSaisi: 0, reelEstime: 0, manquants: 0 });
  });
  it("marge en euros et en pourcentage du HT ; pas de pourcentage sans vente", () => {
    expect(marge(1000, 600)).toEqual({ montant: 400, pct: 40 });
    expect(marge(300, 400)).toEqual({ montant: -100, pct: -33.3 }); // -100 / 300 = -33,33 % → -33,3
    expect(marge(0, 100)).toEqual({ montant: -100, pct: null });
    expect(marge(-50, 0).pct).toBeNull();
  });
  it("prix de vente : majoration sur le coût, ou taux de marque sur le prix", () => {
    expect(prixDeVente(100, 25, "cout")).toBe(125); // 100 × 1,25
    expect(prixDeVente(100, 20, "prix")).toBe(125); // 100 ÷ 0,8
    expect(prixDeVente(80, 0, "prix")).toBe(80);
  });
  it("un taux de marque de 100 % ou plus ne donne pas de prix (0) au lieu d'une division par zéro", () => {
    expect(prixDeVente(100, 100, "prix")).toBe(0);
    expect(prixDeVente(100, 150, "prix")).toBe(0);
  });
});
