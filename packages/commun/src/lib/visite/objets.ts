/*
 * La saisie automatique des objets, sur la tablette de visite (retours de
 * Céline, 16/11/2026) : « si on tape "ta" que cela propose table, tableaux,
 * table basse… jusqu'à ce que le bon mot apparaisse ».
 *
 * Les suggestions viennent de trois sources, dans cet ordre de confiance :
 * les objets déjà relevés dans ce dossier, le catalogue de la tablette (celui
 * de Dragan depuis le 18/11/2026, lib/visite/catalogue.ts), puis les
 * libellés que l'équipe a déjà saisis dans d'autres dossiers (le vocabulaire
 * de Bailly, appris au fil des inventaires). Chaque mot tapé doit commencer
 * un mot du libellé, sans tenir compte des accents ni des majuscules :
 * « ta » trouve « Table basse » et « Tapis », « ta ba » ne garde que
 * « Table basse », « chev » trouve « Table de chevet ».
 *
 * Depuis le 18/11/2026, la frappe trouve aussi une référence par ses
 * synonymes (« Kallax », « frigo »…) et par sa désignation anglaise, après
 * celles que trouve le libellé français.
 *
 * Fonctions pures, sans secret : le fichier part dans le code du navigateur.
 */

export type SourceObjet = "dossier" | "catalogue" | "historique";

export interface ObjetConnu {
  label: string;
  volume: number;
  groupe?: string;
  source: SourceObjet;
  /** La désignation anglaise (catalogue de la tablette, ou ligne du dossier). */
  en?: string | null;
  /** D'autres mots qui mènent à cet objet (catalogue de la tablette). */
  synonymes?: string[];
  /** Sans volume au catalogue (« À estimer », « À mesurer ») : le volume se saisit à la visite. */
  aMesurer?: boolean;
  /** Une protection (« Non compté ») : quantifiée, hors cubage. */
  horsCubage?: boolean;
  /** L'anglais du catalogue est douteux (analyse du 18/11/2026). */
  enARelire?: boolean;
}

/** « Table à manger » → « table a manger » : minuscules, sans accents ni ponctuation. */
export function normaliser(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RANG_SOURCE: Record<SourceObjet, number> = { dossier: 0, catalogue: 1, historique: 2 };

/** Chaque mot tapé commence un mot du texte, chacun le sien, dans n'importe quel ordre. */
function repond(mots: string[], texte: string) {
  const motsTexte = texte.split(" ");
  const pris = new Set<number>();
  return mots.every((m) => {
    const i = motsTexte.findIndex((w, j) => !pris.has(j) && w.startsWith(m));
    if (i < 0) return false;
    pris.add(i);
    return true;
  });
}

/**
 * Les objets qui répondent à ce qui est tapé, les meilleurs d'abord : le
 * libellé qui commence par la frappe, puis celui dont le premier mot y
 * répond, puis les autres, puis ceux que trouvent un synonyme, puis
 * l'anglais ; à égalité, la source la plus sûre, le libellé le plus court. Un
 * même libellé n'apparaît qu'une fois (la source la plus sûre l'emporte).
 * Rien tant que rien n'est tapé.
 */
export function rechercherObjets(frappe: string, objets: ObjetConnu[], limite = 8): ObjetConnu[] {
  const q = normaliser(frappe);
  if (!q) return [];
  const mots = q.split(" ");
  const vus = new Map<string, { o: ObjetConnu; rang: number }>();
  for (const o of objets) {
    const n = normaliser(o.label);
    if (!n) continue;
    let rang: number;
    if (repond(mots, n)) rang = n === q ? 0 : n.startsWith(q) ? 1 : n.split(" ")[0].startsWith(mots[0]) ? 2 : 3;
    else if ((o.synonymes ?? []).some((x) => repond(mots, normaliser(x)))) rang = 4;
    else if (o.en && repond(mots, normaliser(o.en))) rang = 5;
    else continue;
    const deja = vus.get(n);
    if (!deja || rang < deja.rang || (rang === deja.rang && RANG_SOURCE[o.source] < RANG_SOURCE[deja.o.source])) vus.set(n, { o, rang });
  }
  return [...vus.values()]
    .sort(
      (a, b) =>
        a.rang - b.rang ||
        RANG_SOURCE[a.o.source] - RANG_SOURCE[b.o.source] ||
        a.o.label.length - b.o.label.length ||
        a.o.label.localeCompare(b.o.label, "fr"),
    )
    .slice(0, limite)
    .map((x) => x.o);
}

type ArticleConnu = { label: string; volume: number; groupe?: string; en?: string | null; synonymes?: string[]; aMesurer?: boolean; horsCubage?: boolean; enARelire?: boolean };

/**
 * Les objets connus, réunis : le catalogue, les libellés déjà saisis ailleurs
 * (sans ceux que le catalogue a déjà), et ceux du dossier. Un volume nul ou
 * aberrant est écarté — sauf, au catalogue, une référence « à mesurer » ou
 * une protection, qui s'ajoutent à volume nul.
 */
export function objetsConnus(
  catalogue: ArticleConnu[],
  historique: { label: string; volume: number }[],
  dossier: { libelle: string; volume: number; libelleEn?: string | null }[],
): ObjetConnu[] {
  const correct = (v: number) => Number.isFinite(v) && v > 0 && v <= 99;
  const duCatalogue = new Map(catalogue.map((c) => [normaliser(c.label), c]));
  return [
    ...dossier
      .filter((o) => o.libelle.trim() && correct(o.volume))
      .map((o) => {
        const c = duCatalogue.get(normaliser(o.libelle));
        const en = o.libelleEn?.trim() || null;
        return {
          label: o.libelle.trim(), volume: o.volume, source: "dossier" as const,
          ...(en ? { en } : {}), ...(c?.synonymes?.length ? { synonymes: c.synonymes } : {}), ...(en && c?.enARelire ? { enARelire: true } : {}),
        };
      }),
    ...catalogue
      .filter((c) => correct(c.volume) || ((c.aMesurer || c.horsCubage) && c.volume === 0))
      .map((c) => ({
        label: c.label, volume: c.volume, groupe: c.groupe, source: "catalogue" as const,
        ...(c.en ? { en: c.en } : {}), ...(c.synonymes?.length ? { synonymes: c.synonymes } : {}),
        ...(c.aMesurer ? { aMesurer: true } : {}), ...(c.horsCubage ? { horsCubage: true } : {}), ...(c.enARelire ? { enARelire: true } : {}),
      })),
    ...historique
      .filter((h) => h.label.trim() && correct(h.volume) && !duCatalogue.has(normaliser(h.label)))
      .map((h) => ({ label: h.label.trim(), volume: h.volume, source: "historique" as const })),
  ];
}
