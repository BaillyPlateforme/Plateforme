/*
 * Les étapes du CRM, une seule fois pour tous les tableaux (demande de David,
 * 08/11/2026 : « assure-toi que tous les kanbans sont cohérents et reliés »).
 * Leurs noms et leurs couleurs viennent d'ici, et de nulle part ailleurs :
 *
 *  - Demandes › Kanban : les étapes détaillées d'une demande du site
 *    (ETAPES_DEMANDE ; la règle qui range une demande est dans
 *    src/crm/demandes/etapes.ts) ;
 *  - Parcours › Tableau et Liste, la pastille d'un dossier, le filtre
 *    d'étape : les étapes d'un dossier (ETAPES_DOSSIER) ;
 *  - la carte du parcours d'un dossier et sa bande « Prochaine étape »
 *    (src/crm/parcours) : les huit grandes étapes (GROUPES_PARCOURS) et la
 *    colonne où le dossier se trouve ;
 *  - Relances › Kanban : les états d'une relance (ETATS_RELANCE).
 *
 * Les deux tableaux se répondent par deux colonnes-ponts, deux vues d'une
 * même vérité : la dernière colonne de Demandes, « Dossier » (les demandes
 * acceptées), et la première du Parcours, « Demandes » (celles qui attendent
 * qu'on les accepte ou qu'on les refuse, comptées par `aDecider`). Accepter
 * une demande, d'un tableau ou de l'autre, crée son dossier en « Nouveau » :
 * elle quitte « Demandes » et entre dans « Dossier ».
 *
 * Une couleur dit la même chose sur tous les tableaux :
 *   lilas, violet      la demande, l'équipe l'étudie ;
 *   indigo             le dossier (son entrée au CRM) ;
 *   ciel               un devis est parti au client ;
 *   ambre              le client attend l'équipe (rappel) ;
 *   vert               le client a dit oui (devis accepté, signé) ;
 *   indigo profond     planifié ; encre : terminé ;
 *   rose               perdu ; gris : incomplet ou archivé.
 *
 * Module pur : le serveur et le navigateur le lisent.
 */

/** Les couleurs des étapes : la palette du CRM (indigo, violet, vert, ambre, ciel) et ses neutres. */
export const TEINTES = {
  lilas: "#a78bfa",
  violet: "#7a52ff",
  violetFonce: "#6236e6",
  indigo: "#4b2fe0",
  profond: "#2e1f9e",
  ciel: "#0ea5e9",
  ambre: "#f59e0b",
  vert: "#14c27d",
  encre: "#14121f",
  rose: "#e1306c",
  gris: "#a7a3b8",
  ardoise: "#6f6c80",
} as const;
export type Teinte = keyof typeof TEINTES;

/** Une étape d'un tableau : son nom, ce qu'elle veut dire, sa couleur. */
export type DefEtape<C extends string = string> = { cle: C; label: string; aide: string; teinte: Teinte };

/* ───────── Les étapes d'une demande du site (Demandes › Kanban) ───────── */

export type CleEtapeDemande = "incomplete" | "nouvelle" | "analyse" | "qualifiee" | "devis" | "rappel" | "accepte" | "dossier" | "perdue" | "archivee";

export const ETAPES_DEMANDE: DefEtape<CleEtapeDemande>[] = [
  { cle: "incomplete", label: "Incomplète", aide: "Il manque le volume ou une ville, ou le client n'a pas fini de la compléter", teinte: "gris" },
  { cle: "nouvelle", label: "Nouvelle", aide: "Complète, pas encore évaluée", teinte: "lilas" },
  { cle: "analyse", label: "En analyse", aide: "L'équipe l'étudie", teinte: "violet" },
  { cle: "qualifiee", label: "Qualifiée", aide: "Évaluée : potentiel, difficulté, estimation", teinte: "violetFonce" },
  { cle: "devis", label: "Devis du site envoyé", aide: "Le devis de la demande est parti au client", teinte: "ciel" },
  { cle: "rappel", label: "Rappel demandé", aide: "Le client attend qu'on le rappelle", teinte: "ambre" },
  { cle: "accepte", label: "Devis du site accepté", aide: "Le client a accepté le devis de la demande", teinte: "vert" },
  // Le pont vers le Parcours : la couleur de sa première étape, « Nouveau ».
  { cle: "dossier", label: "Dossier", aide: "Acceptée : elle suit son dossier, dans le Parcours", teinte: "indigo" },
  { cle: "perdue", label: "Perdue", aide: "Refusée, ou perdue", teinte: "rose" },
  { cle: "archivee", label: "Archivée", aide: "Sortie du parcours sans être perdue", teinte: "ardoise" },
];
export const ETAPE_DEMANDE = Object.fromEntries(ETAPES_DEMANDE.map((e) => [e.cle, e])) as Record<CleEtapeDemande, DefEtape<CleEtapeDemande>>;

/* ───────── Les étapes d'un dossier (Parcours › Tableau, Liste, fiche) ───────── */

export const STATUTS_DOSSIER = ["prospect", "visite", "devis", "commande", "planifie", "termine", "perdu"] as const;
export type StatutDossier = (typeof STATUTS_DOSSIER)[number];

export type DefEtapeDossier = DefEtape<StatutDossier> & {
  /** La classe des pastilles des tableaux en HTML simple (crm.css, `.st`). */
  ton: "i" | "w" | "g" | "p" | "r";
  /** Les relances qui peuvent toucher un dossier à cette étape (src/crm/relances/regles.ts). */
  relances: ("devis" | "pieces" | "conditions" | "solde" | "avis")[];
};

export const ETAPES_DOSSIER: DefEtapeDossier[] = [
  { cle: "prospect", label: "Nouveau", aide: "Le dossier vient d'entrer au CRM", teinte: "indigo", ton: "i", relances: [] },
  { cle: "visite", label: "Visite à faire", aide: "La visite technique est à planifier ou à faire", teinte: "violet", ton: "i", relances: [] },
  { cle: "devis", label: "Devis envoyé", aide: "Le client a reçu ses devis, il n'a pas encore signé", teinte: "ciel", ton: "w", relances: ["devis"] },
  { cle: "commande", label: "Signé", aide: "Devis signé : arrhes, pièces, dates", teinte: "vert", ton: "g", relances: ["pieces", "conditions"] },
  { cle: "planifie", label: "Planifié", aide: "Les dates sont fixées", teinte: "profond", ton: "p", relances: ["pieces", "conditions", "solde"] },
  { cle: "termine", label: "Terminé", aide: "Déménagement fait, facturé", teinte: "encre", ton: "g", relances: ["solde", "avis"] },
  { cle: "perdu", label: "Perdu", aide: "Le client n'a pas donné suite", teinte: "rose", ton: "r", relances: [] },
];
export const ETAPE_DOSSIER = Object.fromEntries(ETAPES_DOSSIER.map((e) => [e.cle, e])) as Record<StatutDossier, DefEtapeDossier>;
export const estStatutDossier = (s: string): s is StatutDossier => (STATUTS_DOSSIER as readonly string[]).includes(s);
/** L'étape d'un dossier ; un statut inconnu se lit « Nouveau ». */
export const etapeDossier = (statut: string): DefEtapeDossier => ETAPE_DOSSIER[estStatutDossier(statut) ? statut : "prospect"];

/** Le pont du Parcours vers Demandes : sa première colonne, les demandes à accepter ou refuser. */
export const PONT_DEMANDES: DefEtape<"demandes"> = {
  cle: "demandes",
  label: "Demandes",
  aide: "Les demandes du site à accepter ou refuser",
  // La couleur des demandes neuves, dans Demandes.
  teinte: "lilas",
};

/* ───────── Les huit grandes étapes du parcours d'un dossier (sa carte, sur sa page) ───────── */

export const GROUPES_PARCOURS: { label: string; teinte: Teinte }[] = [
  { label: "Demande", teinte: "lilas" },
  { label: "Visite", teinte: "violet" },
  { label: "Devis signé", teinte: "ciel" },
  { label: "Commande", teinte: "vert" },
  { label: "Planification", teinte: "profond" },
  { label: "Déménagement", teinte: "profond" },
  { label: "Facture payée", teinte: "encre" },
  { label: "SAV et avis", teinte: "encre" },
];

/* ───────── Les états d'une relance (Relances › Kanban) ───────── */

export type EtatRelance = "avenir" | "aujourdhui" | "retard" | "envoyee" | "desactivee";
export const ETATS_RELANCE: (DefEtape<EtatRelance> & { vide: string })[] = [
  { cle: "avenir", label: "À venir", aide: "Prévues, pas encore dues", teinte: "indigo", vide: "Rien de prévu." },
  { cle: "aujourdhui", label: "Aujourd'hui", aide: "Dues aujourd'hui", teinte: "violet", vide: "Aucune relance aujourd'hui." },
  { cle: "retard", label: "En retard", aide: "Dues, pas encore parties", teinte: "rose", vide: "Aucun retard." },
  { cle: "envoyee", label: "Envoyées", aide: "Parties au client", teinte: "vert", vide: "Aucune relance envoyée." },
  { cle: "desactivee", label: "Désactivées", aide: "Rien ne les fera partir", teinte: "gris", vide: "Aucune." },
];

/* ───────── La règle commune aux deux ponts ───────── */

/**
 * Une demande qui attend qu'on la décide : ni acceptée (pas de dossier), ni
 * perdue, ni archivée. La colonne « Demandes » du Parcours et les colonnes
 * ouvertes du Kanban de Demandes se comptent avec cette seule règle.
 */
export const aDecider = (d: { statut: string; dossier: unknown }) => !d.dossier && d.statut !== "lost" && d.statut !== "archived";

/** La couleur d'une teinte. */
export const couleur = (t: Teinte) => TEINTES[t];
