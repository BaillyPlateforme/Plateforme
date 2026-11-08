import { COLONNES, type Statut } from "@/crm/kanban/regles";
import type { Carte } from "@/crm/kanban/donnees";
import type { CarteDemande } from "./demandes-commun";

/*
 * Les filtres du Parcours, communs aux colonnes et à la liste : recherche,
 * type de client, commercial, étape. Ils vivent dans l'adresse (?q=, ?type=,
 * ?commercial=, ?etape=) : un lien partagé ou un rechargement les garde, et
 * les anciennes adresses (/kanban, /dossiers, /commandes) y mènent.
 *
 * Module pur : la page le lit côté serveur, le tableau côté navigateur.
 */

/**
 * Les vues du Parcours, au menu de gauche : le tableau (« colonnes » dans
 * l'adresse : la vue par défaut, /parcours) et la liste. Les anciennes vues
 * de son « Analyse des demandes » (VUES_ANALYSE) mènent à Demandes.
 */
export type Vue = "colonnes" | "liste";
export const VUES_ANALYSE = ["demandes", "rappels", "statistiques", "leads"] as const;
export type VueAnalyse = (typeof VUES_ANALYSE)[number];
export const estVueAnalyse = (v: unknown): v is VueAnalyse => VUES_ANALYSE.includes(v as VueAnalyse);
export type Filtres = { q: string; type: string | null; commercial: number | null; etape: string | null };

export const FILTRES_VIDES: Filtres = { q: "", type: null, commercial: null, etape: null };

/** L'ordre des étapes, pour trier la liste : la demande du site d'abord, « Perdu » en dernier. */
export const RANG_ETAPE: Record<string, number> = { demande: 0, prospect: 1, visite: 2, devis: 3, commande: 4, planifie: 5, termine: 6, perdu: 7 };

/**
 * Les étapes du filtre : les colonnes du Parcours, et « Commandes » (l'ancienne
 * page du même nom : devis signés, avec ou sans date).
 */
export const ETAPES_FILTRE: { cle: string; label: string; statuts: Statut[] }[] = [
  { cle: "demandes", label: "Demandes", statuts: [] },
  { cle: "prospect", label: "Nouveau", statuts: ["prospect"] },
  { cle: "visite", label: "Visite à faire", statuts: ["visite"] },
  { cle: "devis", label: "Devis envoyé", statuts: ["devis"] },
  // Le libellé le plus long fixe la largeur du choix dans la bande : le mot de l'ancien menu, sans plus.
  { cle: "commande", label: "Commandes", statuts: ["commande", "planifie"] },
  { cle: "signe", label: "Signé", statuts: ["commande"] },
  { cle: "planifie", label: "Planifié", statuts: ["planifie"] },
  { cle: "termine", label: "Terminé", statuts: ["termine"] },
  { cle: "perdu", label: "Perdu", statuts: ["perdu"] },
];

export const estEtape = (v: string | null | undefined): v is string => !!v && ETAPES_FILTRE.some((e) => e.cle === v);

/** Les colonnes (statuts) d'une étape choisie ; toutes sans filtre. */
export function statutsDe(etape: string | null): Statut[] {
  if (!etape) return [...COLONNES];
  return ETAPES_FILTRE.find((e) => e.cle === etape)?.statuts ?? [...COLONNES];
}
/** Les demandes du site se montrent sans filtre d'étape, ou avec « Demandes ». */
export const avecDemandes = (etape: string | null) => !etape || etape === "demandes";

export const normaliser = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const chiffres = (t: string | null | undefined) => (t ?? "").replace(/[^0-9]/g, "");

/** La recherche : nom, société, référence, villes, e-mail ; le téléphone sur ses chiffres (« 06 12… » comme « 0612… »). */
function repond(q: string, champs: (string | null | undefined)[], telephone: string | null | undefined) {
  const t = normaliser(q.trim());
  if (!t) return true;
  if (normaliser(champs.filter(Boolean).join(" ")).includes(t)) return true;
  const c = chiffres(q);
  return c.length >= 4 && chiffres(telephone).includes(c);
}

export function garderDossier(c: Carte, f: Filtres, statuts: Statut[]) {
  return (
    statuts.includes(c.statut) &&
    (!f.type || c.segment === f.type) &&
    (!f.commercial || c.commercialId === f.commercial) &&
    repond(f.q, [c.client, c.ref, c.depart, c.arrivee, c.email], c.telephone)
  );
}

/**
 * Une demande du site n'a ni commercial ni type de client au CRM : un filtre de
 * commercial l'écarte ; un filtre de type ne garde que les particuliers, la
 * seule porte du site qui porte le même nom.
 */
export function garderDemande(d: CarteDemande, f: Filtres) {
  return (
    avecDemandes(f.etape) &&
    !f.commercial &&
    (!f.type || (f.type === "particulier" && d.parcours === "particulier")) &&
    repond(f.q, [d.client, d.societe, d.depart, d.arrivee, d.email], d.telephone)
  );
}

/** Les filtres d'une adresse (paramètres déjà lus). */
export function lireFiltres(sp: { q?: string; type?: string; commercial?: string; etape?: string }, types: string[], commerciaux: number[]): Filtres {
  const commercial = Number(sp.commercial);
  return {
    q: (sp.q ?? "").slice(0, 80),
    type: sp.type && types.includes(sp.type) ? sp.type : null,
    commercial: commerciaux.includes(commercial) ? commercial : null,
    etape: estEtape(sp.etape) ? sp.etape : null,
  };
}

/** L'adresse du Parcours pour une vue et des filtres. */
export function adresse(vue: Vue, f: Filtres) {
  const p = new URLSearchParams();
  if (vue !== "colonnes") p.set("vue", vue);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.type) p.set("type", f.type);
  if (f.commercial) p.set("commercial", String(f.commercial));
  if (f.etape) p.set("etape", f.etape);
  return `/parcours${p.size ? `?${p}` : ""}`;
}
