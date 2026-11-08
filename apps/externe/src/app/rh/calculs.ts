/*
 * Les calculs de l'espace RH : purs, sans React, à partir des données lues
 * par le serveur et de son heure (`maintenant`) — jamais de l'horloge du
 * navigateur, pour que tout le monde compte les mêmes jours.
 */
import { ETAPE_RH, FORMULES_ORDRE, FORMULES_RH, moisDe, type CleEtapeRh, type FactureRh, type FormuleRh, type MobiliteRh } from "@/lib/rh-modele";

export const JOUR = 86_400_000;

/* ─────────────────────────── Formats ─────────────────────────── */

export const euro = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
/** 12,9 k€ / 1,2 M€ — pour les axes et les tuiles serrées. */
export function euroCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`;
  if (a >= 10_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return euro(n);
}
/** Une date AAAA-MM-JJ lue à midi : pas de décalage d'un jour selon le fuseau. */
export const versDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
export const jourCourt = (iso: string | null) => (iso ? versDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—");
export const jourLong = (iso: string | null) => (iso ? versDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");
export const jourMoyen = (iso: string | null) => (iso ? versDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const moisLong = (cle: string) => versDate(`${cle}-15`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
export const moisCourt = (cle: string) => versDate(`${cle}-15`).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
export const cleMois = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const debutDuJour = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Le nombre de jours entre aujourd'hui et une date (négatif : passée). */
export const joursAvant = (iso: string, maintenant: number) => Math.round((debutDuJour(versDate(iso).getTime()) - debutDuJour(maintenant)) / JOUR);
export function dansJours(n: number): string {
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  if (n === -1) return "hier";
  return n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`;
}

/** Quand a lieu une mobilité, en toutes lettres : la date, sinon le mois prévu, sinon la période saisie. */
export function quand(m: Pick<MobiliteRh, "date" | "mois" | "periode">): string {
  if (m.date) return jourMoyen(m.date);
  if (m.mois) return moisLong(m.mois).replace(/^./, (c) => c.toUpperCase());
  return m.periode ?? "Date à préciser";
}

export const formule = (f: FormuleRh | null) => (f ? FORMULES_RH[f] : "—");
export const trajet = (m: Pick<MobiliteRh, "depart" | "arrivee">) => `${m.depart ?? "?"} → ${m.arrivee ?? "?"}`;

/* ─────────────────────────── Ce qui compte ─────────────────────────── */

/** Une mobilité qui pèse sur le budget : tout sauf « Sans suite » et « Clôturée ». */
export const vivante = (m: MobiliteRh) => m.etape !== "sans_suite" && m.etape !== "cloturee";
export const enCours = (m: MobiliteRh) => ETAPE_RH[m.etape].ouverte;

export interface Budget {
  /** Engagé : estimations, devis envoyés et devis signés des mobilités vivantes. */
  engage: { ht: number; ttc: number; n: number };
  signe: { ht: number; ttc: number; n: number };
  /** En attente de signature : l'engagé moins le signé. */
  attente: { ht: number; ttc: number; n: number };
  facture: { ht: number; ttc: number; n: number; reste: number };
}

export function budget(mobilites: MobiliteRh[], factures: FactureRh[]): Budget {
  const somme = (l: MobiliteRh[]) => ({
    ht: l.reduce((s, m) => s + (m.montant?.ht ?? 0), 0),
    ttc: l.reduce((s, m) => s + (m.montant?.ttc ?? 0), 0),
    n: l.length,
  });
  const chiffrees = mobilites.filter((m) => vivante(m) && m.montant);
  const signees = chiffrees.filter((m) => m.montant!.nature === "signe");
  const enAttente = chiffrees.filter((m) => m.montant!.nature !== "signe");
  const valides = factures.filter((f) => f.statut !== "annulee");
  const signe = (f: FactureRh) => (f.genre === "avoir" ? -1 : 1);
  return {
    engage: somme(chiffrees),
    signe: somme(signees),
    attente: somme(enAttente),
    facture: {
      ht: valides.reduce((s, f) => s + signe(f) * Math.abs(f.ht ?? f.ttc / 1.2), 0),
      ttc: valides.reduce((s, f) => s + signe(f) * Math.abs(f.ttc), 0),
      n: valides.filter((f) => f.genre !== "avoir").length,
      reste: valides.reduce((s, f) => s + Math.max(0, f.reste ?? 0), 0),
    },
  };
}

/** Les mobilités en cours, étape par étape, dans l'ordre du parcours. */
export function parEtape(mobilites: MobiliteRh[]): { cle: CleEtapeRh; n: number }[] {
  return (Object.keys(ETAPE_RH) as CleEtapeRh[])
    .filter((c) => ETAPE_RH[c].ouverte)
    .map((cle) => ({ cle, n: mobilites.filter((m) => m.etape === cle).length }));
}

/** Les mois d'une fenêtre : `n` mois à partir de `debut` (AAAA-MM). */
export function moisDeLaFenetre(debut: string, n: number): string[] {
  const [a, m] = debut.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(a, m - 1 + i, 15);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export interface MoisBudget {
  cle: string;
  signe: number;
  attente: number;
  n: number;
}

/** Le budget HT de chaque mois, au mois du déménagement : signé d'un côté, en attente de signature de l'autre. */
export function budgetParMois(mobilites: MobiliteRh[], mois: string[]): { serie: MoisBudget[]; horsFenetre: number; sansDate: number } {
  const serie = mois.map((cle) => ({ cle, signe: 0, attente: 0, n: 0 }));
  const index = new Map(mois.map((c, i) => [c, i]));
  let horsFenetre = 0;
  let sansDate = 0;
  for (const m of mobilites) {
    if (!vivante(m) || !m.montant) continue;
    const cle = moisDe(m);
    if (!cle) {
      sansDate++;
      continue;
    }
    const i = index.get(cle);
    if (i == null) {
      horsFenetre++;
      continue;
    }
    if (m.montant.nature === "signe") serie[i].signe += m.montant.ht;
    else serie[i].attente += m.montant.ht;
    serie[i].n++;
  }
  return { serie, horsFenetre, sansDate };
}

export function budgetParFormule(mobilites: MobiliteRh[]): { cle: FormuleRh | "aucune"; label: string; ht: number; n: number }[] {
  const lignes = [...FORMULES_ORDRE, "aucune" as const].map((cle) => {
    const liste = mobilites.filter((m) => vivante(m) && m.montant && (m.formule ?? "aucune") === cle);
    return { cle, label: cle === "aucune" ? "Non précisée" : FORMULES_RH[cle], ht: liste.reduce((s, m) => s + m.montant!.ht, 0), n: liste.length };
  });
  return lignes.filter((l) => l.n > 0 || l.cle !== "aucune");
}

/* ─────────────────────────── Ce qui demande l'attention ─────────────────────────── */

export interface Alerte {
  id: string;
  ton: "info" | "attention" | "urgent";
  titre: string;
  texte: string;
  mobilite: string | null;
  /** Pour l'ordre : la plus proche d'abord. */
  rang: number;
}

/*
 * TEXTES À VALIDER — les alertes ne décident rien : elles disent ce que les
 * données disent (une date, un devis non signé, une échéance), sans règle
 * métier de Bailly inventée (pas de « relance », pas de délai imposé).
 */
export function alertes(mobilites: MobiliteRh[], factures: FactureRh[], maintenant: number): Alerte[] {
  const r: Alerte[] = [];
  for (const m of mobilites) {
    if (!enCours(m)) continue;
    if (m.date) {
      const j = joursAvant(m.date, maintenant);
      if (j >= 0 && j <= 7)
        r.push({
          id: `jour-${m.id}`,
          ton: "urgent",
          titre: `Déménagement ${dansJours(j)}`,
          texte: `${m.nom} · ${trajet(m)} · ${jourLong(m.date)}${m.date_fixee ? "" : " (date souhaitée)"}`,
          mobilite: m.id,
          rang: j,
        });
    }
    if (m.etape === "devis") {
      const envoi = [...m.chronologie].reverse().find((j) => j.libelle === "Devis envoyé" || j.libelle === "Devis transmis");
      const depuis = envoi ? -joursAvant(envoi.date, maintenant) : null;
      r.push({
        id: `devis-${m.id}`,
        ton: "attention",
        titre: "Devis en attente de signature",
        texte: `${m.nom} a reçu son devis${depuis != null && depuis > 0 ? ` il y a ${depuis} jour${depuis > 1 ? "s" : ""}` : ""} et ne l'a pas encore signé.`,
        mobilite: m.id,
        rang: 20,
      });
    }
    for (const j of m.chronologie) {
      if (!j.libelle.startsWith("Visite technique")) continue;
      const d = joursAvant(j.date, maintenant);
      if (d >= 0 && d <= 7)
        r.push({ id: `visite-${m.id}-${j.date}`, ton: "info", titre: `${j.libelle} ${dansJours(d)}`, texte: `${m.nom} · ${jourLong(j.date)}`, mobilite: m.id, rang: 10 + d });
    }
    const echeance = m.montant?.valide_jusqu;
    if (echeance && (m.etape === "estimee" || m.etape === "devis")) {
      const d = joursAvant(echeance, maintenant);
      if (d < 0)
        r.push({
          id: `validite-${m.id}`,
          ton: "info",
          titre: m.montant!.nature === "estimation" ? "Estimation arrivée à échéance" : "Devis arrivé à échéance",
          texte: `${m.nom} · valable jusqu'au ${jourLong(echeance)}`,
          mobilite: m.id,
          rang: 30,
        });
    }
  }
  for (const f of factures) {
    if (f.statut === "annulee" || f.genre === "avoir") continue;
    const retard = f.statut === "retard" || (f.echeance_le && joursAvant(f.echeance_le, maintenant) < 0 && (f.reste ?? 0) > 0);
    if (retard)
      r.push({
        id: `facture-${f.id}`,
        ton: "urgent",
        titre: "Facture en attente de règlement",
        texte: `${f.numero}${f.collaborateur ? ` · ${f.collaborateur}` : ""} · échéance ${jourLong(f.echeance_le)}`,
        mobilite: f.mobilite,
        rang: 5,
      });
  }
  return r.sort((a, b) => a.rang - b.rang);
}

/**
 * Les déménagements du mois — ceux déjà faits compris, pour que la liste
 * réponde au chiffre de la tuile —, puis les suivants.
 */
export function aVenir(mobilites: MobiliteRh[], maintenant: number) {
  const ceMois = cleMois(maintenant);
  const vivantes = mobilites.filter((m) => enCours(m) || m.etape === "termine");
  const ordre = (a: MobiliteRh, b: MobiliteRh) => (a.date ?? `${a.mois}-99`).localeCompare(b.date ?? `${b.mois}-99`);
  return {
    ceMois: vivantes.filter((m) => moisDe(m) === ceMois).sort(ordre),
    ensuite: vivantes.filter((m) => (m.date ? joursAvant(m.date, maintenant) >= 0 : m.mois != null) && (moisDe(m) ?? "") > ceMois).sort(ordre),
  };
}

/* ─────────────────────────── Export ─────────────────────────── */

/** Le tableau des mobilités en CSV, comme Excel l'attend en France : point-virgule, virgule décimale, marque d'encodage. */
export function csvMobilites(mobilites: MobiliteRh[], couts: boolean): string {
  const nombre = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
  const entetes = [
    "Collaborateur", "Référence Bailly", "Ville de départ", "CP départ", "Ville d'arrivée", "CP arrivée",
    "Date du déménagement", "Date fixée", "Mois prévu", "Période", "Volume (m³)", "Distance (km)", "Formule", "Étape", "Demandée le",
    ...(couts ? ["Montant HT (€)", "Montant TTC (€)", "Nature du montant", "Facturé TTC (€)"] : []),
  ];
  const nature = { estimation: "Estimation", devis: "Devis envoyé", signe: "Devis signé" } as const;
  const lignes = mobilites.map((m) => [
    m.nom, m.reference ?? "", m.depart ?? "", m.depart_cp ?? "", m.arrivee ?? "", m.arrivee_cp ?? "",
    m.date ?? "", m.date ? (m.date_fixee ? "oui" : "non (souhaitée)") : "", m.mois ?? "", m.periode ?? "",
    nombre(m.volume_m3), nombre(m.distance_km), m.formule ? FORMULES_RH[m.formule] : "", ETAPE_RH[m.etape].label, m.cree_le.slice(0, 10),
    ...(couts ? [nombre(m.montant?.ht), nombre(m.montant?.ttc), m.montant ? nature[m.montant.nature] : "", nombre(m.facture_ttc || null)] : []),
  ]);
  const cellule = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + [entetes, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n");
}

export function telecharger(contenu: BlobPart, type: string, nom: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenu], { type }));
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const nomDeFichier = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
