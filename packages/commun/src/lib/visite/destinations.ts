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

// --- Les destinations hors adresse (Dragan, 18/11/2026) -----------------------------------------

/*
 * « Un menu déroulant permettant de sélectionner immédiatement l'adresse de
 * livraison, le garde-meubles, les éléments à laisser sur place, le
 * débarras, les biens pris en charge par le client ou une destination
 * restant à confirmer. » Ces quatre-là ne sont pas des étapes du trajet :
 * l'objet les porte en clé (crm.inventaire.destination_speciale), la colonne
 * texte inventaire.destination suit leur libellé.
 *
 * Le volume transporté, celui du dossier et du devis, en dépend. Règles par
 * défaut, À VALIDER avec Céline et Dragan :
 * - « À laisser sur place » et « Pris en charge par le client » ne sont pas
 *   transportés : hors du volume transporté ;
 * - « Débarras » : Bailly l'emporte, il est donc transporté (et compté),
 *   mais montré à part ;
 * - « À confirmer » : compté dans le transporté, par prudence pour le
 *   chiffrage, et signalé ;
 * - toute autre destination (une étape du trajet, ou une destination libre
 *   de la fiche : « Don », « Déchetterie », « Autre adresse ») est
 *   transportée, comme avant.
 */
export const DESTINATIONS_SPECIALES = [
  { cle: "sur_place", libelle: "À laisser sur place", transporte: false },
  { cle: "debarras", libelle: "Débarras", transporte: true },
  { cle: "client", libelle: "Pris en charge par le client", transporte: false },
  { cle: "a_confirmer", libelle: "À confirmer", transporte: true },
] as const;

export type CleSpeciale = (typeof DESTINATIONS_SPECIALES)[number]["cle"];
export const CLES_SPECIALES = DESTINATIONS_SPECIALES.map((x) => x.cle) as [CleSpeciale, ...CleSpeciale[]];
/** Les destinations qui sortent du volume transporté. */
export const CLES_NON_TRANSPORTEES: CleSpeciale[] = DESTINATIONS_SPECIALES.filter((x) => !x.transporte).map((x) => x.cle);

export const estSpeciale = (v: unknown): v is CleSpeciale => typeof v === "string" && (CLES_SPECIALES as string[]).includes(v);
export const libelleSpeciale = (c: CleSpeciale) => DESTINATIONS_SPECIALES.find((x) => x.cle === c)!.libelle;

/** La destination hors adresse que désigne un texte (« à laisser sur place » → sur_place), ou null. */
export function specialeDuTexte(texte: string | null | undefined): CleSpeciale | null {
  const t = String(texte ?? "").trim().toLowerCase();
  if (!t) return null;
  return DESTINATIONS_SPECIALES.find((x) => x.libelle.toLowerCase() === t)?.cle ?? null;
}

/** Un objet compte-t-il dans le volume transporté ? */
export const estTransporte = (o: { speciale?: string | null; destination_speciale?: string | null }) => {
  const c = o.speciale ?? o.destination_speciale;
  return !(estSpeciale(c) && CLES_NON_TRANSPORTEES.includes(c));
};

type ObjetVolume = { quantite: number; volume: number; speciale?: CleSpeciale | null };

/**
 * Les volumes de la saisie : tout ce qui est relevé, le transporté (celui du
 * dossier), ce qui ne l'est pas, et, dans le transporté, le débarras et ce
 * qui reste à confirmer.
 */
export function bilanVolumes(objets: ObjetVolume[]) {
  const somme = (f: (o: ObjetVolume) => boolean) => Math.round(objets.filter(f).reduce((n, o) => n + o.quantite * o.volume, 0) * 100) / 100;
  return {
    releve: somme(() => true),
    transporte: somme((o) => estTransporte(o)),
    nonTransporte: somme((o) => !estTransporte(o)),
    debarras: somme((o) => o.speciale === "debarras"),
    aConfirmer: somme((o) => o.speciale === "a_confirmer"),
  };
}

export type BilanVolumes = ReturnType<typeof bilanVolumes>;

/**
 * Le choix d'un menu de destination, en une valeur : « e12 » (l'étape 12 du
 * trajet), « s:debarras » (une destination hors adresse), ou null (sans
 * destination, ou une destination libre posée depuis la fiche).
 */
export type ChoixDestination = string;

export function choixDe(o: { destination?: number | null; speciale?: CleSpeciale | null }, d: Destination[]): ChoixDestination | null {
  if (o.speciale && estSpeciale(o.speciale)) return `s:${o.speciale}`;
  if (o.destination != null && d.some((x) => x.id === o.destination)) return `e${o.destination}`;
  return null;
}

/** Ce qu'un choix du menu change sur l'objet (ou la pièce). Un choix inconnu ne change rien. */
export function patchDuChoix(c: ChoixDestination, d: Destination[]): { destination: number | null; speciale: CleSpeciale | null; destinationLibre: null } | null {
  if (c.startsWith("s:")) {
    const k = c.slice(2);
    return estSpeciale(k) ? { destination: null, speciale: k, destinationLibre: null } : null;
  }
  const id = Number(c.slice(1));
  return c.startsWith("e") && d.some((x) => x.id === id) ? { destination: id, speciale: null, destinationLibre: null } : null;
}

/** Le libellé d'un choix : celui de l'étape, ou de la destination hors adresse. */
export function libelleDuChoix(c: ChoixDestination | null, d: Destination[]): string | null {
  if (!c) return null;
  if (c.startsWith("s:")) return estSpeciale(c.slice(2)) ? libelleSpeciale(c.slice(2) as CleSpeciale) : null;
  return d.find((x) => `e${x.id}` === c)?.libelle ?? null;
}

/** Tous les choix du menu, dans l'ordre : les étapes du trajet (adresses, garde-meuble), puis les destinations hors adresse. */
export const choixDuMenu = (d: Destination[]) => [
  ...d.map((x) => ({ valeur: `e${x.id}`, libelle: x.libelle, transporte: true })),
  ...DESTINATIONS_SPECIALES.map((x) => ({ valeur: `s:${x.cle}`, libelle: x.libelle, transporte: x.transporte })),
];

/**
 * Le volume par destination, dans l'ordre du trajet, puis les destinations
 * hors adresse (à laisser sur place, débarras…), les destinations libres de
 * la fiche (« Don »…) et les objets sans destination. Seules figurent les
 * destinations qui ont au moins un objet, sauf, avec `toutes`, les étapes
 * du trajet.
 */
export function volumesParDestination(
  objets: { quantite: number; volume: number; destination?: number | null; destinationLibre?: string | null; speciale?: CleSpeciale | null }[],
  d: Destination[],
  toutes = false,
): { cle: string; id: number | null; libelle: string; volume: number; objets: number; speciale: CleSpeciale | null; transporte: boolean }[] {
  type Ligne = { cle: string; id: number | null; libelle: string; volume: number; objets: number; speciale: CleSpeciale | null; transporte: boolean };
  const lignes = new Map<string, Ligne>();
  for (const x of d) lignes.set(`e${x.id}`, { cle: `e${x.id}`, id: x.id, libelle: x.libelle, volume: 0, objets: 0, speciale: null, transporte: true });
  for (const x of DESTINATIONS_SPECIALES) lignes.set(`s:${x.cle}`, { cle: `s:${x.cle}`, id: null, libelle: x.libelle, volume: 0, objets: 0, speciale: x.cle, transporte: x.transporte });
  for (const o of objets) {
    const choix = choixDe(o, d);
    const cle = choix ?? `l${(o.destinationLibre ?? "").trim().toLowerCase()}`;
    if (!lignes.has(cle)) lignes.set(cle, { cle, id: null, libelle: o.destinationLibre?.trim() || "Sans destination", volume: 0, objets: 0, speciale: null, transporte: true });
    const l = lignes.get(cle)!;
    l.volume += o.quantite * o.volume;
    l.objets += o.quantite;
  }
  return [...lignes.values()]
    .map((l) => ({ ...l, volume: Math.round(l.volume * 100) / 100 }))
    .filter((l) => l.objets > 0 || (toutes && l.id != null));
}
