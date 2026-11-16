import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dateValidite, estInternational, FRANCHISE_GARANTIE, lireAchats, lireAssurance, lireInternational, lireLignes, lireMoyens, lirePrestations, nomDevis, nouvelId,
  PRESTATIONS_LIBRES, PRESTATIONS_TYPE, prestationsType, TVA_CODE, validiteUnMois,
} from "@/crm/devis/modele";
import { m3Client, volumeClient } from "@/crm/documents/volume-client";
import { effectifs, PARAMETRES_VIDES, regleSesArrhesEnLigne } from "@/crm/devis/parametres";
import { euros, pct } from "@/crm/devis/format";
import { copierDevisDans, numeroDevis } from "@/crm/devis/copie";
import { calculer, r2 } from "@/crm/devis/calcul";
import type { Db, Row } from "@/crm/lib/db";

const espaces = (s: string) => s.replace(/[  ]/g, " ");

describe("devis/modele · lireLignes (devis d'avant compris)", () => {
  it("un devis d'avant sans lignes garde son prix : une ligne d'une unité au montant TTC", () => {
    expect(lireLignes([], 1500)).toEqual([{ id: "a0", groupe: "base", libelle: "Prix du déménagement", detail: "", qte: 1, unite: "", pu: 1500, tva: TVA_CODE, charge: "bailly" }]);
  });
  it("sans lignes ni montant : aucune ligne", () => {
    expect(lireLignes(null, 0)).toEqual([]);
    expect(lireLignes(undefined)).toEqual([]);
    expect(lireLignes("pas un tableau", null)).toEqual([]);
  });
  it("une ligne d'avant (prix TTC, sans pu) devient une ligne d'une unité à ce prix", () => {
    const [l] = lireLignes([{ libelle: "Transport", prix: 800, charge: "client" }]);
    expect(l).toMatchObject({ id: "a0", qte: 1, pu: 800, tva: 20, charge: "client", groupe: "base" });
  });
  it("lit les nombres écrits en chaîne, virgule décimale comprise", () => {
    const [l] = lireLignes([{ id: "x", pu: "12,5", qte: "2", tva: "5.5", groupe: "divers" }]);
    expect(l).toMatchObject({ id: "x", pu: 12.5, qte: 2, tva: 5.5, groupe: "divers" });
  });
  it("écarte les lignes automatiques (assurance), qui sont recalculées", () => {
    expect(lireLignes([{ id: "a", pu: 10 }, { id: "assurance-c", auto: "assurance", prix: 60 }]).map((l) => l.id)).toEqual(["a"]);
  });
  it("résiste aux lignes hostiles : chaîne, null, nombre illisible", () => {
    const lignes = lireLignes(["abc", null, { pu: "dix", qte: "", tva: "∞", charge: "personne" }]);
    expect(lignes).toHaveLength(3);
    for (const l of lignes) {
      expect(Number.isFinite(l.pu)).toBe(true);
      expect(Number.isFinite(l.qte)).toBe(true);
      expect(l.charge).toBe("bailly");
    }
    expect(lignes[2]).toMatchObject({ pu: 0, qte: 1, tva: TVA_CODE });
  });
});

describe("devis/modele · lireAchats, lirePrestations, lireAssurance, lireMoyens, lireInternational", () => {
  it("les achats saisis sont lus tels quels, poste inconnu écarté", () => {
    const [a] = lireAchats([{ id: "h1", prevu: "100,5", reel: null, poste: "fret" }, { poste: "pirate" }], []);
    expect(a).toMatchObject({ id: "h1", prevu: 100.5, reel: null, poste: "fret" });
    expect(lireAchats([{ poste: "pirate" }], [])[0].poste).toBeNull();
  });
  it("sans achats, les coûts d'achat des anciennes lignes deviennent des achats prévus (hors lignes du client)", () => {
    const a = lireAchats(null, [{ libelle: "Camion", achat: 300 }, { libelle: "Cartons", achat: 0 }, { libelle: "Client", achat: 50, charge: "client" }]);
    expect(a).toEqual([{ id: "h0", date: "", libelle: "Camion", fournisseur: "", prevu: 300, reel: null, tva: null, compte: "", piece: "", poste: null }]);
  });
  it("une prestation à la charge inconnue revient au client", () => {
    expect(lirePrestations([{ libelle: "Démontage", charge: "bailly" }, { libelle: "X", charge: "?" }]).map((p) => p.charge)).toEqual(["bailly", "client"]);
    expect(lirePrestations({})).toEqual([]);
  });
  it("la garantie jamais saisie : trois lignes vides, franchise de 300 € sur la contractuelle et la dommage standard", () => {
    expect(FRANCHISE_GARANTIE).toBe(300);
    expect(lireAssurance(null)).toEqual({
      tva: null, contractuelle: { valeur: null, taux: null, franchise: 300 }, dommage: { valeur: null, taux: null, franchise: 300 }, luxe: { valeur: null, taux: null },
    });
    expect(lireAssurance({})).toEqual(lireAssurance(null));
    expect(lireAssurance({ tva: "5,5", contractuelle: { valeur: "1000" } })).toMatchObject({ tva: 5.5, contractuelle: { valeur: 1000, taux: null, franchise: null } });
  });
  it("un devis d'avant, enregistré avec deux lignes, garde ses valeurs : franchise d'avant, pas de franchise ajoutée", () => {
    const a = lireAssurance({ tva: null, contractuelle: { valeur: 10000, taux: 0.5 }, dommage: { valeur: 2000, taux: 1, franchise: 150, sansFranchise: false } });
    expect(a).toEqual({ tva: null, contractuelle: { valeur: 10000, taux: 0.5, franchise: null }, dommage: { valeur: 2000, taux: 1, franchise: 150 }, luxe: { valeur: null, taux: null } });
  });
  it("une ligne « dommage sans franchise » d'avant est la garantie dommage luxe d'aujourd'hui (même prime)", () => {
    const a = lireAssurance({ contractuelle: { valeur: null, taux: null }, dommage: { valeur: 2000, taux: 1, franchise: null, sansFranchise: true } });
    expect(a.luxe).toEqual({ valeur: 2000, taux: 1 });
    expect(a.dommage).toEqual({ valeur: null, taux: null, franchise: null });
    // « true » écrit en chaîne n'est pas un vrai « sans franchise » : la ligne reste la dommage standard.
    expect(lireAssurance({ dommage: { valeur: 5, sansFranchise: "true" } }).dommage.valeur).toBe(5);
    // Une garantie enregistrée en trois lignes se relit à l'identique.
    const trois = { tva: 20, contractuelle: { valeur: 1, taux: 2, franchise: 300 }, dommage: { valeur: 3, taux: 4, franchise: 300 }, luxe: { valeur: 5, taux: 6 } };
    expect(lireAssurance(JSON.parse(JSON.stringify(trois)))).toEqual(trois);
  });
  it("les moyens : remorque vraie seulement pour true, véhicules numérotés", () => {
    const m = lireMoyens({ remorque: "oui", vehicules: [{ designation: "20 m³" }, "x"], demenageurs: "4" });
    expect(m.remorque).toBe(false);
    expect(m.vehicules.map((v) => v.id)).toEqual(["v0", "v1"]);
    expect(m.demenageurs).toBe(4);
  });
  it("l'international : marge sur le coût par défaut", () => {
    expect(lireInternational(null)).toEqual({ margePct: null, modeMarge: "cout" });
    expect(lireInternational({ margePct: "15", modeMarge: "prix" })).toEqual({ margePct: 15, modeMarge: "prix" });
  });
});

describe("devis/modele · prestations type, nom du devis, international", () => {
  it("19 prestations type et 6 lignes libres", () => {
    expect(PRESTATIONS_TYPE).toHaveLength(19);
    for (const f of ["standard", "premium", "economique", "libre"] as const) expect(prestationsType(f)).toHaveLength(19 + PRESTATIONS_LIBRES);
  });
  it("Standard : les 13 premières par l'entreprise, les 6 suivantes par le client", () => {
    const p = prestationsType("standard").slice(0, 19).map((x) => x.charge);
    expect(p.slice(0, 13).every((c) => c === "bailly")).toBe(true);
    expect(p.slice(13).every((c) => c === "client")).toBe(true);
  });
  it("Premium : 15 par l'entreprise ; Économique : seulement les n° 4 à 11", () => {
    expect(prestationsType("premium").filter((x) => x.charge === "bailly")).toHaveLength(15);
    const eco = prestationsType("economique").slice(0, 19).map((x) => x.charge);
    expect(eco.map((c, i) => (c === "bailly" ? i : -1)).filter((i) => i >= 0)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("devis libre : aucune répartition imposée (sans objet)", () => {
    expect(prestationsType("libre").every((x) => x.charge === "so")).toBe(true);
  });
  it("les lignes libres sont vides et sans objet", () => {
    expect(prestationsType("standard").slice(19)).toEqual(Array.from({ length: 6 }, (_, i) => ({ id: `pl${i}`, libelle: "", charge: "so" })));
  });
  it("le nom du devis : catégorie spécifique, sinon titre, sinon la formule", () => {
    expect(nomDevis({ categorie_specifique: true, categorie_libelle: "  Pianos  ", titre: "T", formule: "premium" })).toBe("Pianos");
    expect(nomDevis({ categorie_specifique: true, categorie_libelle: "   ", titre: " Titre ", formule: "premium" })).toBe("Titre");
    expect(nomDevis({ formule: "economique" })).toBe("Économique");
    expect(nomDevis({ formule: "libre" })).toBe("Devis libre");
    expect(nomDevis({ formule: "inconnue" })).toBe("inconnue");
    expect(nomDevis({})).toBe("");
  });
  it("international, maritime et aérien sont des devis internationaux", () => {
    expect(["international", "maritime", "aerien"].every(estInternational)).toBe(true);
    expect(estInternational("national")).toBe(false);
    expect(estInternational(null)).toBe(false);
  });
  it("nouvelId ne se répète pas", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => nouvelId()));
    expect(ids.size).toBe(2000);
    expect(nouvelId("h").startsWith("h")).toBe(true);
  });
});

describe("devis/parametres et format", () => {
  it("sans paramètre : les valeurs du code (TVA 20, arrhes 30, validité d'un mois : pas de nombre de jours)", () => {
    expect(effectifs(PARAMETRES_VIDES)).toEqual({ arrhesPct: 30, validiteJours: null, tva: 20, tvaAssurance: 20 });
    expect(effectifs({ ...PARAMETRES_VIDES, validiteJours: 45 }).validiteJours).toBe(45);
  });
  it("la TVA de l'assurance suit la TVA par défaut quand elle n'est pas posée ; un zéro reste zéro", () => {
    expect(effectifs({ ...PARAMETRES_VIDES, tvaDefaut: 10 }).tvaAssurance).toBe(10);
    expect(effectifs({ ...PARAMETRES_VIDES, tvaDefaut: 10, tvaAssurance: 0 }).tvaAssurance).toBe(0);
    expect(effectifs({ ...PARAMETRES_VIDES, arrhesPct: 0 }).arrhesPct).toBe(0);
  });
  it("seuls les comptes, partenaires et militaires ne règlent pas leurs arrhes en ligne", () => {
    expect(regleSesArrhesEnLigne("particulier")).toBe(true);
    expect(regleSesArrhesEnLigne("logement_social")).toBe(true);
    for (const t of ["compte", "partenaire", "militaire"]) expect(regleSesArrhesEnLigne(t)).toBe(false);
  });
  it("euros et pourcentages à la française", () => {
    expect(espaces(euros(1234.5))).toBe("1 234,50 €");
    expect(espaces(euros(0))).toBe("0,00 €");
    expect(euros(null)).toBe("—");
    expect(pct(20)).toBe("20 %");
    expect(pct(5.555)).toBe("5,56 %");
    expect(pct(undefined)).toBe("—");
  });
});

/* ---------- la duplication d'un devis, sur une fausse base ---------- */

function fausseBase(src: Row | undefined, cible: Row | undefined, dernier = 6) {
  const appels: { sql: string; params: unknown[] }[] = [];
  const db: Db = {
    async query<T = Row>(sql: string, params: unknown[] = []) {
      appels.push({ sql, params });
      if (/from devis v join dossiers d/.test(sql) && /where v\.id = \$1/.test(sql)) return (src ? [src] : []) as T[];
      if (/from dossiers d where d\.id = \$1/.test(sql)) return (cible ? [cible] : []) as T[];
      if (/pg_advisory_xact_lock/.test(sql)) return [] as T[];
      if (/max\(substring\(numero/.test(sql)) return [{ n: dernier + 1 }] as T[];
      if (/^insert into devis/.test(sql)) return [{ id: 99 }] as T[];
      throw new Error(`requête inattendue : ${sql}`);
    },
  };
  return { db, appels };
}

const SOURCE: Row = {
  id: 5, dossier_id: 1, numero: "DV-2026-0003", ref: "BD-2026-0001", client: "Famille Martin", volume_dossier: 30,
  formule: "standard", titre: null, categorie_specifique: false, categorie_libelle: null, mode: "postes", saisie: "ht", remise_pct: 10, arrhes_pct: null,
  lignes: [{ id: "a", pu: 1000, qte: 1, tva: 20, charge: "bailly" }, { id: "assurance-c", auto: "assurance", prix: 60 }],
  assurance: { contractuelle: { valeur: 10000, taux: 0.5 }, dommage: { valeur: null, taux: null } },
  achats: [{ id: "h1", prevu: 400, reel: 380, date: "2026-10-01", piece: "F-12", libelle: "Sous-traitant" }],
  prestations: [{ libelle: "Démontage", charge: "bailly" }],
  distance_km: 450, poids_lourds: "oui", deplacement: "route", groupage: false, ref_interne: "R1", moyens: { demenageurs: 3 },
  reglement_solde: "Solde à la livraison", conditions: "CG", international: null,
};

describe("devis/copie · copierDevisDans (fausse base)", () => {
  afterEach(() => vi.useRealTimers());

  it("rend null si le devis ou le dossier de destination n'existe pas", async () => {
    expect(await copierDevisDans(fausseBase(undefined, { id: 1 }).db, 5, 1, PARAMETRES_VIDES, { id: 1, role: "admin" })).toBeNull();
    expect(await copierDevisDans(fausseBase(SOURCE, undefined).db, 5, 2, PARAMETRES_VIDES, { id: 1, role: "admin" })).toBeNull();
  });

  it("dans le même dossier : tout suit, numéro suivant, montant recalculé égal à la somme des lignes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    const { db, appels } = fausseBase(SOURCE, { id: 1, volume: 30, commercial_id: 4, visite: null, distance_km: null });
    const r = await copierDevisDans(db, 5, 1, PARAMETRES_VIDES, { id: 9, role: "commercial" });
    expect(r).toMatchObject({ id: 99, numero: "DV-2026-0007", memeDossier: true, volumeDiffere: false });

    const insert = appels.find((a) => a.sql.startsWith("insert into devis"))!;
    const cles = insert.sql.match(/insert into devis\(([^)]+)\)/)![1].split(",");
    const v = Object.fromEntries(cles.map((k, i) => [k, insert.params[i]]));
    // 1 000 HT − 10 % = 900, TVA 180 ; assurance 10 000 × 0,5 % = 50 HT, TVA 10 → TTC 1 140
    expect(v.montant).toBe(1140);
    expect(v.montant_ht).toBe(950);
    expect(v.montant_tva).toBe(190);
    const lignes = JSON.parse(String(v.lignes)) as { prix: number; charge: string }[];
    expect(r2(lignes.filter((l) => l.charge !== "client").reduce((a, l) => a + l.prix, 0))).toBe(1140);
    expect(v.distance_km).toBe(450);
    expect(JSON.parse(String(v.moyens)).demenageurs).toBe(3);
    expect(v.origine).toBe("copie");
    expect(v.copie_de).toBe(5);
    expect(v.commercial_id).toBe(4);
    expect(v.date_devis).toBe("2026-11-15");
    expect(v.validite).toBe("2026-12-15"); // 15 nov. + un mois
    expect(v.arrhes_pct).toBe(30);
    // Jamais : le réel des achats, leur pièce, leur date.
    const achats = JSON.parse(String(v.achats));
    expect(achats[0]).toMatchObject({ prevu: 400, reel: null, piece: "", date: "" });
    expect(achats[0].id).not.toBe("h1");
  });

  it("vers un autre dossier : ni valeurs déclarées, ni distance, ni moyens ; volume différent signalé", async () => {
    const { db, appels } = fausseBase(SOURCE, { id: 2, volume: 45, commercial_id: null, visite: "2026-11-02T09:00:00Z", distance_km: null });
    const r = await copierDevisDans(db, 5, 2, PARAMETRES_VIDES, { id: 9, role: "commercial" });
    expect(r).toMatchObject({ memeDossier: false, volumeDiffere: true, source: { volume: 30 }, cible: { id: 2, volume: 45 } });
    const insert = appels.find((a) => a.sql.startsWith("insert into devis"))!;
    const cles = insert.sql.match(/insert into devis\(([^)]+)\)/)![1].split(",");
    const v = Object.fromEntries(cles.map((k, i) => [k, insert.params[i]]));
    expect(JSON.parse(String(v.assurance)).contractuelle.valeur).toBeNull();
    expect(v.montant).toBe(1080); // 900 HT + 180 de TVA, sans assurance
    expect(cles).not.toContain("moyens");
    expect(v.distance_km).toBeNull();
    expect(v.commercial_id).toBe(9); // le commercial qui duplique, faute de commercial du dossier
    expect(v.date_visite).toBe("2026-11-02");
  });

  it("le même chiffrage que l'éditeur : calculer() appliqué aux lignes relues", async () => {
    const { db, appels } = fausseBase({ ...SOURCE, saisie: "ttc", remise_pct: null }, { id: 1, volume: 30 });
    await copierDevisDans(db, 5, 1, PARAMETRES_VIDES, { id: 1, role: "admin" });
    const insert = appels.find((a) => a.sql.startsWith("insert into devis"))!;
    const i = insert.sql.match(/insert into devis\(([^)]+)\)/)![1].split(",").indexOf("montant");
    const attendu = calculer({ mode: "postes", saisie: "ttc", remisePct: 0, lignes: lireLignes(SOURCE.lignes), assurance: lireAssurance(SOURCE.assurance) }, 20).ttc;
    expect(insert.params[i]).toBe(attendu);
  });
});

describe("devis/copie · numeroDevis", () => {
  afterEach(() => vi.useRealTimers());

  it("prend le numéro suivant de l'année, sur 4 chiffres, sous verrou", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T10:00:00Z"));
    const { db, appels } = fausseBase(undefined, undefined, 41);
    expect(await numeroDevis(db)).toBe("DV-2026-0042");
    expect(appels[0].sql).toMatch(/pg_advisory_xact_lock/);
    expect(appels[1].params).toEqual(["DV-2026-%"]);
  });

  // Protège l'année de Paris dans le numéro, même sur un serveur en UTC (1er janvier entre 0 h et 1 h).
  it("le numéro porte l'année de Paris, même sur un serveur réglé en UTC", async () => {
    const tz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-12-31T23:30:00Z")); // 1er janvier 2027, 0 h 30 à Paris
      const { db } = fausseBase(undefined, undefined, 0);
      expect(await numeroDevis(db)).toBe("DV-2027-0001");
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe("devis/modele · validité d'un mois (Céline, 16/11/2026)", () => {
  it("la même date le mois suivant", () => {
    expect(validiteUnMois("2026-11-13")).toBe("2026-12-13");
    expect(validiteUnMois("2026-11-16")).toBe("2026-12-16");
  });
  it("fin de mois : ramenée au dernier jour du mois suivant", () => {
    expect(validiteUnMois("2027-01-31")).toBe("2027-02-28");
    expect(validiteUnMois("2028-01-31")).toBe("2028-02-29"); // année bissextile
    expect(validiteUnMois("2026-03-31")).toBe("2026-04-30");
    expect(validiteUnMois("2026-08-31")).toBe("2026-09-30");
    expect(validiteUnMois("2027-01-30")).toBe("2027-02-28");
  });
  it("fin d'année : passe à janvier de l'année suivante", () => {
    expect(validiteUnMois("2026-12-31")).toBe("2027-01-31");
    expect(validiteUnMois("2026-12-15")).toBe("2027-01-15");
  });
  it("un nombre de jours fixé dans les paramètres l'emporte sur le mois", () => {
    expect(dateValidite("2026-11-13", null)).toBe("2026-12-13");
    expect(dateValidite("2026-11-13", undefined)).toBe("2026-12-13");
    expect(dateValidite("2026-11-13", 60)).toBe("2027-01-12");
    expect(dateValidite("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("la date de départ est celle de Paris : le 30 novembre à 23 h 30 à Paris (22 h 30 UTC) donne le 30 décembre", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-30T22:30:00Z"));
      const { aujourdhuiParis } = await import("@/crm/devis/modele");
      expect(aujourdhuiParis()).toBe("2026-11-30");
      expect(validiteUnMois(aujourdhuiParis())).toBe("2026-12-30");
      // 31 décembre, 23 h 30 UTC : déjà le 1er janvier à Paris.
      vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
      expect(aujourdhuiParis()).toBe("2027-01-01");
      expect(validiteUnMois(aujourdhuiParis())).toBe("2027-02-01");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("documents/volume-client · CIMOB/DICOM : les droits, jamais le volume réel", () => {
  it("un client CIMOB/DICOM (type « militaire ») lit ses droits", () => {
    expect(volumeClient({ type: "militaire", volume: 42.5, volume_droits: 30 })).toEqual({ valeur: 30, droits: true, libelle: "Droits" });
    expect(m3Client({ type: "militaire", volume: 42.5, volume_droits: "30.00" })).toBe("30 m³");
  });
  it("sans droits saisis, aucun volume n'est montré — surtout pas le réel", () => {
    for (const droits of [null, undefined, "", 0, "abc"]) {
      const v = volumeClient({ type: "militaire", volume: 42.5, volume_droits: droits });
      expect(v.valeur).toBeNull();
      expect(v.droits).toBe(true);
      expect(m3Client({ type: "militaire", volume: 42.5, volume_droits: droits })).toBe("—");
      expect(m3Client({ type: "militaire", volume: 42.5, volume_droits: droits })).not.toContain("42");
    }
  });
  it("les autres clients (compte compris) lisent le volume du dossier ; leurs droits éventuels n'y changent rien", () => {
    for (const type of ["particulier", "compte", "partenaire", "logement_social", undefined]) {
      expect(volumeClient({ type, volume: 42.5, volume_droits: 30 })).toEqual({ valeur: 42.5, droits: false, libelle: "Volume" });
    }
    expect(m3Client({ type: "particulier", volume: "12.25" })).toBe("12,3 m³");
  });
});
