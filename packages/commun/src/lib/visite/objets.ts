/*
 * La saisie automatique des objets, sur la tablette de visite (retours de
 * Céline, 16/11/2026) : « si on tape "ta" que cela propose table, tableaux,
 * table basse… jusqu'à ce que le bon mot apparaisse ».
 *
 * Les suggestions viennent de trois sources, dans cet ordre de confiance :
 * les objets déjà relevés dans ce dossier, le catalogue de mobilier partagé
 * avec le formulaire du site (lib/catalog.ts, volumes indicatifs), puis les
 * libellés que l'équipe a déjà saisis dans d'autres dossiers (le vocabulaire
 * de Bailly, appris au fil des inventaires). Chaque mot tapé doit commencer
 * un mot du libellé, sans tenir compte des accents ni des majuscules :
 * « ta » trouve « Table basse » et « Tapis », « ta ba » ne garde que
 * « Table basse », « chev » trouve « Table de chevet ».
 *
 * Fonctions pures, sans secret : le fichier part dans le code du navigateur.
 */

export type SourceObjet = "dossier" | "catalogue" | "historique";

export interface ObjetConnu {
  label: string;
  volume: number;
  groupe?: string;
  source: SourceObjet;
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

/**
 * Les objets qui répondent à ce qui est tapé, les meilleurs d'abord : le
 * libellé qui commence par la frappe, puis celui dont le premier mot y
 * répond, puis les autres ; à égalité, la source la plus sûre, le libellé
 * le plus court. Un même libellé n'apparaît qu'une fois (la source la plus
 * sûre l'emporte). Rien tant que rien n'est tapé.
 */
export function rechercherObjets(frappe: string, objets: ObjetConnu[], limite = 8): ObjetConnu[] {
  const q = normaliser(frappe);
  if (!q) return [];
  const mots = q.split(" ");
  const vus = new Map<string, { o: ObjetConnu; rang: number }>();
  for (const o of objets) {
    const n = normaliser(o.label);
    if (!n) continue;
    const motsLabel = n.split(" ");
    // Chaque mot tapé commence un mot du libellé, chacun le sien, dans n'importe quel ordre.
    const pris = new Set<number>();
    const ok = mots.every((m) => {
      const i = motsLabel.findIndex((w, j) => !pris.has(j) && w.startsWith(m));
      if (i < 0) return false;
      pris.add(i);
      return true;
    });
    if (!ok) continue;
    const rang = n === q ? 0 : n.startsWith(q) ? 1 : motsLabel[0].startsWith(mots[0]) ? 2 : 3;
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

/**
 * Les objets connus, réunis : le catalogue, les libellés déjà saisis ailleurs
 * (sans ceux que le catalogue a déjà), et ceux du dossier. Un volume nul ou
 * aberrant est écarté.
 */
export function objetsConnus(
  catalogue: { label: string; volume: number; groupe?: string }[],
  historique: { label: string; volume: number }[],
  dossier: { libelle: string; volume: number }[],
): ObjetConnu[] {
  const correct = (v: number) => Number.isFinite(v) && v > 0 && v <= 99;
  const dansCatalogue = new Set(catalogue.map((c) => normaliser(c.label)));
  return [
    ...dossier.filter((o) => o.libelle.trim() && correct(o.volume)).map((o) => ({ label: o.libelle.trim(), volume: o.volume, source: "dossier" as const })),
    ...catalogue.filter((c) => correct(c.volume)).map((c) => ({ label: c.label, volume: c.volume, groupe: c.groupe, source: "catalogue" as const })),
    ...historique
      .filter((h) => h.label.trim() && correct(h.volume) && !dansCatalogue.has(normaliser(h.label)))
      .map((h) => ({ label: h.label.trim(), volume: h.volume, source: "historique" as const })),
  ];
}
