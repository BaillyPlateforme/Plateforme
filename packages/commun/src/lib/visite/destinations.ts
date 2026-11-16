import { GENRE_ETAPE } from "./regles";

/*
 * La répartition de l'inventaire entre les destinations du dossier (retours
 * de Céline, 16/11/2026) : « pouvoir dispatcher lorsqu'il y a plusieurs
 * destinations (GM – livraison en province – livraison Paris par exemple) ;
 * ces destinations seront indiquées dans la fiche de départ ».
 *
 * Les destinations sont les étapes du trajet du dossier (crm.etapes_trajet)
 * autres que le départ : garde-meuble, arrivées, étapes. Chaque objet de
 * l'inventaire peut être rattaché à l'une d'elles (crm.inventaire.etape_id) ;
 * la colonne texte inventaire.destination suit son libellé, pour les écrans
 * du CRM qui l'affichent déjà.
 *
 * Fonctions pures, partagées par le serveur (qui écrit le libellé) et la
 * tablette (qui l'affiche).
 */

export interface EtapeDestination {
  id: number;
  genre: string;
  adresse: string | null;
  ville?: string | null;
  code_postal?: string | null;
}

export interface Destination {
  id: number;
  genre: string;
  libelle: string;
}

/** La ville d'une adresse écrite d'un trait : « 8 av. Carnot, 78110 Le Vésinet » → « Le Vésinet ». */
export function villeDeLAdresse(adresse: string | null | undefined) {
  const a = String(adresse ?? "").trim();
  if (!a) return null;
  const cp = a.match(/\b\d{5}\s+([^,\d][^,]*)$/);
  if (cp) return cp[1].trim();
  const parties = a.split(",").map((x) => x.trim()).filter(Boolean);
  const derniere = parties.at(-1) ?? a;
  return derniere.length > 32 ? `${derniere.slice(0, 31)}…` : derniere;
}

/**
 * Les destinations du dossier, dans l'ordre du trajet, chacune avec un
 * libellé court et unique : « Garde-meuble », « Arrivée » quand il n'y en a
 * qu'une, « Arrivée · Lyon » et « Arrivée · Paris » quand il y en a deux.
 */
export function destinationsDuTrajet(etapes: EtapeDestination[]): Destination[] {
  const cibles = etapes.filter((e) => e.genre !== "depart");
  const parGenre = new Map<string, number>();
  for (const e of cibles) parGenre.set(e.genre, (parGenre.get(e.genre) ?? 0) + 1);
  const pris = new Set<string>();
  return cibles.map((e, i) => {
    const base = GENRE_ETAPE[e.genre] ?? "Étape";
    const lieu = e.ville?.trim() || villeDeLAdresse(e.adresse);
    let libelle = (parGenre.get(e.genre) ?? 0) > 1 || e.genre === "autre" ? `${base} · ${lieu ?? `n° ${i + 1}`}` : base;
    for (let n = 2; pris.has(libelle.toLowerCase()); n++) libelle = `${base} · ${lieu ?? "adresse"} (${n})`;
    pris.add(libelle.toLowerCase());
    return { id: e.id, genre: e.genre, libelle: libelle.slice(0, 80) };
  });
}

/** La destination par défaut d'un objet nouveau : la première arrivée, sinon la première destination. */
export const destinationParDefaut = (d: Destination[]) => (d.find((x) => x.genre === "arrivee") ?? d[0])?.id ?? null;

/**
 * La destination d'un objet rangé avant la tablette (sans étape) : celle dont
 * le libellé est le sien, ou, pour le libellé générique de la fiche
 * (« Arrivée », « Garde-meuble »), la première étape de ce genre. Une
 * destination hors trajet (« Don », « Déchetterie »…) reste sans étape.
 */
export function resoudreDestination(texte: string | null | undefined, d: Destination[]): number | null {
  const t = String(texte ?? "").trim().toLowerCase();
  if (!t) return null;
  const meme = d.find((x) => x.libelle.toLowerCase() === t);
  if (meme) return meme.id;
  const genre = Object.keys(GENRE_ETAPE).find((g) => GENRE_ETAPE[g].toLowerCase() === t);
  return genre ? (d.find((x) => x.genre === genre)?.id ?? null) : null;
}

/**
 * Le volume par destination, dans l'ordre du trajet, puis les destinations
 * hors trajet (« Don »…) et les objets sans destination. Seules figurent les
 * destinations qui ont au moins un objet, sauf `toutes`.
 */
export function volumesParDestination(
  objets: { quantite: number; volume: number; destination?: number | null; destinationLibre?: string | null }[],
  d: Destination[],
  toutes = false,
): { cle: string; id: number | null; libelle: string; volume: number; objets: number }[] {
  const lignes = new Map<string, { cle: string; id: number | null; libelle: string; volume: number; objets: number }>();
  for (const x of d) lignes.set(`e${x.id}`, { cle: `e${x.id}`, id: x.id, libelle: x.libelle, volume: 0, objets: 0 });
  for (const o of objets) {
    const connue = o.destination != null && lignes.has(`e${o.destination}`);
    const cle = connue ? `e${o.destination}` : `l${(o.destinationLibre ?? "").trim().toLowerCase()}`;
    if (!lignes.has(cle)) lignes.set(cle, { cle, id: null, libelle: o.destinationLibre?.trim() || "Sans destination", volume: 0, objets: 0 });
    const l = lignes.get(cle)!;
    l.volume += o.quantite * o.volume;
    l.objets += o.quantite;
  }
  return [...lignes.values()]
    .map((l) => ({ ...l, volume: Math.round(l.volume * 100) / 100 }))
    .filter((l) => toutes || l.objets > 0);
}
