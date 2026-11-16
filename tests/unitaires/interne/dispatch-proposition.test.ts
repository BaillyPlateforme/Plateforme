import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { regrouperParRegles, type Contexte } from "@/crm/dispatch/regroupement";
import { finaliser } from "@/crm/dispatch/proposition";
import { classeurModele, classeurPlan } from "@/crm/dispatch/excel";
import { lireFichier } from "@/crm/dispatch/fichiers";
import { devinerCorrespondance } from "@/crm/dispatch/saisie";
import type { Colonne, ContenuProposition, Ligne, Parametres, Plan } from "@/crm/dispatch/types";

const ligne = (id: number, pays: string | null, volume: number, ville: string | null = null, colonneId: number | null = null): Ligne => ({
  id, colonneId, rang: id, client: `Client ${id}`, ville, pays, volume, remarques: null, telephone: null, dossierId: null, dossierRef: null,
});
const colonne = (id: number, o: Partial<Colonne> = {}): Colonne => ({
  id, genre: "conteneur", libelle: `Colonne ${id}`, taille: "40", capacite: 67, zone: null, jour: null, conteneurId: null, conteneur: null, ordre: id,
  verrouilleeLe: null, verrouilleePar: null, ...o,
});
const P: Parametres = {
  methode: "regles", mode: "conteneur", repartir: "non_places", garderColonnes: true, nouvellesColonnes: true, capacite20: 33, capacite40: 67, capaciteTournee: null, contraintes: "",
};
const ctx = (lignes: Ligne[], o: Partial<Contexte> = {}, p: Partial<Parametres> = {}): Contexte => ({ lignes, colonnes: [], restantes: [], parametres: { ...P, ...p }, ...o });

/** Les invariants de toute proposition : chaque client au plus une fois, et soit placé soit « à répartir ». */
function invariants(c: Contexte, r: ContenuProposition) {
  const places = r.colonnes.flatMap((x) => x.lignes);
  expect(new Set(places).size).toBe(places.length);
  const non = r.nonAffectees.map((x) => x.ligne);
  expect(places.filter((id) => non.includes(id))).toEqual([]);
  expect(new Set([...places, ...non])).toEqual(new Set(c.lignes.map((l) => l.id)));
}

describe("dispatch/regroupement · regrouperParRegles", () => {
  it("regroupe par destination ; un 40 pieds si le reste dépasse un 20, sinon un 20", () => {
    // Martinique : 20 + 15 + 10 = 45 m³ (> 33) → 40 pieds ; Guadeloupe : 5 m³ → 20 pieds
    const c = ctx([ligne(1, "Martinique", 10), ligne(2, "Martinique", 20), ligne(3, "Guadeloupe", 5), ligne(4, "Martinique", 15)]);
    const r = regrouperParRegles(c);
    invariants(c, r);
    expect(r.colonnes.map((x) => [x.ref, x.libelle, x.taille, x.capacite, x.lignes.slice().sort()])).toEqual([
      ["n1", "Martinique · 40 pieds", "40", 67, [1, 2, 4]],
      ["n2", "Guadeloupe · 20 pieds", "20", 33, [3]],
    ]);
    expect(r.nonAffectees).toEqual([]);
    expect(r.alertes).toEqual([]);
    expect(r.resume).toMatch(/^Regroupement par destination, puis par volume décroissant : 4 clients placés sur 4, 2 destinations, 2 colonnes dont 2 à créer\./);
  });
  it("un client plus gros qu'un 40 pieds reste à répartir, à scinder", () => {
    const c = ctx([ligne(1, "Martinique", 80), ligne(2, "Martinique", 5)]);
    const r = regrouperParRegles(c);
    invariants(c, r);
    expect(r.nonAffectees).toEqual([{ ligne: 1, raison: "80 m³ : plus qu'un conteneur 40 pieds (67 m³), à scinder" }]);
  });
  it("sans colonne ni droit d'en créer : tout reste à répartir, avec la raison", () => {
    const c = ctx([ligne(1, "Martinique", 5)], {}, { nouvellesColonnes: false });
    const r = regrouperParRegles(c);
    invariants(c, r);
    expect(r.colonnes).toEqual([]);
    expect(r.nonAffectees).toEqual([{ ligne: 1, raison: "Aucune colonne pour « Martinique »" }]);
  });
  it("remplit d'abord la colonne existante de la destination ; déborde dans une nouvelle, numérotée", () => {
    // La colonne 7 (zone Martinique, 33 m³) a déjà 30 m³ : 2 m³ y tiennent, 12 m³ non.
    // (Deux villes différentes : la préférence « même ville » ne joue pas.)
    const c = ctx([ligne(1, "Martinique", 12, "Fort-de-France"), ligne(2, "Martinique", 2, "Le Lamentin")], {
      colonnes: [colonne(7, { zone: "Martinique", capacite: 33, taille: "20" })],
      restantes: [ligne(90, "Martinique", 30, null, 7)],
    });
    const r = regrouperParRegles(c);
    invariants(c, r);
    const c7 = r.colonnes.find((x) => x.ref === "c7")!;
    const n1 = r.colonnes.find((x) => x.ref === "n1")!;
    expect(c7.lignes).toEqual([2]);
    expect(c7.raison).toMatch(/ajouté au client déjà placé/);
    expect(n1.libelle).toBe("Martinique 2 · 20 pieds");
    expect(n1.lignes).toEqual([1]);
  });
  it("une colonne libre (sans zone ni client) prend la première destination qui s'y présente", () => {
    const c = ctx([ligne(1, "Réunion", 10)], { colonnes: [colonne(3)] }, { nouvellesColonnes: false });
    const r = regrouperParRegles(c);
    expect(r.colonnes[0]).toMatchObject({ ref: "c3", zone: "Réunion", lignes: [1] });
  });
  it("garde ensemble les clients d'une même ville quand la place le permet", () => {
    // c1 et c2 (40 m³ chacun, Martinique) : FdF 30 → c1 ; Lamentin 20 → c2 (c1 plein) ;
    // FdF 5 → c1 (même ville) ; Lamentin 5 → c2 (même ville), alors que c1 avait encore 5 m³.
    const c = ctx([ligne(1, "Martinique", 30, "Fort-de-France"), ligne(2, "Martinique", 20, "Le Lamentin"), ligne(3, "Martinique", 5, "Fort-de-France"), ligne(4, "Martinique", 5, "Le Lamentin")], {
      colonnes: [colonne(1, { zone: "Martinique", capacite: 40 }), colonne(2, { zone: "Martinique", capacite: 40 })],
    }, { nouvellesColonnes: false });
    const r = regrouperParRegles(c);
    invariants(c, r);
    expect(r.colonnes.find((x) => x.ref === "c1")!.lignes.sort()).toEqual([1, 3]);
    expect(r.colonnes.find((x) => x.ref === "c2")!.lignes.sort()).toEqual([2, 4]);
  });
  it("une zone « Fort-de-France » sert un client dont la ville est Fort-de-France", () => {
    const c = ctx([ligne(1, "Martinique", 5, "Fort-de-France")], { colonnes: [colonne(1, { zone: "Fort-de-France" })] }, { nouvellesColonnes: false });
    expect(regrouperParRegles(c).colonnes[0].lignes).toEqual([1]);
  });
  it("garderColonnes à faux : les colonnes existantes sont ignorées", () => {
    const c = ctx([ligne(1, "Martinique", 5)], { colonnes: [colonne(1, { zone: "Martinique" })] }, { garderColonnes: false });
    expect(regrouperParRegles(c).colonnes.map((x) => x.ref)).toEqual(["n1"]);
  });
  it("signale les clients sans pays, regroupés sur la ville seule", () => {
    const r = regrouperParRegles(ctx([ligne(1, null, 5, "Papeete"), ligne(2, "", 3, "Papeete")]));
    expect(r.alertes).toContain("2 clients sans pays : regroupés sur la ville seule.");
    expect(r.colonnes[0].libelle).toBe("Papeete · 20 pieds");
  });
  it("tournées : sans plafond, tout tient dans une tournée par destination", () => {
    const r = regrouperParRegles(ctx([ligne(1, "Lyon", 50), ligne(2, "Lyon", 80)], {}, { mode: "tournee" }));
    expect(r.colonnes).toEqual([expect.objectContaining({ ref: "n1", genre: "tournee", libelle: "Tournée Lyon", taille: null, capacite: null, lignes: [2, 1] })]);
  });
  it("tournées : un client plus gros que le plafond déclenche une alerte au lieu d'être perdu", () => {
    const r = regrouperParRegles(ctx([ligne(1, "Lyon", 30)], {}, { mode: "tournee", capaciteTournee: 20 }));
    expect(r.colonnes[0].lignes).toEqual([1]);
    expect(r.alertes[0]).toBe("Client 1 (30 m³) dépasse à lui seul la capacité de « Tournée Lyon ».");
  });
  it("propriété : aucun conteneur ne dépasse sa capacité (200 plans tirés au hasard)", () => {
    let g = 11;
    const r01 = () => ((g = (g * 48271) % 2147483647) / 2147483647);
    // Des villes propres à chaque pays ; les clients sans pays n'ont que des villes à eux.
    const VILLES: [string | null, string[]][] = [["Martinique", ["Fort-de-France", "Le Lamentin"]], ["Guadeloupe", ["Basse-Terre", "Les Abymes"]], ["Réunion", ["Saint-Denis"]], [null, ["Papeete", "Nouméa"]]];
    for (let k = 0; k < 200; k++) {
      const lignes = Array.from({ length: 1 + Math.floor(r01() * 25) }, (_, i) => {
        const [pays, villes] = VILLES[Math.floor(r01() * VILLES.length)];
        return ligne(i + 1, pays, Math.round(r01() * 600) / 10, villes[Math.floor(r01() * villes.length)]);
      });
      const c = ctx(lignes);
      const r = regrouperParRegles(c);
      invariants(c, r);
      for (const col of r.colonnes) {
        const v = col.lignes.reduce((s, id) => s + lignes.find((l) => l.id === id)!.volume, 0);
        expect(v).toBeLessThanOrEqual((col.capacite ?? Infinity) + 1e-6);
        // Une colonne ne sert qu'une destination.
        expect(new Set(col.lignes.map((id) => { const l = lignes.find((x) => x.id === id)!; return l.pays ?? l.ville; })).size).toBe(1);
      }
    }
  });
  it("un plan vide donne une proposition vide", () => {
    const r = regrouperParRegles(ctx([]));
    expect(r).toMatchObject({ colonnes: [], nonAffectees: [], alertes: [] });
    expect(r.resume).toMatch(/0 client placé sur 0/);
  });
});

describe("dispatch/proposition · finaliser (on ne croit pas l'IA sur parole)", () => {
  const lignes = [ligne(1, "Martinique", 30), ligne(2, "Martinique", 30), ligne(3, "Guadeloupe", 10)];
  const base = ctx(lignes, { colonnes: [colonne(12, { zone: "Martinique", capacite: 67 })], restantes: [ligne(50, "Martinique", 10, null, 12)] });

  it("une réponse qui n'est pas un objet : tout revient à répartir", () => {
    for (const brut of [null, "texte", 42, [1, 2]]) {
      const r = finaliser(brut, base);
      expect(r.colonnes.filter((c) => c.lignes.length)).toEqual([]);
      expect(r.nonAffectees.map((x) => x.ligne)).toEqual([1, 2, 3]);
      expect(r.nonAffectees[0].raison).toBe("Non placé par la proposition");
    }
  });
  it("écarte les identifiants inconnus et les clients cités deux fois ; les oubliés reviennent à répartir", () => {
    const r = finaliser({ colonnes: [{ ref: "c12", lignes: [1, 999, "1", 1] }, { ref: "nouvelle", genre: "conteneur", taille: "40", lignes: [1, 2] }] }, base);
    invariants(base, r);
    expect(r.colonnes.map((c) => [c.ref, c.lignes])).toEqual([["c12", [1]], ["n1", [2]]]);
    expect(r.nonAffectees).toEqual([{ ligne: 3, raison: "Non placé par la proposition" }]);
  });
  it("renumérote les colonnes nouvelles n1, n2… ; une colonne citée deux fois n'est gardée qu'une fois", () => {
    const r = finaliser({ colonnes: [{ ref: "zz", lignes: [3] }, { ref: "c12", lignes: [1] }, { ref: "c12", lignes: [2] }, { ref: "n1", lignes: [2] }] }, base);
    expect(r.colonnes.map((c) => [c.ref, c.lignes])).toEqual([["n1", [3]], ["c12", [1]], ["n2", [2]]]);
  });
  it("respecte les permissions du dispatcheur : ni colonne existante sans garderColonnes, ni nouvelle sans nouvellesColonnes", () => {
    const sansGarder = { ...base, parametres: { ...P, garderColonnes: false } };
    expect(finaliser({ colonnes: [{ ref: "c12", lignes: [1] }] }, sansGarder).colonnes).toEqual([]);
    const sansNouvelles = { ...base, parametres: { ...P, nouvellesColonnes: false } };
    expect(finaliser({ colonnes: [{ ref: "n1", lignes: [1] }] }, sansNouvelles).colonnes).toEqual([]);
  });
  it("recalcule les dépassements sur les volumes réels, clients déjà placés compris", () => {
    // c12 : 10 m³ déjà placés + 30 + 30 = 70 m³ pour 67 → dépasse de 3 m³
    const r = finaliser({ colonnes: [{ ref: "c12", lignes: [1, 2] }], alertes: ["Tout tient, promis."] }, base);
    expect(r.alertes[0]).toBe("« Colonne 12 » dépasse sa capacité de 3 m³ (70 m³ pour 67 m³).");
    expect(r.alertes).toContain("Tout tient, promis.");
  });
  it("une colonne nouvelle : genre inconnu → mode du plan ; taille 20 seulement si demandée ; capacité du plan", () => {
    const r = finaliser({ colonnes: [{ ref: "x", genre: "fusée", taille: "20", lignes: [3] }, { ref: "y", genre: "conteneur", taille: "45", lignes: [1] }] }, base);
    expect(r.colonnes[0]).toMatchObject({ genre: "conteneur", taille: "20", capacite: 33, libelle: "Conteneur 1" });
    expect(r.colonnes[1]).toMatchObject({ taille: "40", capacite: 67 });
  });
  it("une colonne nouvelle restée vide disparaît ; une colonne existante vide reste", () => {
    const r = finaliser({ colonnes: [{ ref: "x", lignes: [] }, { ref: "c12", lignes: [] }] }, base);
    expect(r.colonnes.map((c) => c.ref)).toEqual(["c12"]);
  });
  it("garde la raison de l'IA pour un client non placé (clé non_affectees acceptée), pas pour un client placé", () => {
    const r = finaliser({ colonnes: [{ ref: "c12", lignes: [1] }], non_affectees: [{ ligne: 1, raison: "trop gros" }, { ligne: 2, raison: "accès difficile" }] }, base);
    expect(r.nonAffectees).toEqual([{ ligne: 2, raison: "accès difficile" }, { ligne: 3, raison: "Non placé par la proposition" }]);
  });
  it("tronque les textes hostiles ou énormes ; dédoublonne et plafonne les alertes", () => {
    const r = finaliser({
      resume: "r".repeat(5000),
      colonnes: [{ ref: "x", libelle: "L".repeat(500), zone: "Z".repeat(500), raison: "R".repeat(5000), lignes: [1] }],
      alertes: [...Array.from({ length: 30 }, (_, i) => `alerte ${i % 3}`), 42, null, "A".repeat(900)],
    }, base);
    expect(r.resume).toHaveLength(1200);
    expect(r.colonnes[0].libelle).toHaveLength(80);
    expect(r.colonnes[0].zone).toHaveLength(80);
    expect(r.colonnes[0].raison).toHaveLength(500);
    expect(r.alertes).toEqual(["alerte 0", "alerte 1", "alerte 2"]);
  });
  it("le résultat des règles simples passe tel quel par finaliser (même placement)", () => {
    const r = regrouperParRegles(base);
    const f = finaliser(r, base);
    invariants(base, f);
    expect(f.colonnes.map((c) => c.lignes)).toEqual(r.colonnes.filter((c) => c.colonneId != null || c.lignes.length).map((c) => c.lignes));
  });
});

describe("dispatch/excel · classeurs exportés", () => {
  const plan = (colonnes: Colonne[], lignes: Ligne[]): Plan => ({
    id: 1, nom: "Groupage Antilles", sens: "export", port: "Le Havre", dateReference: "2026-12-01", notes: null, capacite20: 33, capacite40: 67, demo: false,
    creeLe: "2026-11-01", majLe: "2026-11-01", colonnes, lignes, historique: [], proposition: null,
  });
  const lire = async (octets: Uint8Array) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer);
    return wb;
  };

  it("une feuille par colonne : noms de 31 caractères au plus, sans : \\ / ? * [ ], uniques", async () => {
    const cols = [
      colonne(1, { libelle: "Martinique · 40 pieds" }),
      colonne(2, { libelle: "Martinique · 40 pieds" }),
      colonne(3, { libelle: "Fret: A/B? *[urgent]* \\ très très très long libellé de colonne" }),
      colonne(4, { libelle: "synthèse" }),
    ];
    const wb = await lire(await classeurPlan(plan(cols, [ligne(1, "Martinique", 10, null, 1), ligne(2, "Guadeloupe", 3)]), "Céline"));
    const noms = wb.worksheets.map((f) => f.name);
    expect(noms[0]).toBe("Synthèse");
    expect(noms).toContain("Martinique · 40 pieds");
    expect(noms).toContain("Martinique · 40 pieds 2");
    expect(noms).toContain("À répartir");
    for (const n of noms) {
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[:\\/?*[\]]/);
    }
    expect(new Set(noms.map((n) => n.toLowerCase())).size).toBe(noms.length);
  });
  it("un nom de client qui ressemble à une formule reste du texte dans le classeur (pas d'injection)", async () => {
    const hostile = '=HYPERLINK("http://evil.example","Cliquez")';
    const l = { ...ligne(1, "Martinique", 10, "+cmd|' /C calc'!A0", 1), client: hostile, remarques: "@SUM(1+1)*cmd" };
    const wb = await lire(await classeurPlan(plan([colonne(1, { libelle: "C1" })], [l]), "Céline"));
    const f = wb.getWorksheet("C1")!;
    const cellule = f.getRow(5).getCell(2);
    expect(cellule.type).toBe(ExcelJS.ValueType.String);
    expect(cellule.value).toBe(hostile);
    expect(f.getRow(5).getCell(3).type).toBe(ExcelJS.ValueType.String);
    expect(f.getRow(5).getCell(6).type).toBe(ExcelJS.ValueType.String);
  });
  it("la synthèse : une ligne par colonne, le total en formule SUM avec son résultat", async () => {
    const wb = await lire(await classeurPlan(plan([colonne(1, { libelle: "C1", capacite: 20 })], [ligne(1, "M", 12.5, null, 1), ligne(2, "M", 10, null, 1), ligne(3, "M", 1)]), "Céline"));
    const s = wb.getWorksheet("Synthèse")!;
    expect(s.getRow(5).getCell(6).value).toBe(2);
    expect(s.getRow(5).getCell(7).value).toBe(22.5);
    expect(s.getRow(5).getCell(9).value).toBeCloseTo(1.125, 6); // 22,5 / 20 : dépassé
    const total = s.getRow(7).getCell(7).value as { formula: string; result: number };
    expect(total.formula).toBe("SUM(G5:G6)");
    expect(total.result).toBe(23.5);
  });
  it("sans client à répartir, pas de feuille « À répartir »", async () => {
    const wb = await lire(await classeurPlan(plan([colonne(1, { libelle: "C1" })], [ligne(1, "M", 1, null, 1)]), "Céline"));
    expect(wb.worksheets.map((f) => f.name)).toEqual(["Synthèse", "C1"]);
  });
  it("le modèle vierge se réimporte : ses titres sont tous reconnus, sans ligne d'exemple", async () => {
    const octets = await classeurModele();
    const { feuilles } = await lireFichier("modele.xlsx", octets);
    const clients = feuilles.find((f) => f.nom === "Clients")!;
    expect(clients.lignes).toHaveLength(1);
    const c = devinerCorrespondance(clients.lignes[0]);
    expect(c).toMatchObject({ client: 0, ville: 1, pays: 2, volume: 3, remarques: 4, dossier: 5, telephone: 6, destination: -1 });
  });
});
