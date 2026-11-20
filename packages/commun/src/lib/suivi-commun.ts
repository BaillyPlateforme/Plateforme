/*
 * Le suivi des leads — ce que Margaux Solano tenait à la main dans un Google
 * Sheet (réunion du 29 octobre 2026).
 *
 * Chaque demande arrivée par le site y est déjà : la date, le nom, le
 * téléphone, l'e-mail, la mutation, les villes. Il ne reste à saisir que ce
 * que Créagidem, fermé, ne laisse pas exporter : où en est le devis, et le
 * chiffre d'affaires — en attente, puis réalisé. Ses indicateurs (leads,
 * mutations, Paris, devis en attente, chiffre d'affaires) se calculent ici.
 *
 * Ce module est partagé : la page le lit dans le navigateur, le serveur aussi.
 */

import { libelleParcours, parcoursDeLaDemande, type Parcours } from "@/lib/parcours";

export type StatutLead = "nouveau" | "devis" | "commande" | "perdu";

export const STATUTS: { key: StatutLead; label: string }[] = [
  { key: "nouveau", label: "Nouveau" },
  { key: "devis", label: "Devis en attente" },
  { key: "commande", label: "Commandé" },
  { key: "perdu", label: "Perdu" },
];

/** Ce que l'équipe saisit sur un lead. Le reste vient de la demande. */
export type Suivi = {
  statut: StatutLead;
  ca_attente: number | null;
  ca_realise: number | null;
  /** Saisie à la main : prime sur la priorité déduite des villes. */
  priorite: boolean | null;
  note: string | null;
  maj: string | null;
  par: string | null;
};

export const SUIVI_VIDE: Suivi = {
  statut: "nouveau",
  ca_attente: null,
  ca_realise: null,
  priorite: null,
  note: null,
  maj: null,
  par: null,
};

/** Une ligne du tableau : la demande, et son suivi. */
export type Lead = {
  id: string;
  created_at: string;
  client_nom: string | null;
  client_email: string | null;
  client_tel: string | null;
  depart_ville: string | null;
  depart_code_postal: string | null;
  arrivee_ville: string | null;
  arrivee_code_postal: string | null;
  volume_m3: number | null;
  estimation_prix: number | null;
  express: string | null;
  espace_nom: string | null;
  parcours: string | null;
  transfert: string | null;
  mutation: string | null;
  societe: string | null;
  suivi: Suivi;
};

export const parcoursDuLead = (l: Lead): Parcours => parcoursDeLaDemande(l);
export const libelleDuLead = (l: Lead) => libelleParcours(l);

/**
 * Le lead sans rien qui désigne le client, pour une agence de marketing
 * (compte « marketing », lib/marketing.ts) : ni nom, ni e-mail, ni téléphone,
 * ni société, ni espace pro, ni la note de l'équipe, ni son auteur. Restent la
 * date, le parcours, les villes, le volume, le statut et les montants. Le
 * parcours est figé avant d'effacer l'espace pro, qui en décide pour les
 * demandes d'avant les trois portes. À faire côté serveur : ce qui part au
 * navigateur ne doit jamais avoir porté les coordonnées.
 */
export function anonymiser(l: Lead): Lead {
  return {
    ...l,
    parcours: parcoursDuLead(l),
    client_nom: null,
    client_email: null,
    client_tel: null,
    societe: null,
    espace_nom: null,
    suivi: { ...l.suivi, note: null, par: null },
  };
}

/** Une mutation, au sens du tableau de Margaux : le parcours dédié, ou une demande d'avant qui s'en déclarait une. */
export const estMutation = (l: Lead) => parcoursDuLead(l) === "mutation";

const IDF = ["75", "77", "78", "91", "92", "93", "94", "95"];

function departement(cp: string | null, ville: string | null): string | null {
  const c = (cp ?? "").trim();
  if (/^\d{5}$/.test(c)) return c.slice(0, 2);
  // Sans code postal, Paris se reconnaît à son nom.
  return /^paris\b/i.test((ville ?? "").trim()) ? "75" : null;
}

/** La demande touche Paris — au départ ou à l'arrivée. */
export function toucheParis(l: Lead): boolean {
  return departement(l.depart_code_postal, l.depart_ville) === "75" || departement(l.arrivee_code_postal, l.arrivee_ville) === "75";
}

/**
 * Prioritaire : la saisie de l'équipe d'abord ; à défaut, une demande qui
 * part d'Île-de-France ou y arrive. Margaux : « type Paris-Paris : oui ;
 * Quimper-Strasbourg : non ».
 */
export function estPrioritaire(l: Lead): boolean {
  if (l.suivi.priorite != null) return l.suivi.priorite;
  const d = departement(l.depart_code_postal, l.depart_ville);
  const a = departement(l.arrivee_code_postal, l.arrivee_ville);
  return (d != null && IDF.includes(d)) || (a != null && IDF.includes(a));
}

export type Indicateurs = {
  leads: number;
  mutations: number;
  entreprises: number;
  paris: number;
  caParis: number;
  devisAttente: number;
  caAttente: number;
  commandes: number;
  caRealise: number;
  caHorsMutation: number;
};

export function indicateurs(leads: Lead[]): Indicateurs {
  const somme = (ls: Lead[], f: (l: Lead) => number | null) => ls.reduce((s, l) => s + (f(l) ?? 0), 0);
  const realise = (l: Lead) => (l.suivi.statut === "commande" ? l.suivi.ca_realise : null);
  const paris = leads.filter(toucheParis);
  const devis = leads.filter((l) => l.suivi.statut === "devis");
  return {
    leads: leads.length,
    mutations: leads.filter(estMutation).length,
    entreprises: leads.filter((l) => parcoursDuLead(l) === "entreprise").length,
    paris: paris.length,
    caParis: somme(paris, realise),
    devisAttente: devis.length,
    caAttente: somme(devis, (l) => l.suivi.ca_attente),
    commandes: leads.filter((l) => l.suivi.statut === "commande").length,
    caRealise: somme(leads, realise),
    caHorsMutation: somme(leads.filter((l) => !estMutation(l)), realise),
  };
}

/**
 * Le tableau en CSV, pour Excel ou Google Sheets : point-virgule, BOM, montants en virgule. `anonyme` : sans les
 * colonnes qui désignent le client (nom, téléphone, e-mail, société, note), pour une agence de marketing.
 */
export function versCsv(leads: Lead[], { anonyme = false }: { anonyme?: boolean } = {}): string {
  const cellule = (v: string | number | null | undefined) => {
    const brut = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
    // Un texte qui commence par = + - @ serait une formule pour Excel (=HYPERLINK(…) saisi dans le
    // formulaire public) : une apostrophe le garde en texte. Les nombres ne sont pas touchés.
    const t = typeof v === "string" && /^[=+\-@\t\r]/.test(brut) ? `'${brut}` : brut;
    // Un retour chariot seul coupe aussi la ligne pour Excel : sans guillemets, la suite (« =cmd… ») ouvrait une
    // nouvelle ligne et y redevenait une formule.
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const statut = (s: StatutLead) => STATUTS.find((x) => x.key === s)?.label ?? s;
  type Valeur = string | number | null | undefined;
  // [titre, valeur, désigne le client ?]
  const colonnes: [string, (l: Lead) => Valeur, boolean][] = [
    // Le jour de Paris : le serveur tourne en temps universel, une demande de 23 h 30 changeait de jour.
    ["Date d'entrée", (l) => new Date(l.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }), false],
    ["Parcours", (l) => libelleDuLead(l), false],
    ["Nom", (l) => l.client_nom, true],
    ["Téléphone", (l) => l.client_tel, true],
    ["E-mail", (l) => l.client_email, true],
    ["Mutation", (l) => (estMutation(l) ? "Oui" : "Non"), false],
    ["Priorité", (l) => (estPrioritaire(l) ? "Oui" : "Non"), false],
    ["Ville de départ", (l) => l.depart_ville, false],
    ["Ville d'arrivée", (l) => l.arrivee_ville, false],
    ["Société", (l) => l.societe ?? l.espace_nom, true],
    ["Statut", (l) => statut(l.suivi.statut), false],
    ["CA en attente", (l) => l.suivi.ca_attente, false],
    ["CA réalisé", (l) => l.suivi.ca_realise, false],
    ["Note", (l) => l.suivi.note, true],
  ];
  const gardees = colonnes.filter(([, , designe]) => !(anonyme && designe));
  const lignes = leads.map((l) => gardees.map(([, valeur]) => cellule(valeur(l))).join(";"));
  return "﻿" + [gardees.map(([titre]) => titre).join(";"), ...lignes].join("\n");
}
