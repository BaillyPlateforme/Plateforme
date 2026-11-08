/*
 * Le Markdown des réponses du Copilote, découpé en blocs : intertitres,
 * paragraphes, listes, tableaux, citations, filets, et les lignes qui ne
 * portent que des clés d'éléments du CRM (« [[dossier:12]] »), que la page
 * affiche en cartes. Pas de HTML : le texte reste du texte.
 */

export type Bloc =
  | { k: "titre"; niveau: 3 | 4; texte: string }
  | { k: "para"; lignes: string[] }
  | { k: "liste"; ordonnee: boolean; items: string[] }
  | { k: "table"; entetes: string[]; lignes: string[][] }
  | { k: "citation"; texte: string }
  | { k: "regle" }
  | { k: "cles"; cles: string[] };

const CLE_SEULE = /^\s*(?:[-*•]\s+|\d+[.)]\s+)?((?:\[\[\s*(?:dossier|devis|rdv|demande|chiffre)\s*:\s*[\w-]+\s*\]\]\s*[,;]?\s*)+)$/;
const CLE = /\[\[\s*(dossier|devis|rdv|demande|chiffre)\s*:\s*([\w-]+)\s*\]\]/g;
const PUCE = /^\s*[-*•]\s+(.*)$/;
const NUMERO = /^\s*\d+[.)]\s+(.*)$/;
const cellules = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function blocs(texte: string): Bloc[] {
  const out: Bloc[] = [];
  const lignes = texte.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  let liste: { ordonnee: boolean; items: string[] } | null = null;
  const vider = () => {
    if (para.length) out.push({ k: "para", lignes: para });
    if (liste) out.push({ k: "liste", ...liste });
    para = [];
    liste = null;
  };

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (!l.trim()) {
      vider();
      continue;
    }
    // Des clés seules sur la ligne : des cartes, à la suite des précédentes.
    const seules = l.match(CLE_SEULE);
    if (seules) {
      vider();
      const cles = [...seules[1].matchAll(CLE)].map((m) => `${m[1]}:${m[2]}`);
      const avant = out[out.length - 1];
      if (avant?.k === "cles") avant.cles.push(...cles);
      else out.push({ k: "cles", cles });
      continue;
    }
    const titre = l.match(/^\s*(#{1,6})\s+(.*)$/);
    if (titre) {
      vider();
      out.push({ k: "titre", niveau: titre[1].length <= 3 ? 3 : 4, texte: titre[2].replace(/\s*#+\s*$/, "") });
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) {
      vider();
      out.push({ k: "regle" });
      continue;
    }
    // Un tableau : une ligne d'en-têtes, une ligne de tirets, puis les lignes.
    if (l.includes("|") && i + 1 < lignes.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lignes[i + 1])) {
      vider();
      const entetes = cellules(l);
      const corps: string[][] = [];
      i += 2;
      while (i < lignes.length && lignes[i].includes("|") && lignes[i].trim()) corps.push(cellules(lignes[i++]));
      i--;
      out.push({ k: "table", entetes, lignes: corps });
      continue;
    }
    const citation = l.match(/^\s*>\s?(.*)$/);
    if (citation) {
      vider();
      out.push({ k: "citation", texte: citation[1] });
      continue;
    }
    const puce = l.match(PUCE);
    const numero = puce ? null : l.match(NUMERO);
    if (puce || numero) {
      const ordonnee = !!numero;
      if (para.length) {
        out.push({ k: "para", lignes: para });
        para = [];
      }
      if (liste && liste.ordonnee !== ordonnee) {
        out.push({ k: "liste", ...liste });
        liste = null;
      }
      liste ??= { ordonnee, items: [] };
      liste.items.push((puce ?? numero)![1]);
      continue;
    }
    // La suite d'un élément de liste, indentée.
    if (liste && /^\s{2,}\S/.test(l)) {
      liste.items[liste.items.length - 1] += ` ${l.trim()}`;
      continue;
    }
    if (liste) {
      out.push({ k: "liste", ...liste });
      liste = null;
    }
    para.push(l.trim());
  }
  vider();
  return out;
}

export type Morceau =
  | { k: "texte"; t: string }
  | { k: "gras"; enfants: Morceau[] }
  | { k: "italique"; enfants: Morceau[] }
  | { k: "code"; t: string }
  | { k: "lien"; t: string; href: string }
  | { k: "cle"; cle: string };

const EN_LIGNE = /(\[\[\s*(?:dossier|devis|rdv|demande|chiffre)\s*:\s*[\w-]+\s*\]\]|\*\*[^*]+?\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|(?<![\w*])\*(?!\s)[^*\n]+?(?<!\s)\*(?![\w*]))/g;

/** Le gras, l'italique, le code, les liens internes et les clés d'une ligne. */
export function enLigne(t: string): Morceau[] {
  const out: Morceau[] = [];
  for (const m of t.split(EN_LIGNE)) {
    if (!m) continue;
    const cle = m.match(/^\[\[\s*(dossier|devis|rdv|demande|chiffre)\s*:\s*([\w-]+)\s*\]\]$/);
    if (cle) out.push({ k: "cle", cle: `${cle[1]}:${cle[2]}` });
    else if (/^\*\*[^*]+\*\*$/.test(m)) out.push({ k: "gras", enfants: enLigne(m.slice(2, -2)) });
    else if (/^`[^`]+`$/.test(m)) out.push({ k: "code", t: m.slice(1, -1) });
    else if (/^\*[^*]+\*$/.test(m)) out.push({ k: "italique", enfants: enLigne(m.slice(1, -1)) });
    else {
      const lien = m.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      // Seules les pages du CRM (« /… ») deviennent des liens.
      if (lien && /^\/(?!\/)/.test(lien[2])) out.push({ k: "lien", t: lien[1], href: lien[2] });
      else out.push({ k: "texte", t: lien ? lien[1] : m });
    }
  }
  return out;
}

/** Les clés citées par un texte, dans l'ordre. */
export const clesDe = (texte: string) => [...texte.matchAll(CLE)].map((m) => `${m[1]}:${m[2]}`);
