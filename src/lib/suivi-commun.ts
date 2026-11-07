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

/** Le tableau en CSV, pour Excel ou Google Sheets : point-virgule, BOM, montants en virgule. */
export function versCsv(leads: Lead[]): string {
  const cellule = (v: string | number | null | undefined) => {
    const t = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const statut = (s: StatutLead) => STATUTS.find((x) => x.key === s)?.label ?? s;
  const entetes = [
    "Date d'entrée", "Parcours", "Nom", "Téléphone", "E-mail", "Mutation", "Priorité",
    "Ville de départ", "Ville d'arrivée", "Société", "Statut", "CA en attente", "CA réalisé", "Note",
  ];
  const lignes = leads.map((l) =>
    [
      new Date(l.created_at).toLocaleDateString("fr-FR"),
      libelleDuLead(l),
      l.client_nom,
      l.client_tel,
      l.client_email,
      estMutation(l) ? "Oui" : "Non",
      estPrioritaire(l) ? "Oui" : "Non",
      l.depart_ville,
      l.arrivee_ville,
      l.societe ?? l.espace_nom,
      statut(l.suivi.statut),
      l.suivi.ca_attente,
      l.suivi.ca_realise,
      l.suivi.note,
    ]
      .map(cellule)
      .join(";"),
  );
  return "﻿" + [entetes.join(";"), ...lignes].join("\n");
}
