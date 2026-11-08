import { ETATS_RELANCE, TEINTES } from "@/crm/kanban/etapes";
import { TYPES } from "@/crm/lib/format";

/*
 * Les règles des relances, sans rien du serveur : ce que relance chaque type,
 * par rapport à quoi se compte son premier délai, ses cartes dans « Courriers
 * et SMS », et la validation d'une règle. Partagé par le moteur, les actions
 * et les écrans de la section Relances (configuration, simulation, Kanban).
 *
 * Rien ici n'est un texte de message : les textes vivent dans « Courriers et
 * SMS » (crm.modeles_messages), une carte par type et par canal.
 */

export type TypeRelance = "devis" | "pieces" | "conditions" | "solde" | "avis";
export type Canal = "email" | "sms";
export type Colonne = "avenir" | "aujourdhui" | "retard" | "envoyee" | "desactivee";

export const CANAUX: { cle: Canal; libelle: string }[] = [
  { cle: "email", libelle: "E-mail" },
  { cle: "sms", libelle: "SMS" },
];
export const libelleCanal = (c: string) => (c === "sms" ? "SMS" : "E-mail");

/** Un repère : la date d'où se compte le premier délai. */
export interface Repere {
  cle: string;
  /** « après l'envoi du devis » : se lit après « 2 jours ». */
  libelle: string;
  sens: "apres" | "avant";
  /** D'où vient la date, en clair. */
  detail: string;
}

export interface DefRelance {
  type: TypeRelance;
  libelle: string;
  /** Ce qu'on relance, en une phrase (écran de configuration). */
  objet: string;
  /** Ce qui arrête la suite d'elle-même, d'après le moteur. */
  arret: string;
  /** Les cartes de « Courriers et SMS », par canal. */
  cartes: Record<Canal, string>;
  /** Les repères possibles ; le premier est celui par défaut (celui d'avant la section Relances). */
  reperes: Repere[];
  /** Aucune relance au-delà de cette date (le déménagement, pour ce qu'il faut avant lui). */
  borne?: string;
  defaut: { premier_delai_jours: number; intervalle_jours: number; nombre_max: number };
  /** La couleur du type dans les graphiques : palette vérifiée (daltonisme), ordre fixe. */
  couleur: string;
}

const DEMENAGEMENT_EC: Repere = { cle: "demenagement", libelle: "avant le déménagement", sens: "avant", detail: "Le début de la période de déménagement, dans l'espace client." };
const COMMANDE_EC: Repere = { cle: "commande", libelle: "après le passage en commande", sens: "apres", detail: "Le passage en commande du dossier (devis signé), dans l'espace client." };
const OUVERTURE_EC: Repere = { cle: "ouverture_espace", libelle: "après l'ouverture de l'espace client", sens: "apres", detail: "La création de l'espace client du dossier." };

/*
 * Les délais par défaut sont PROVISOIRES, à régler avec Bailly depuis l'écran
 * de configuration : la relance de devis reprend le seuil de la cloche (devis
 * envoyé depuis plus de deux jours), pièces et conditions celui des alertes
 * de l'espace client (étape bloquante à trois semaines du déménagement).
 */
export const RELANCES: DefRelance[] = [
  {
    type: "devis", libelle: "Relance de devis", couleur: "#4b2fe0",
    objet: "Un devis envoyé que le client n'a pas encore signé.",
    arret: "Le devis est signé, ou le dossier est perdu ou terminé.",
    cartes: { email: "devis_relance", sms: "devis_relance_sms" },
    reperes: [
      { cle: "envoi_devis", libelle: "après l'envoi du devis", sens: "apres", detail: "Le dernier envoi d'un devis du dossier." },
      { cle: "demenagement", libelle: "avant la date de chargement", sens: "avant", detail: "La date de chargement du dossier, quand elle est connue." },
    ],
    defaut: { premier_delai_jours: 2, intervalle_jours: 5, nombre_max: 2 },
  },
  {
    type: "pieces", libelle: "Pièces manquantes", couleur: "#0ea5e9",
    objet: "Les pièces obligatoires que le client n'a pas encore déposées dans son espace.",
    arret: "Toutes les pièces sont reçues, le dossier est perdu ou terminé, ou le déménagement est passé.",
    cartes: { email: "relance_pieces", sms: "relance_pieces_sms" },
    reperes: [DEMENAGEMENT_EC, COMMANDE_EC, OUVERTURE_EC], borne: "demenagement",
    defaut: { premier_delai_jours: 21, intervalle_jours: 7, nombre_max: 2 },
  },
  {
    type: "conditions", libelle: "Conditions de livraison", couleur: "#c026d3",
    objet: "Les conditions de livraison que le client n'a pas encore validées.",
    arret: "Les conditions sont validées, le dossier est perdu ou terminé, ou le déménagement est passé.",
    cartes: { email: "relance_conditions", sms: "relance_conditions_sms" },
    reperes: [DEMENAGEMENT_EC, COMMANDE_EC, OUVERTURE_EC], borne: "demenagement",
    defaut: { premier_delai_jours: 21, intervalle_jours: 7, nombre_max: 2 },
  },
  {
    type: "solde", libelle: "Solde à régler", couleur: "#0f9488",
    objet: "Une facture du CRM qui n'est pas réglée.",
    arret: "La facture est réglée, ou le dossier est perdu.",
    cartes: { email: "relance_solde", sms: "relance_solde_sms" },
    reperes: [
      { cle: "facture", libelle: "après l'émission de la facture", sens: "apres", detail: "La date d'émission de la facture." },
      { cle: "livraison", libelle: "après la livraison", sens: "apres", detail: "La date de livraison du dossier, quand elle est connue." },
    ],
    defaut: { premier_delai_jours: 7, intervalle_jours: 7, nombre_max: 3 },
  },
  {
    type: "avis", libelle: "Relance de l'avis", couleur: "#7a52ff",
    objet: "La demande d'avis partie à la fin du chantier.",
    arret: "Le nombre de relances est atteint : la plateforme ne sait pas si l'avis a été déposé.",
    cartes: { email: "relance_avis", sms: "relance_avis_sms" },
    reperes: [
      { cle: "demande_avis", libelle: "après la demande d'avis", sens: "apres", detail: "Le départ de la demande d'avis, dans l'espace client." },
      { cle: "fin_chantier", libelle: "après la fin de chantier", sens: "apres", detail: "La fin de chantier signée dans l'espace client." },
    ],
    defaut: { premier_delai_jours: 7, intervalle_jours: 7, nombre_max: 1 },
  },
];
export const defRelance = (t: string) => RELANCES.find((r) => r.type === t) ?? null;

/** Les colonnes du Kanban, avec leur couleur d'état (les mêmes sur le tableau de bord) : la définition commune à tous les tableaux (src/crm/kanban/etapes.ts). */
export const COLONNES: { cle: Colonne; titre: string; couleur: string; vide: string }[] = ETATS_RELANCE.map((e) => ({ cle: e.cle, titre: e.label, couleur: TEINTES[e.teinte], vide: e.vide }));

/** Les segments de client qu'une règle peut écarter (crm.clients.type). */
export const SEGMENTS = Object.entries(TYPES).map(([cle, libelle]) => ({ cle, libelle }));

/** Les jours de la semaine, numérotés comme l'ISO : 1 = lundi … 7 = dimanche. */
export const JOURS = [
  { n: 1, court: "L", libelle: "lundi" },
  { n: 2, court: "M", libelle: "mardi" },
  { n: 3, court: "M", libelle: "mercredi" },
  { n: 4, court: "J", libelle: "jeudi" },
  { n: 5, court: "V", libelle: "vendredi" },
  { n: 6, court: "S", libelle: "samedi" },
  { n: 7, court: "D", libelle: "dimanche" },
];

/** Ce qui se règle d'une règle. Les jours et les heures n'ont pas de valeur imposée : null = sans restriction. */
export interface ReglageRegle {
  actif: boolean;
  premier_delai_jours: number;
  intervalle_jours: number;
  nombre_max: number;
  repere: string;
  canaux: Canal[];
  /** Les jours où l'envoi automatique est permis (1 = lundi … 7 = dimanche) ; null = tous. */
  jours_envoi: number[] | null;
  /** La plage horaire de l'envoi automatique, heure de Paris : [début, fin[ ; null = sans borne. */
  heure_debut: number | null;
  heure_fin: number | null;
  segments_exclus: string[];
}

export interface Regle extends ReglageRegle {
  type: TypeRelance;
  maj_le: string | null;
  maj_par: string | null;
}

/** Vérifie et normalise une règle venue de l'écran. */
export function validerRegle(type: string, r: Partial<ReglageRegle>): { ok: true; regle: ReglageRegle } | { ok: false; erreur: string } {
  const def = defRelance(type);
  if (!def) return { ok: false, erreur: "Type de relance inconnu." };
  const entier = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
  if (!entier(r.premier_delai_jours, 0, 120)) return { ok: false, erreur: "Le premier délai va de 0 à 120 jours." };
  if (!entier(r.intervalle_jours, 1, 60)) return { ok: false, erreur: "L'intervalle va de 1 à 60 jours." };
  if (!entier(r.nombre_max, 1, 6)) return { ok: false, erreur: "De 1 à 6 relances au plus." };
  const repere = def.reperes.find((x) => x.cle === r.repere) ?? null;
  if (!repere) return { ok: false, erreur: "Repère du premier délai inconnu." };
  const canaux = CANAUX.map((c) => c.cle).filter((c) => r.canaux?.includes(c));
  if (!canaux.length) return { ok: false, erreur: "Choisissez au moins un canal." };
  let jours: number[] | null = null;
  if (r.jours_envoi != null) {
    const j = [...new Set(r.jours_envoi)].filter((n) => entier(n, 1, 7)).sort((a, b) => a - b);
    if (!j.length) return { ok: false, erreur: "Choisissez au moins un jour d'envoi." };
    jours = j.length === 7 ? null : j;
  }
  const debut = r.heure_debut ?? null;
  const fin = r.heure_fin ?? null;
  if (debut != null && !entier(debut, 0, 23)) return { ok: false, erreur: "Heure de début invalide." };
  if (fin != null && !entier(fin, 1, 24)) return { ok: false, erreur: "Heure de fin invalide." };
  if (debut != null && fin != null && debut >= fin) return { ok: false, erreur: "L'heure de début doit précéder l'heure de fin." };
  const segments = SEGMENTS.map((s) => s.cle).filter((s) => r.segments_exclus?.includes(s));
  if (segments.length === SEGMENTS.length) return { ok: false, erreur: "Tous les segments sont exclus : désactivez plutôt la règle." };
  return {
    ok: true,
    regle: {
      actif: !!r.actif, premier_delai_jours: r.premier_delai_jours!, intervalle_jours: r.intervalle_jours!, nombre_max: r.nombre_max!,
      repere: repere.cle, canaux, jours_envoi: jours, heure_debut: debut, heure_fin: fin, segments_exclus: segments,
    },
  };
}

export const repereDe = (def: DefRelance, cle: string | null | undefined) => def.reperes.find((r) => r.cle === cle) ?? def.reperes[0];

/** « 2 j après l'envoi du devis, puis tous les 5 j (2 au plus) ». */
export function delaiEnClair(def: DefRelance, r: Pick<ReglageRegle, "premier_delai_jours" | "intervalle_jours" | "nombre_max" | "repere">) {
  const p = repereDe(def, r.repere);
  return `${r.premier_delai_jours} j ${p.libelle}${r.nombre_max > 1 ? `, puis tous les ${r.intervalle_jours} j (${r.nombre_max} au plus)` : ""}`;
}

/** « lun. → ven. · 9 h – 18 h », ou « Tous les jours, à toute heure ». */
export function creneauEnClair(r: Pick<ReglageRegle, "jours_envoi" | "heure_debut" | "heure_fin">) {
  const jours = !r.jours_envoi?.length
    ? "Tous les jours"
    : r.jours_envoi.length === 6 && !r.jours_envoi.includes(7)
      ? "Sauf le dimanche"
      : r.jours_envoi.map((n) => JOURS[n - 1].libelle.slice(0, 3)).join(", ");
  const heures = r.heure_debut == null && r.heure_fin == null ? "à toute heure" : `de ${r.heure_debut ?? 0} h à ${r.heure_fin ?? 24} h`;
  return `${jours}, ${heures}`;
}

// --- Les dates (AAAA-MM-JJ, à midi UTC pour ne jamais changer de jour) ---------------------------

export const plus = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5);
/** Le jour ISO de la semaine : 1 = lundi … 7 = dimanche. */
export const jourIso = (jour: string) => ((new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
/** Le premier jour d'envoi permis à partir de ce jour (lui compris). */
export function jourPermis(jour: string, jours: number[] | null) {
  if (!jours?.length) return jour;
  for (let i = 0; i < 7; i++) {
    const d = plus(jour, i);
    if (jours.includes(jourIso(d))) return d;
  }
  return jour;
}
/** L'envoi automatique est-il permis ce jour-là, à cette heure (Paris) ? */
export const creneauOuvert = (r: Pick<ReglageRegle, "jours_envoi" | "heure_debut" | "heure_fin">, jour: string, heure: number) =>
  (!r.jours_envoi?.length || r.jours_envoi.includes(jourIso(jour))) && heure >= (r.heure_debut ?? 0) && heure < (r.heure_fin ?? 24);

/**
 * L'heure de passage de la tâche de la veille : le service cron de Railway la
 * lance à 16 h UTC (scripts/tache-veille.mjs), 17 h à Paris en hiver, 18 h en
 * été. Sert à prévenir quand une plage horaire l'exclut.
 */
export const HEURE_VEILLE_UTC = 16;
export function heureVeilleParis(jour: string) {
  return heureParis(new Date(`${jour}T${String(HEURE_VEILLE_UTC).padStart(2, "0")}:00:00Z`));
}

/** L'heure qu'il est à Paris (0 à 23). Par les parties de la date : en français, l'heure s'écrit « 17 h ». */
export function heureParis(d = new Date()) {
  const h = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(d).find((p) => p.type === "hour");
  return Number(h?.value ?? 0);
}

/** Une relance du Kanban, telle que le moteur la range. */
export interface Relance {
  cle: string;
  type: TypeRelance;
  libelle: string;
  dossierId: number;
  ref: string;
  client: string;
  segment: string;
  /** Ce qu'on relance, en clair : « Devis DV-2026-0012 envoyé le 3 nov. ». */
  objet: string;
  rang: number;
  sur: number;
  /** AAAA-MM-JJ. */
  prevue: string;
  colonne: Colonne;
  /** Pourquoi elle est désactivée, ou ce qui en est. */
  motif: string | null;
  envoyeeLe: string | null;
  envoiStatut: string | null;
  /** Les canaux par où elle partira (ceux dont la carte est prête), ou par où elle est partie. */
  canaux: Canal[];
  reportee: boolean;
  /** Les variables propres à la relance (le montant d'un solde…). */
  vars: Record<string, string>;
}

/** Les statuts du journal des envois, en clair, et leur famille sur les graphiques. */
export const STATUT_ENVOI: Record<string, { libelle: string; famille: "reussi" | "garde_fou" | "echec" | "en_cours" }> = {
  envoye: { libelle: "Envoyée", famille: "reussi" },
  journalise: { libelle: "Journalisée (envoi désactivé)", famille: "garde_fou" },
  bloque: { libelle: "Bloquée (recette)", famille: "garde_fou" },
  fictif: { libelle: "Destinataire fictif", famille: "garde_fou" },
  bac_a_sable: { libelle: "Bac à sable", famille: "garde_fou" },
  echec: { libelle: "En échec", famille: "echec" },
  incertain: { libelle: "Issue incertaine", famille: "echec" },
  en_cours: { libelle: "En cours", famille: "en_cours" },
};
export const FAMILLES = [
  { cle: "reussi", libelle: "Réussis", couleur: "#14c27d" },
  { cle: "garde_fou", libelle: "Retenus par les garde-fous", couleur: "#f59e0b" },
  { cle: "echec", libelle: "En échec", couleur: "#e1306c" },
] as const;
export const familleDe = (statut: string | null | undefined) => STATUT_ENVOI[statut ?? ""]?.famille ?? "echec";
