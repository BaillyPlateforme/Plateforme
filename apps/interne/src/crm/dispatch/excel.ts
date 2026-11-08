import "server-only";
import ExcelJS from "exceljs";
import { dateLongue, jauge, lignesDe, somme } from "./outils";
import { GENRES, type Colonne, type Ligne, type Plan } from "./types";

/*
 * Les classeurs Excel du dispatch, pour les équipes logistiques : le planning
 * (une synthèse, puis une feuille par colonne, puis les clients à répartir)
 * et le modèle vierge proposé à l'import. Aux couleurs des documents de
 * Bailly : le noir et le jaune du logo.
 */

const NOIR = "FF1B1A18";
const JAUNE = "FFF5D033";
const JAUNE_DOUX = "FFFDF6D6";
const GRIS = "FF615F68";
const FILET = "FFE9E7E2";

const bordure: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: FILET } } };

/** Le nom d'une feuille Excel : 31 caractères au plus, sans : \ / ? * [ ], unique dans le classeur. */
function nomFeuille(libelle: string, pris: Set<string>) {
  const base = libelle.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Feuille";
  let nom = base, n = 2;
  while (pris.has(nom.toLowerCase())) nom = `${base.slice(0, 26)} ${n++}`;
  pris.add(nom.toLowerCase());
  return nom;
}

function entete(f: ExcelJS.Worksheet, titre: string, sous: string, largeur: number) {
  f.mergeCells(1, 1, 1, largeur);
  f.mergeCells(2, 1, 2, largeur);
  const t = f.getCell(1, 1);
  t.value = titre;
  t.font = { name: "Calibri", size: 15, bold: true, color: { argb: NOIR } };
  const s = f.getCell(2, 1);
  s.value = sous;
  s.font = { name: "Calibri", size: 10, color: { argb: GRIS } };
  f.getRow(1).height = 24;
  f.getRow(3).height = 6;
}

function titres(r: ExcelJS.Row) {
  r.height = 22;
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NOIR } };
    c.alignment = { vertical: "middle" };
  });
}

function total(r: ExcelJS.Row) {
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: NOIR } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: JAUNE_DOUX } };
    c.border = { top: { style: "thin", color: { argb: JAUNE } } };
  });
}

const COLONNES_CLIENTS: { titre: string; largeur: number }[] = [
  { titre: "N°", largeur: 5 },
  { titre: "Client", largeur: 30 },
  { titre: "Ville", largeur: 20 },
  { titre: "Pays", largeur: 16 },
  { titre: "Volume (m³)", largeur: 12 },
  { titre: "Remarques", largeur: 48 },
  { titre: "Dossier", largeur: 15 },
  { titre: "Téléphone", largeur: 16 },
];

function tableClients(f: ExcelJS.Worksheet, lignes: Ligne[], debut: number) {
  COLONNES_CLIENTS.forEach((c, i) => (f.getColumn(i + 1).width = c.largeur));
  f.getRow(debut).values = COLONNES_CLIENTS.map((c) => c.titre);
  titres(f.getRow(debut));
  lignes.forEach((l, i) => {
    const r = f.getRow(debut + 1 + i);
    r.values = [i + 1, l.client, l.ville ?? "", l.pays ?? "", l.volume, l.remarques ?? "", l.dossierRef ?? "", l.telephone ?? ""];
    r.getCell(5).numFmt = "0.0";
    r.getCell(6).alignment = { wrapText: true, vertical: "top" };
    r.eachCell({ includeEmpty: true }, (c) => (c.border = bordure));
  });
  const fin = debut + lignes.length;
  const t = f.getRow(fin + 1);
  t.values = ["", `${lignes.length} client${lignes.length > 1 ? "s" : ""}`, "", "", lignes.length ? { formula: `SUM(E${debut + 1}:E${fin})`, result: somme(lignes) } : 0, "", "", ""];
  t.getCell(5).numFmt = "0.0";
  total(t);
  f.views = [{ state: "frozen", ySplit: debut }];
  f.autoFilter = lignes.length ? { from: { row: debut, column: 1 }, to: { row: fin, column: COLONNES_CLIENTS.length } } : undefined;
}

function decrire(c: Colonne) {
  return [
    GENRES[c.genre].nom + (c.taille ? ` ${c.taille} pieds` : ""),
    c.zone,
    c.jour ? dateLongue(c.jour) : null,
    c.conteneur ? `n° ${c.conteneur.numero}` : null,
    c.verrouilleeLe ? `validée${c.verrouilleePar ? ` par ${c.verrouilleePar}` : ""}` : "non validée",
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function classeurPlan(plan: Plan, imprimePar: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bailly CRM";
  wb.created = new Date();
  const pris = new Set<string>();
  const sous = `${plan.sens === "export" ? "Export" : "Import"}${plan.port ? ` · ${plan.port}` : ""}${plan.dateReference ? ` · ${dateLongue(plan.dateReference)}` : ""} · édité le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date())} par ${imprimePar}`;

  // Synthèse : une ligne par colonne.
  const s = wb.addWorksheet(nomFeuille("Synthèse", pris), { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  entete(s, `Dispatch · ${plan.nom}`, sous, 9);
  const largeurs = [30, 16, 10, 22, 14, 9, 12, 12, 12];
  largeurs.forEach((l, i) => (s.getColumn(i + 1).width = l));
  s.getRow(4).values = ["Colonne", "Genre", "Taille", "Destination / zone", "Date", "Clients", "Volume (m³)", "Capacité (m³)", "Remplissage"];
  titres(s.getRow(4));
  let r = 5;
  const toutes = [...plan.colonnes];
  for (const c of toutes) {
    const ls = lignesDe(plan.lignes, c.id);
    const v = somme(ls);
    const j = jauge(v, c.capacite);
    const ligne = s.getRow(r++);
    ligne.values = [
      c.libelle + (c.verrouilleeLe ? "  (validée)" : ""),
      GENRES[c.genre].nom,
      c.taille ? `${c.taille} pieds` : "",
      c.zone ?? "",
      c.jour ? new Date(`${c.jour}T00:00:00Z`) : "",
      ls.length,
      v,
      c.capacite ?? "",
      j.pct != null ? j.pct / 100 : "",
    ];
    ligne.getCell(5).numFmt = "dd/mm/yyyy";
    ligne.getCell(7).numFmt = "0.0";
    ligne.getCell(8).numFmt = "0.0";
    ligne.getCell(9).numFmt = "0%";
    if (j.etat === "depasse") ligne.getCell(9).font = { bold: true, color: { argb: "FFBE123C" } };
    ligne.eachCell({ includeEmpty: true }, (x) => (x.border = bordure));
  }
  const reste = lignesDe(plan.lignes, null);
  const lr = s.getRow(r++);
  lr.values = ["À répartir", "", "", "", "", reste.length, somme(reste), "", ""];
  lr.getCell(7).numFmt = "0.0";
  lr.font = { italic: true, color: { argb: GRIS } };
  const t = s.getRow(r);
  t.values = ["Total", "", "", "", "", { formula: `SUM(F5:F${r - 1})`, result: plan.lignes.length }, { formula: `SUM(G5:G${r - 1})`, result: somme(plan.lignes) }, "", ""];
  t.getCell(7).numFmt = "0.0";
  total(t);
  s.views = [{ state: "frozen", ySplit: 4 }];

  // Une feuille par colonne.
  for (const c of toutes) {
    const f = wb.addWorksheet(nomFeuille(c.libelle, pris), { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const ls = lignesDe(plan.lignes, c.id);
    const v = somme(ls);
    entete(f, `${GENRES[c.genre].feuille} · ${c.libelle}`, `${plan.nom} · ${decrire(c)}${c.capacite ? ` · ${String(v).replace(".", ",")} m³ sur ${String(c.capacite).replace(".", ",")} m³` : ""}`, COLONNES_CLIENTS.length);
    tableClients(f, ls, 4);
  }
  if (reste.length) {
    const f = wb.addWorksheet(nomFeuille("À répartir", pris));
    entete(f, "Clients à répartir", `${plan.nom} · ${reste.length} client${reste.length > 1 ? "s" : ""} sans colonne`, COLONNES_CLIENTS.length);
    tableClients(f, reste, 4);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/**
 * Le modèle vierge proposé à l'import : la feuille « Clients » à remplir (les
 * titres reconnus, aucune ligne d'exemple qui risquerait d'être importée), et
 * une feuille « Aide » qui décrit chaque colonne.
 */
export async function classeurModele(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bailly CRM";
  const f = wb.addWorksheet("Clients");
  const cols: [string, number, string, string][] = [
    ["Client", 30, "Obligatoire", "Nom du client ou de la famille, ex. « Famille Martin »"],
    ["Ville", 20, "Ville ou pays obligatoire", "Ville de livraison, ex. « Fort-de-France »"],
    ["Pays", 18, "Ville ou pays obligatoire", "Pays ou territoire, ex. « Martinique » : c'est lui qui regroupe les clients"],
    ["Volume (m³)", 13, "Obligatoire", "Volume du déménagement, ex. 18,5"],
    ["Remarques", 46, "Facultatif", "Contraintes, accès, objets particuliers"],
    ["Dossier", 16, "Facultatif", "Référence du dossier dans le CRM, ex. BD-2026-0421"],
    ["Téléphone", 16, "Facultatif", "Contact du client"],
  ];
  cols.forEach(([, largeur], i) => (f.getColumn(i + 1).width = largeur));
  f.getRow(1).values = cols.map(([titre]) => titre);
  titres(f.getRow(1));
  f.views = [{ state: "frozen", ySplit: 1 }];

  const a = wb.addWorksheet("Aide");
  [22, 26, 70].forEach((l, i) => (a.getColumn(i + 1).width = l));
  entete(a, "Importer les clients d'un conteneur", "Remplissez la feuille « Clients », une ligne par client, puis déposez le fichier dans le CRM (Conteneurs › Dispatch › Importer des clients).", 3);
  a.getRow(4).values = ["Colonne", "Statut", "Contenu"];
  titres(a.getRow(4));
  cols.forEach(([titre, , statut, aide], i) => {
    const r = a.getRow(5 + i);
    r.values = [titre, statut, aide];
    r.eachCell((c) => (c.border = bordure));
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
