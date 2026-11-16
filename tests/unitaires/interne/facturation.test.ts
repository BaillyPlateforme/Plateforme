import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined), transaction: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSettings: vi.fn(async () => ({ entreprise_nom: "  Bailly SAS  ", siret: "123 456 789 00012", entreprise_adresse: "1 rue X" })) }));
vi.mock("@/crm/devis/donnees", () => ({ lireParametres: vi.fn() }));

import {
  ajouterJours, arrondi, aujourdhuiParis, calculerLigne, euros2, htDepuisTtc, jourIso, libelleMode, MODES, MODES_SAISIS, totaux, TVA_DEFAUT_CODE,
  type LigneSaisie,
} from "@/crm/facturation/calcul";
import {
  CHAMPS_REGLAGES, comptesEncaissement, lignesAEmettre, mentionsDeLaFacture, mentionsEmetteur, payeurDe, tauxParDefaut, ventilerParPayeur,
  type FactureComplete, type LigneListeFacture, type Mentions, type Reglages,
} from "@/crm/facturation/donnees";
import { codePays, factureVersEn16931, prealablesFacturX } from "@/crm/facturation/facturx";
import { getSettings } from "@/lib/settings";

const espaces = (s: string) => s.replace(/[  ]/g, " ");
const L = (quantite: number, prixUnitaireHt: number, tauxTva: number, genre: LigneSaisie["genre"] = "prestation"): LigneSaisie => ({ genre, libelle: "L", quantite, prixUnitaireHt, tauxTva });

describe("facturation/calcul · arrondi et HT depuis TTC", () => {
  it("arrondit au centime, 1,005 → 1,01", () => {
    expect(arrondi(1.005)).toBe(1.01);
    expect(arrondi(0.1 + 0.2)).toBe(0.3);
    expect(arrondi(0)).toBe(0);
  });
  it("HT d'un TTC : TTC ÷ (1 + taux)", () => {
    expect(htDepuisTtc(120, 20)).toBe(100);
    expect(htDepuisTtc(100, 20)).toBe(83.33);
    expect(htDepuisTtc(100, 0)).toBe(100);
    expect(htDepuisTtc(105.5, 5.5)).toBe(100);
  });
});

describe("facturation/calcul · calculerLigne", () => {
  it("HT = quantité × PU HT, TVA sur ce HT, TTC = HT + TVA", () => {
    expect(calculerLigne(L(3, 33.33, 20))).toMatchObject({ ht: 99.99, tva: 20, ttc: 119.99 }); // TVA 19,998 → 20,00
  });
  it("une ligne de texte ne compte pour rien", () => {
    expect(calculerLigne({ ...L(5, 100, 20, "texte") })).toMatchObject({ quantite: 0, prixUnitaireHt: 0, ht: 0, tva: 0, ttc: 0 });
  });
  it("une quantité illisible vaut 1, un prix ou un taux illisible vaut 0", () => {
    expect(calculerLigne(L(NaN, 10, 20))).toMatchObject({ quantite: 1, ht: 10, tva: 2 });
    expect(calculerLigne(L(2, NaN, 20))).toMatchObject({ prixUnitaireHt: 0, ht: 0 });
    expect(calculerLigne(L(2, 10, Infinity))).toMatchObject({ tauxTva: 0, tva: 0, ttc: 20 });
  });
  it("une déduction (prix négatif) donne un HT négatif", () => {
    expect(calculerLigne(L(1, -250, 20, "deduction"))).toMatchObject({ ht: -250, tva: -50, ttc: -300 });
  });
});

describe("facturation/calcul · totaux (règle EN 16931)", () => {
  it("TVA par taux sur la somme des HT de ce taux, taux décroissants", () => {
    // 20 % : 200 − 30 = 170 → TVA 34 ; 10 % : 50 → TVA 5 ; HT 220, TVA 39, TTC 259
    const t = totaux([L(2, 100, 20), L(1, 50, 10), L(9, 9, 20, "texte"), L(1, -30, 20, "deduction")]);
    expect(t.parTaux).toEqual([{ taux: 20, base: 170, tva: 34 }, { taux: 10, base: 50, tva: 5 }]);
    expect(t).toMatchObject({ ht: 220, tva: 39, ttc: 259 });
  });
  it("la TVA du total n'est pas la somme des TVA arrondies ligne à ligne", () => {
    // 3 lignes de 0,03 € à 20 % : chaque ligne 0,006 → 0,01 (somme 0,03) ; par taux 0,09 × 20 % = 0,018 → 0,02
    const t = totaux([L(1, 0.03, 20), L(1, 0.03, 20), L(1, 0.03, 20)]);
    expect(t.lignes.reduce((a, l) => a + l.tva, 0)).toBeCloseTo(0.03, 10);
    expect(t.tva).toBe(0.02);
    expect(t.ttc).toBe(0.11);
  });
  it("une facture vide, ou de texte seul, vaut zéro", () => {
    expect(totaux([])).toMatchObject({ ht: 0, tva: 0, ttc: 0, parTaux: [] });
    expect(totaux([L(1, 100, 20, "texte")])).toMatchObject({ ht: 0, ttc: 0, parTaux: [] });
  });
  it("propriété : TTC = HT + TVA, HT = somme des HT des lignes (300 factures tirées)", () => {
    let graine = 7;
    const r = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 300; k++) {
      const lignes = Array.from({ length: 1 + Math.floor(r() * 10) }, () => L(Math.round(r() * 20) / 2, Math.round((r() - 0.15) * 200000) / 100, [20, 10, 5.5, 0][Math.floor(r() * 4)]));
      const t = totaux(lignes);
      expect(t.ttc).toBe(arrondi(t.ht + t.tva));
      expect(t.ht).toBeCloseTo(t.lignes.reduce((a, l) => a + l.ht, 0), 6);
      expect(t.tva).toBe(arrondi(t.parTaux.reduce((a, g) => a + g.tva, 0)));
    }
  });
});

describe("facturation/calcul · libellés et dates", () => {
  it("le mode de règlement en clair, « Non précisé » sans mode", () => {
    expect(libelleMode("cheque")).toBe("Chèque");
    expect(libelleMode(null)).toBe("Non précisé");
    expect(libelleMode("bitcoin")).toBe("bitcoin");
    expect(MODES_SAISIS.map((m) => m.cle)).not.toContain("carte_en_ligne");
    expect(MODES_SAISIS).toHaveLength(MODES.length - 1);
  });
  it("jourIso : AAAA-MM-JJ d'une chaîne ou d'une date lue à minuit UTC ; rien sinon", () => {
    expect(jourIso("2028-02-29T10:00:00Z")).toBe("2028-02-29");
    expect(jourIso(new Date("2026-03-29T00:00:00Z"))).toBe("2026-03-29");
    expect(jourIso("29/02/2028")).toBeNull();
    expect(jourIso(new Date("pas une date"))).toBeNull();
    expect(jourIso(null)).toBeNull();
    expect(jourIso(20260101)).toBeNull();
  });
  it("ajouterJours : fin de mois, année bissextile, 31 décembre, changement d'heure", () => {
    expect(ajouterJours("2028-02-28", 1)).toBe("2028-02-29");
    expect(ajouterJours("2027-02-28", 1)).toBe("2027-03-01");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(ajouterJours("2026-03-28", 1)).toBe("2026-03-29");
    expect(ajouterJours("2026-10-25", 1)).toBe("2026-10-26");
    expect(ajouterJours("2027-01-01", -1)).toBe("2026-12-31");
    expect(ajouterJours("2026-01-31", 30)).toBe("2026-03-02");
  });
  it("aujourd'hui à Paris : le 31 décembre à 23 h 30 UTC, c'est déjà le 1er janvier", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    expect(aujourdhuiParis()).toBe("2027-01-01");
    vi.setSystemTime(new Date("2026-07-14T21:59:00Z"));
    expect(aujourdhuiParis()).toBe("2026-07-14");
    vi.setSystemTime(new Date("2026-07-14T22:00:00Z"));
    expect(aujourdhuiParis()).toBe("2026-07-15");
    vi.useRealTimers();
  });
  it("euros2 : deux décimales, signe compris", () => {
    expect(espaces(euros2(-12.5))).toBe("-12,50 €");
    expect(espaces(euros2(1000000))).toBe("1 000 000,00 €");
  });
});

/* ---------- donnees.ts : les parties pures (la base est simulée) ---------- */

const VIDES = Object.fromEntries(CHAMPS_REGLAGES.map((k) => [k, null])) as unknown as Reglages;

describe("facturation/donnees · réglages et mentions", () => {
  afterEach(() => vi.mocked(getSettings).mockClear());

  it("le taux par défaut : celui des Paramètres, sinon 20 %", () => {
    expect(tauxParDefaut(VIDES)).toBe(TVA_DEFAUT_CODE);
    expect(tauxParDefaut({ ...VIDES, taux_tva_defaut: 0 })).toBe(0);
    expect(tauxParDefaut({ ...VIDES, taux_tva_defaut: 10 })).toBe(10);
  });
  it("les comptes d'encaissement, un par ligne, lignes vides écartées", () => {
    expect(comptesEncaissement({ ...VIDES, comptes_encaissement: "Banque A\n\n  Caisse  \n" })).toEqual(["Banque A", "Caisse"]);
    expect(comptesEncaissement(VIDES)).toEqual([]);
  });
  it("les mentions : la raison sociale, sinon le nom de la carte Entreprise ; rien d'inventé", async () => {
    const m = await mentionsEmetteur({ ...VIDES, siren: " 123456789 ", iban: "   " });
    expect(m.nom).toBe("Bailly SAS");
    expect(m.siren).toBe("123456789");
    expect(m.siret).toBe("123 456 789 00012");
    expect(m.iban).toBeNull();
    expect(m.tvaIntracom).toBeNull();
    vi.mocked(getSettings).mockRejectedValueOnce(new Error("base absente"));
    expect((await mentionsEmetteur(VIDES)).nom).toBe("Bailly Déménagement");
  });
  it("les mentions figées à l'émission l'emportent ; un vide figé laisse la valeur actuelle", () => {
    const actuelles = { nom: "Bailly", iban: "FR76 1", siren: "111" } as Mentions;
    expect(mentionsDeLaFacture(actuelles, { iban: "FR76 0", siren: "", nom: null as unknown as string })).toMatchObject({ nom: "Bailly", iban: "FR76 0", siren: "111" });
    expect(mentionsDeLaFacture(actuelles, null)).toBe(actuelles);
  });
});

describe("facturation/donnees · payeur, lignes à émettre, ventilation", () => {
  it("le payeur d'une société : son nom et un contact ; d'un particulier : son nom, sans contact", () => {
    expect(payeurDe({ id: 3, type: "compte", societe: "Safran", civilite: "Madame", prenom: "Jeanne", nom: "Dupont", facturation_pays: "France" }))
      .toMatchObject({ clientId: 3, nom: "Safran", contact: "Madame Jeanne Dupont", pays: "France" });
    expect(payeurDe({ id: 4, prenom: "Jeanne", nom: "Dupont" })).toMatchObject({ nom: "Jeanne Dupont", contact: null, email: null });
    expect(payeurDe({ id: 5, nom: "" })?.nom).toBe("Sans nom");
    expect(payeurDe(null)).toBeNull();
  });
  it("lignes à émettre : jamais une déduction, valeurs par défaut, 200 au plus", () => {
    expect(lignesAEmettre("x")).toEqual([]);
    const l = lignesAEmettre([
      { genre: "prestation", libelle: "Transport", quantite: "2", prixUnitaireHt: 100, tauxTva: null },
      { genre: "deduction", libelle: "Arrhes", quantite: 1, prixUnitaireHt: -300, tauxTva: 20 },
      null, 42, { genre: "texte", libelle: null },
    ]);
    expect(l).toEqual([
      { genre: "prestation", libelle: "Transport", detail: null, quantite: 1, unite: null, prixUnitaireHt: 100, tauxTva: 20 },
      { genre: "texte", libelle: "", detail: null, quantite: 1, unite: null, prixUnitaireHt: 0, tauxTva: 20 },
    ]);
    expect(lignesAEmettre(Array.from({ length: 500 }, () => ({ genre: "prestation", libelle: "x" })))).toHaveLength(200);
  });
  it("ventilation par payeur : regroupée, la plus grosse dette d'abord, puis par nom", () => {
    const f = (payeurId: number | null, payeurNomAffiche: string, reste: number) => ({ payeurId, payeurNomAffiche, reste, origineId: null, origineNom: "" }) as unknown as LigneListeFacture;
    const g = ventilerParPayeur([f(1, "Safran", 100), f(2, "Airbus", 50), f(1, "Safran", 200), f(null, "Zoé", 50), f(null, "Anne", 50)], "payeur");
    expect(g.map((x) => [x.nom, x.lignes.length])).toEqual([["Safran", 2], ["Airbus", 1], ["Anne", 1], ["Zoé", 1]]);
    expect(ventilerParPayeur([], "origine")).toEqual([]);
  });
});

/* ---------- Factur-X ---------- */

const MENTIONS: Mentions = {
  nom: "Bailly Déménagement", formeJuridique: "SAS", capital: "100 000 €", rcs: "Évry B 123", siren: "123 456 789", siret: null, tvaIntracom: "FR12123456789", codeApe: null,
  adresse: "1 rue des Déménageurs", codePostal: "91000", ville: "Évry", pays: "France", adresseLibre: null, iban: "FR76 3000 6000 0112 3456 7890 189", bic: null, banque: null,
  penalites: "Pénalités : 3 fois le taux légal", indemnite: "Indemnité forfaitaire de 40 €", escompte: "Pas d'escompte", pied: null, conditions: "À réception",
};
const PAYEUR = { clientId: 1, type: "compte", nom: "Safran", contact: null, email: "compta@safran.example", telephone: null, adresse: "2 bd X", codePostal: "75015", ville: "Paris", pays: "FR", siren: "999 999 999", tvaIntracom: null };
const ligneF = (quantite: number, prixUnitaireHt: number, tauxTva: number, genre = "prestation") => ({ genre, libelle: `Ligne ${prixUnitaireHt}`, detail: null, quantite, unite: null, prixUnitaireHt, tauxTva, ht: 0, tva: 0, ttc: 0, factureDeduiteId: null });

function facture(o: Partial<FactureComplete> = {}): FactureComplete {
  return {
    id: 1, numero: "FA-2026-0001", genre: "solde", objet: "Déménagement", ttc: 0, ht: null, tva: null, statut: "emise", etat: "a_regler", reste: 100, affecte: 0, enRetard: false,
    emiseLe: "2026-11-15", echeanceLe: "2026-12-15", payeeLe: null, annuleeLe: null, dateMode: "jour", payeurNom: "Safran", origineNumero: null, avoirNumero: null, avoirId: null,
    nbLignes: 2, deduiteSur: null, motif: null, gardeMeuble: false, dossierId: 1, devisId: null, conditions: null, bonCommande: null, payeur: PAYEUR, origine: null, mentions: null,
    factureOrigineId: null, lignes: [ligneF(1, 1000, 20), ligneF(2, 49.995, 10)], reglements: [], devisNumero: null, emisePar: null, ...o,
  };
}

describe("facturation/facturx · codePays", () => {
  it("reconnaît le pays écrit en toutes lettres ou en code, jamais supposé", () => {
    expect(codePays("France")).toBe("FR");
    expect(codePays("  fr ")).toBe("FR");
    expect(codePays("Belgique")).toBe("BE");
    expect(codePays("us")).toBe("US");
    expect(codePays("Martinique")).toBeNull();
    expect(codePays("fra")).toBeNull();
    expect(codePays("")).toBeNull();
    expect(codePays(null)).toBeNull();
  });
});

describe("facturation/facturx · prealablesFacturX", () => {
  it("une facture complète n'a aucun préalable manquant", () => {
    expect(prealablesFacturX(facture(), MENTIONS, "contact@bailly.example")).toEqual([]);
  });
  it("signale chaque donnée manquante, sans rien compléter d'office", () => {
    const manque = prealablesFacturX(
      facture({ payeur: { ...PAYEUR, email: null, pays: "Martinique" }, echeanceLe: null, lignes: [] }),
      { ...MENTIONS, siren: null, siret: null, tvaIntracom: null, ville: null, pays: "Narnia", conditions: null },
      null,
    );
    expect(manque).toHaveLength(9);
    expect(manque.join(" | ")).toMatch(/SIREN/);
    expect(manque.join(" | ")).toMatch(/lignes détaillées/);
  });
  it("une ligne à 0 % de TVA demande un motif d'exonération ; une ligne de texte à 0 % non", () => {
    expect(prealablesFacturX(facture({ lignes: [ligneF(1, 100, 0)] }), MENTIONS, "a@b.fr").join()).toMatch(/exonération/);
    expect(prealablesFacturX(facture({ lignes: [ligneF(1, 100, 20), ligneF(0, 0, 0, "texte")] }), MENTIONS, "a@b.fr")).toEqual([]);
  });
  it("un avoir ou une facture soldée n'exige ni échéance ni conditions", () => {
    const m = { ...MENTIONS, conditions: null };
    expect(prealablesFacturX(facture({ genre: "avoir", echeanceLe: null }), m, "a@b.fr")).toEqual([]);
    expect(prealablesFacturX(facture({ reste: 0, echeanceLe: null }), m, "a@b.fr")).toEqual([]);
  });
  it("le SIRET suffit à défaut de SIREN", () => {
    expect(prealablesFacturX(facture(), { ...MENTIONS, siren: null, siret: "12345678900012" }, "a@b.fr")).toEqual([]);
  });
});

describe("facturation/facturx · factureVersEn16931", () => {
  const montant = (s: string) => Number(s);

  it("les totaux respectent les règles de cohérence de la norme (BR-CO-10, 13, 14, 15, 16)", () => {
    const f = facture({ reglements: [{ montant: 300 } as never, { montant: 0.5 } as never] });
    const x = factureVersEn16931(f, MENTIONS, "contact@bailly.example", "2026-11-14")["ubl:Invoice"];
    const lignes = x["cac:InvoiceLine"];
    const tot = x["cac:LegalMonetaryTotal"];
    const sommeLignes = lignes.reduce((a, l) => a + montant(l["cbc:LineExtensionAmount"]), 0);
    expect(montant(tot["cbc:LineExtensionAmount"])).toBeCloseTo(sommeLignes, 2);
    const tax = x["cac:TaxTotal"][0];
    expect(montant(tax["cbc:TaxAmount"])).toBeCloseTo(tax["cac:TaxSubtotal"].reduce((a, s) => a + montant(s["cbc:TaxAmount"]), 0), 2);
    expect(montant(tot["cbc:TaxInclusiveAmount"])).toBeCloseTo(montant(tot["cbc:TaxExclusiveAmount"]) + montant(tax["cbc:TaxAmount"]), 2);
    expect(montant(tot["cbc:PayableAmount"])).toBeCloseTo(montant(tot["cbc:TaxInclusiveAmount"]) - montant(tot["cbc:PrepaidAmount"]!), 2);
    // 1 000 HT à 20 % + 2 × 49,995 = 99,99 HT à 10 % : TVA 200 + 10 = 210, TTC 1 309,99 ; payé 300,50
    expect(tot["cbc:TaxInclusiveAmount"]).toBe("1309.99");
    expect(tot["cbc:PrepaidAmount"]).toBe("300.50");
    expect(tot["cbc:PayableAmount"]).toBe("1009.49");
    expect(x["cac:Delivery"]).toEqual({ "cbc:ActualDeliveryDate": "2026-11-14" });
    expect(x["cbc:InvoiceTypeCode"]).toBe("380");
  });
  it("une déduction s'écrit en quantité négative au prix positif (la norme refuse un prix négatif)", () => {
    const x = factureVersEn16931(facture({ lignes: [ligneF(1, 1000, 20), ligneF(1, -300, 20, "deduction"), ligneF(0, 0, 0, "texte")] }), MENTIONS, "a@b.fr")["ubl:Invoice"];
    const l = x["cac:InvoiceLine"];
    expect(l).toHaveLength(2);
    expect(l[1]["cbc:InvoicedQuantity"]).toBe("-1");
    expect(l[1]["cac:Price"]["cbc:PriceAmount"]).toBe("300.00");
    expect(l[1]["cbc:LineExtensionAmount"]).toBe("-300.00");
    expect(l.map((y) => y["cbc:ID"])).toEqual(["1", "2"]);
    for (const y of l) expect(montant(y["cac:Price"]["cbc:PriceAmount"])).toBeGreaterThanOrEqual(0);
  });
  it("un avoir : code 381, référence de la facture annulée, rien de prépayé ni d'échéance", () => {
    const x = factureVersEn16931(facture({ genre: "avoir", origineNumero: "FA-2026-0001", motif: "Erreur", reglements: [{ montant: 99 } as never] }), MENTIONS, "a@b.fr")["ubl:Invoice"];
    expect(x["cbc:InvoiceTypeCode"]).toBe("381");
    expect(x["cac:BillingReference"]).toEqual([{ "cac:InvoiceDocumentReference": { "cbc:ID": "FA-2026-0001" } }]);
    expect(x["cbc:DueDate"]).toBeUndefined();
    expect(x["cac:LegalMonetaryTotal"]["cbc:PrepaidAmount"]).toBeUndefined();
    expect(x["cac:PaymentMeans"]).toBeUndefined();
    expect(x["cbc:Note"]).toContain("Motif : Erreur");
  });
  it("une facture d'arrhes : code 386 ; l'indemnité de recouvrement seulement pour un professionnel", () => {
    const pro = factureVersEn16931(facture({ genre: "acompte" }), MENTIONS, "a@b.fr")["ubl:Invoice"];
    expect(pro["cbc:InvoiceTypeCode"]).toBe("386");
    expect(pro["cbc:Note"]).toContain(MENTIONS.indemnite);
    const part = factureVersEn16931(facture({ payeur: { ...PAYEUR, type: "particulier", siren: null } }), MENTIONS, "a@b.fr")["ubl:Invoice"];
    expect(part["cbc:Note"]).not.toContain(MENTIONS.indemnite);
  });
  it("l'identité de l'émetteur : SIREN sans espaces, IBAN sans espaces, adresse en champs", () => {
    const x = factureVersEn16931(facture(), MENTIONS, "a@b.fr")["ubl:Invoice"];
    const e = x["cac:AccountingSupplierParty"]["cac:Party"];
    expect(e["cac:PartyLegalEntity"]["cbc:CompanyID"]).toBe("123456789");
    expect(e["cac:PostalAddress"]).toEqual({ "cbc:StreetName": "1 rue des Déménageurs", "cbc:CityName": "Évry", "cbc:PostalZone": "91000", "cac:Country": { "cbc:IdentificationCode": "FR" } });
    expect(x["cac:PaymentMeans"]![0]["cac:PayeeFinancialAccount"]["cbc:ID"]).toBe("FR7630006000011234567890189");
    expect(x["cac:AccountingCustomerParty"]["cac:Party"]["cac:PartyLegalEntity"]["cbc:CompanyID"]).toBe("999999999");
  });
  it("un libellé très long est coupé à 200 caractères ; un libellé vide devient « Prestation »", () => {
    const x = factureVersEn16931(facture({ lignes: [{ ...ligneF(1, 10, 20), libelle: "é".repeat(5000) }, { ...ligneF(1, 10, 20), libelle: "" }] }), MENTIONS, "a@b.fr")["ubl:Invoice"];
    expect(x["cac:InvoiceLine"][0]["cac:Item"]["cbc:Name"]).toHaveLength(200);
    expect(x["cac:InvoiceLine"][1]["cac:Item"]["cbc:Name"]).toBe("Prestation");
  });
  it("le prix unitaire garde jusqu'à 4 décimales, au moins 2", () => {
    const x = factureVersEn16931(facture({ lignes: [ligneF(1, 12.5, 20), ligneF(1, 0.1234, 20), ligneF(1, 100, 20)] }), MENTIONS, "a@b.fr")["ubl:Invoice"];
    expect(x["cac:InvoiceLine"].map((l) => l["cac:Price"]["cbc:PriceAmount"])).toEqual(["12.50", "0.1234", "100.00"]);
  });
});
