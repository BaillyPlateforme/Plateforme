import "server-only";
import ExcelJS from "exceljs";

/*
 * La lecture d'un fichier déposé à l'import : CSV ou Excel (.xlsx), rendu en
 * feuilles de cellules texte. La correspondance des colonnes et la
 * vérification se font ensuite, sur ces cellules (voir saisie.ts).
 *
 * Un CSV exporté d'Excel en France arrive souvent en Windows-1252, séparé par
 * des points-virgules : l'encodage et le séparateur sont détectés.
 */

export const TAILLE_MAX = 10 * 1024 * 1024;
const LIGNES_MAX = 2000;
const COLONNES_MAX = 40;

export type Feuille = { nom: string; lignes: string[][] };

/** Les cellules d'un CSV, guillemets et retours à la ligne entre guillemets compris. */
function lireCsv(texte: string): string[][] {
  const debut = texte.split(/\r?\n/).slice(0, 10).join("\n");
  const compter = (sep: string) => {
    let n = 0, guillemets = false;
    for (const ch of debut) {
      if (ch === '"') guillemets = !guillemets;
      else if (ch === sep && !guillemets) n++;
    }
    return n;
  };
  const sep = [";", ",", "\t"].sort((a, b) => compter(b) - compter(a))[0];

  const lignes: string[][] = [];
  let ligne: string[] = [], cellule = "", guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (guillemets) {
      if (ch === '"' && texte[i + 1] === '"') { cellule += '"'; i++; }
      else if (ch === '"') guillemets = false;
      else cellule += ch;
    } else if (ch === '"' && cellule === "") guillemets = true;
    else if (ch === sep) { ligne.push(cellule); cellule = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(cellule); lignes.push(ligne); ligne = []; cellule = "";
      if (lignes.length > LIGNES_MAX) break;
    } else cellule += ch;
  }
  if (cellule !== "" || ligne.length) { ligne.push(cellule); lignes.push(ligne); }
  return lignes;
}

/**
 * Les octets 0x80 à 0x9F en Windows-1252 (« € ’ œ … – ») : là seulement il
 * diffère du Latin-1. Les cinq octets sans caractère (0x81, 0x8D, 0x8F, 0x90,
 * 0x9D) restent tels quels.
 */
const CP1252_80_9F = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";

/** UTF-8 si le fichier l'est vraiment, sinon Windows-1252 (l'« ANSI » d'Excel). */
function decoder(octets: Uint8Array) {
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) return new TextDecoder("utf-8").decode(octets.subarray(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    // Sous Node 22, TextDecoder("windows-1252") décode en fait du Latin-1 : 0x80–0x9F y deviennent des
    // caractères de contrôle invisibles, et l'apostrophe d'un export Excel (« l’Église ») se perd. On les
    // remplace par ceux de Windows-1252 (sans effet si le décodeur les a déjà bien lus).
    return new TextDecoder("windows-1252").decode(octets).replace(/[\u0080-\u009f]/g, (c) => CP1252_80_9F[c.charCodeAt(0) - 0x80]);
  }
}

/** Le texte d'une cellule Excel, quelle que soit sa nature (formule, texte enrichi, date, lien). */
function texteCellule(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return String(Math.round(v * 1e6) / 1e6);
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    // Une formule se lit par son résultat enregistré ; sans résultat calculé (classeur produit par un
    // script, jamais recalculé), la clé `result` manque : la cellule est vide.
    if ("formula" in v || "sharedFormula" in v || "result" in v) return texteCellule((v.result ?? "") as ExcelJS.CellValue);
    if ("text" in v) return String(v.text ?? "");
    if ("error" in v) return "";
    // Une nature inconnue : vide, jamais « [object Object] ».
    return "";
  }
  return String(v);
}

/** Sans lignes vides en fin de feuille ni colonnes vides à droite. */
function nettoyer(lignes: string[][]): string[][] {
  const pleines = lignes.map((l) => l.slice(0, COLONNES_MAX).map((c) => c.replace(/ /g, " ").trim()));
  while (pleines.length && pleines[pleines.length - 1].every((c) => !c)) pleines.pop();
  const largeur = Math.max(0, ...pleines.map((l) => l.reduceRight((n, c, i) => (n || !c ? n : i + 1), 0)));
  return pleines.slice(0, LIGNES_MAX + 1).map((l) => Array.from({ length: largeur }, (_, i) => l[i] ?? ""));
}

export async function lireFichier(nom: string, octets: Uint8Array): Promise<{ format: "csv" | "excel"; feuilles: Feuille[] }> {
  // Sans point dans le nom, pas d'extension : le fichier est lu comme un CSV (ou un .xlsx à sa signature).
  const point = nom.lastIndexOf(".");
  const ext = point >= 0 ? nom.slice(point + 1).toLowerCase() : "";
  if (ext === "xls") throw new Error("Le format .xls (Excel 97-2003) n'est pas lu : enregistrez le fichier en .xlsx ou en CSV depuis Excel.");
  if (ext === "xlsx" || ext === "xlsm" || (octets[0] === 0x50 && octets[1] === 0x4b)) {
    const classeur = new ExcelJS.Workbook();
    try {
      await classeur.xlsx.load(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer);
    } catch {
      throw new Error("Ce fichier Excel n'a pas pu être ouvert : il est peut-être protégé par un mot de passe ou endommagé.");
    }
    const feuilles: Feuille[] = [];
    classeur.eachSheet((f) => {
      if (f.state && f.state !== "visible") return;
      const lignes: string[][] = [];
      f.eachRow({ includeEmpty: true }, (r, n) => {
        if (n > LIGNES_MAX + 1) return;
        const cellules: string[] = [];
        r.eachCell({ includeEmpty: true }, (c, col) => {
          cellules[col - 1] = texteCellule(c.value);
        });
        lignes[n - 1] = Array.from(cellules, (c) => c ?? "");
      });
      const propres = nettoyer(Array.from(lignes, (l) => l ?? []));
      if (propres.length) feuilles.push({ nom: f.name, lignes: propres });
    });
    if (!feuilles.length) throw new Error("Le classeur ne contient aucune feuille remplie.");
    return { format: "excel", feuilles };
  }
  if (ext && !["csv", "txt", "tsv"].includes(ext)) throw new Error(`Format « .${ext} » non pris en charge : déposez un fichier CSV ou Excel (.xlsx).`);
  const lignes = nettoyer(lireCsv(decoder(octets)));
  if (!lignes.length) throw new Error("Le fichier est vide.");
  return { format: "csv", feuilles: [{ nom: nom.replace(/\.[^.]+$/, ""), lignes }] };
}
