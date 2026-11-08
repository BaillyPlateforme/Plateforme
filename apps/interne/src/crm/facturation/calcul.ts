/*
 * Les calculs de la facturation, sans base ni serveur : la fenêtre de
 * facture les fait à l'écran pendant la saisie, l'action serveur les refait
 * avant d'enregistrer (elle ne reçoit jamais un total du navigateur).
 *
 * La règle des totaux est celle de la norme EN 16931 (facture électronique) :
 * chaque ligne a son montant HT (quantité × prix unitaire HT, arrondi au
 * centime) ; la TVA se calcule par taux, sur la somme des HT de ce taux ; le
 * TTC est la somme des HT et des TVA. La TVA d'une ligne n'est qu'indicative.
 */

/**
 * Le taux de TVA proposé par défaut : 20 %. Ce n'est pas un choix de la
 * facturation : c'est le taux que le CRM applique déjà au devis (le HT y est
 * « le TTC moins 20 % », voir la page du devis et l'ancienne facture). Il se
 * règle dans Paramètres (Facturation) et se change ligne par ligne.
 */
export const TVA_DEFAUT_CODE = 20;

export type GenreFacture = "facture" | "solde" | "acompte" | "avoir";
export type GenreLigne = "prestation" | "texte" | "deduction";

export interface LigneSaisie {
  genre: GenreLigne;
  libelle: string;
  detail?: string | null;
  quantite: number;
  unite?: string | null;
  prixUnitaireHt: number;
  tauxTva: number;
  /** Une déduction d'acompte : la facture d'arrhes qu'elle reprend. */
  factureDeduiteId?: number | null;
}

export interface LigneCalculee extends LigneSaisie {
  ht: number;
  tva: number;
  ttc: number;
}

export const arrondi = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fini = (n: unknown, repli = 0) => (typeof n === "number" && Number.isFinite(n) ? n : repli);

/** Le HT d'un prix TTC, au taux donné, arrondi au centime. */
export const htDepuisTtc = (ttc: number, taux: number) => arrondi(ttc / (1 + taux / 100));

export function calculerLigne(l: LigneSaisie): LigneCalculee {
  if (l.genre === "texte") return { ...l, quantite: 0, prixUnitaireHt: 0, ht: 0, tva: 0, ttc: 0 };
  const q = fini(l.quantite, 1);
  const pu = fini(l.prixUnitaireHt);
  const taux = fini(l.tauxTva);
  const ht = arrondi(q * pu);
  const tva = arrondi((ht * taux) / 100);
  return { ...l, quantite: q, prixUnitaireHt: pu, tauxTva: taux, ht, tva, ttc: arrondi(ht + tva) };
}

export interface Totaux {
  lignes: LigneCalculee[];
  parTaux: { taux: number; base: number; tva: number }[];
  ht: number;
  tva: number;
  ttc: number;
}

export function totaux(lignes: LigneSaisie[]): Totaux {
  const calc = lignes.map(calculerLigne);
  const groupes = new Map<number, number>();
  for (const l of calc) if (l.genre !== "texte") groupes.set(l.tauxTva, arrondi((groupes.get(l.tauxTva) ?? 0) + l.ht));
  const parTaux = [...groupes.entries()].sort((a, b) => b[0] - a[0]).map(([taux, base]) => ({ taux, base, tva: arrondi((base * taux) / 100) }));
  const ht = arrondi(parTaux.reduce((a, g) => a + g.base, 0));
  const tva = arrondi(parTaux.reduce((a, g) => a + g.tva, 0));
  return { lignes: calc, parTaux, ht, tva, ttc: arrondi(ht + tva) };
}

/* ---------- libellés ---------- */

export const MODES: { cle: string; label: string; court: string }[] = [
  { cle: "cheque", label: "Chèque", court: "Chèque" },
  { cle: "virement", label: "Virement", court: "Virement" },
  { cle: "carte", label: "Carte bancaire", court: "Carte" },
  { cle: "carte_en_ligne", label: "Carte (en ligne)", court: "En ligne" },
  { cle: "especes", label: "Espèces", court: "Espèces" },
  { cle: "prelevement", label: "Prélèvement", court: "Prélèvement" },
  { cle: "autre", label: "Autre", court: "Autre" },
];
export const MODE: Record<string, string> = Object.fromEntries(MODES.map((m) => [m.cle, m.label]));
/** Les modes que l'équipe saisit : « carte (en ligne) » vient seulement de l'espace client. */
export const MODES_SAISIS = MODES.filter((m) => m.cle !== "carte_en_ligne");
export const libelleMode = (m: string | null | undefined) => (m ? MODE[m] ?? m : "Non précisé");

export const NATURE: Record<string, string> = { arrhes: "Arrhes", reglement: "Règlement", remboursement: "Remboursement" };

export const GENRE: Record<GenreFacture, string> = { facture: "Facture", solde: "Facture de solde", acompte: "Facture d'arrhes", avoir: "Avoir" };

export const ETAT: Record<string, { label: string; ton: "ok" | "attente" | "alerte" | "neutre" | "info" }> = {
  a_regler: { label: "À régler", ton: "attente" },
  partielle: { label: "Réglée en partie", ton: "info" },
  soldee: { label: "Soldée", ton: "ok" },
  annulee: { label: "Annulée", ton: "neutre" },
  avoir: { label: "Avoir", ton: "neutre" },
  retard: { label: "En retard", ton: "alerte" },
};

export const DATE_MODE: Record<string, string> = { jour: "Date du jour", chargement: "Date du chargement", livraison: "Date de la livraison", libre: "Date choisie" };

export const euros2 = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Une date « AAAA-MM-JJ » à partir d'une date de la base (lue à minuit UTC, voir lib/db.ts) ou d'une chaîne. */
export function jourIso(d: unknown): string | null {
  if (!d) return null;
  if (typeof d === "string") return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Aujourd'hui à Paris, « AAAA-MM-JJ ». */
export const aujourdhuiParis = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
