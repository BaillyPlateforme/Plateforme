/*
 * Les étapes du parcours d'un dossier, de la demande à l'avis : treize
 * étapes, regroupées en huit pour la bande du haut (où treize ne tiennent
 * pas sur une ligne à 1440 px), détaillées une à une dans la page.
 *
 * Module pur : il ne lit rien, il déduit l'état de chaque étape des faits du
 * dossier (donnees.ts les rassemble). Deux sources se croisent :
 *
 *  - le statut du dossier, qui fixe un palier : un dossier « Planifié » a
 *    forcément passé la commande, même si une trace manque ;
 *  - les traces réelles (devis signé, paiements, lettres, factures…).
 *
 * Une étape sous le palier sans trace n'est ni « faite » ni « à venir » :
 * elle est « manquante » (rien n'est enregistré au CRM : des arrhes, une
 * lettre de voiture) ou « sans objet » (pas de devis pour un militaire). La
 * première étape au-delà du palier qui n'est pas faite est « en cours ».
 */

export type EtatEtape = "fait" | "encours" | "avenir" | "manque" | "sansobjet";
export type CleEtape =
  | "demande"
  | "qualification"
  | "visite"
  | "devis"
  | "signature"
  | "arrhes"
  | "commande"
  | "planification"
  | "lettre"
  | "demenagement"
  | "facture"
  | "paiement"
  | "sav";

export type Etape = { cle: CleEtape; label: string; groupe: number; etat: EtatEtape; date: string | null; jour: boolean; detail: string };

/** Les huit étapes de la bande du haut. */
export const GROUPES = ["Demande", "Visite", "Devis signé", "Commande", "Planification", "Déménagement", "Facture payée", "SAV et avis"];

/** Ce que le parcours sait d'un dossier : des dates (ISO) et des comptes, rien d'autre. */
export type Faits = {
  statut: string;
  segment: string;
  aujourdhui: string;
  demande: { le: string; site: boolean; source: string | null };
  qualifieLe: string | null;
  commercial: string | null;
  visite: { faite: string | null; prevue: string | null; mode: string | null; par: string | null };
  devis: {
    premierEnvoi: string | null;
    brouillons: number;
    envoyes: number;
    signe: { le: string | null; numero: string; formule: string; montant: number } | null;
  };
  paiements: { n: number; premier: string | null; total: number };
  commandeLe: string | null;
  planifieLe: string | null;
  chargement: string | null;
  livraison: string | null;
  lettres: { n: number; livrees: number; creeesLe: string | null };
  factures: { n: number; payees: number; premiere: string | null; derniereReglee: string | null; total: number; impaye: number };
  sav: { ouverts: number; clos: number; le: string | null };
  avisLe: string | null;
};

const PALIER: Record<string, number> = { prospect: 0, visite: 1, devis: 3, commande: 6, planifie: 7, termine: 11 };
const FORMULE: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium", libre: "Devis libre" };

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
/** Une date sans heure (AAAA-MM-JJ ou minuit UTC) : lue en UTC, pour ne pas glisser d'un jour. */
export const jourFr = (d: string | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  d ? new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(new Date(d.length === 10 ? `${d}T00:00:00Z` : d)) : "";
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export function etapesDu(f: Faits): Etape[] {
  const militaire = f.segment === "militaire";
  const compte = f.segment === "compte";
  const signes = ["commande", "planifie", "termine"].includes(f.statut);
  const date = (f.livraison ?? f.chargement)?.slice(0, 10) ?? null;
  const envoyees = f.devis.envoyes + (f.devis.signe ? 1 : 0);

  // Chaque étape : faite pour de bon (une trace), et ce qu'elle dit d'elle-même.
  const base: { cle: CleEtape; label: string; groupe: number; faite: boolean; date: string | null; jour?: boolean; detail: string; vide: string; sansObjet?: boolean }[] = [
    {
      cle: "demande",
      label: f.demande.site ? "Demande du site" : "Demande",
      groupe: 0,
      faite: true,
      date: f.demande.le,
      detail: f.demande.site ? (f.demande.source === "email" ? "Reçue par e-mail" : "Formulaire du site") : "Dossier saisi au CRM",
      vide: "",
    },
    {
      cle: "qualification",
      label: "Qualification",
      groupe: 0,
      faite: !!f.qualifieLe || f.statut !== "prospect",
      date: f.qualifieLe,
      detail: f.commercial ? `Commercial : ${f.commercial}` : "Aucun commercial affecté",
      vide: "À qualifier",
    },
    {
      cle: "visite",
      label: "Visite technique",
      groupe: 1,
      faite: !!f.visite.faite,
      date: f.visite.faite ?? f.visite.prevue,
      detail: f.visite.faite
        ? `${f.visite.mode === "visio" ? "En visio" : "Sur place"}${f.visite.par ? ` avec ${f.visite.par}` : ""}`
        : f.visite.prevue
          ? `Prévue${f.visite.par ? ` avec ${f.visite.par}` : ""}`
          : "",
      vide: "Pas de visite enregistrée",
      sansObjet: true,
    },
    {
      cle: "devis",
      label: "Devis",
      groupe: 2,
      faite: !!f.devis.premierEnvoi || !!f.devis.signe,
      date: f.devis.premierEnvoi,
      detail: envoyees > 1 ? `${envoyees} formules envoyées` : envoyees === 1 ? "1 formule envoyée" : f.devis.brouillons ? `${pluriel(f.devis.brouillons, "formule")} en brouillon` : "",
      vide: militaire ? "Dossier militaire : pas de devis" : "Aucun devis envoyé au CRM",
      sansObjet: militaire,
    },
    {
      cle: "signature",
      label: "Signature",
      groupe: 2,
      faite: !!f.devis.signe,
      date: f.devis.signe?.le ?? null,
      detail: f.devis.signe ? `${f.devis.signe.numero} · ${FORMULE[f.devis.signe.formule] ?? f.devis.signe.formule} · ${eur(f.devis.signe.montant)}` : f.devis.envoyes ? "En attente de la réponse du client" : "",
      vide: militaire ? "Commande sans devis" : "Pas de devis signé au CRM",
      sansObjet: militaire,
    },
    {
      cle: "arrhes",
      label: "Arrhes",
      groupe: 3,
      faite: f.paiements.n > 0,
      date: f.paiements.premier,
      jour: true,
      detail: f.paiements.n ? `Reçu : ${eur(f.paiements.total)}` : f.devis.signe ? `Attendues : ${eur(Math.round(f.devis.signe.montant * 0.3))} (30 %)` : "",
      vide: militaire && !f.devis.signe ? "Sans devis, pas d'arrhes" : "Aucun paiement enregistré",
      sansObjet: militaire && !f.devis.signe,
    },
    {
      cle: "commande",
      label: "Commande",
      groupe: 3,
      faite: signes || !!f.commandeLe,
      date: f.commandeLe,
      detail: signes ? "Dossier en commande" : "",
      vide: "",
    },
    {
      cle: "planification",
      label: "Planification",
      groupe: 4,
      faite: !!f.chargement && ["planifie", "termine"].includes(f.statut),
      date: f.planifieLe,
      detail: f.chargement
        ? `Chargement le ${jourFr(f.chargement, { day: "numeric", month: "short" })}${f.livraison && f.livraison.slice(0, 10) !== f.chargement.slice(0, 10) ? ` · livraison le ${jourFr(f.livraison, { day: "numeric", month: "short" })}` : ""}${["planifie", "termine"].includes(f.statut) ? "" : ", à confirmer"}`
        : "",
      vide: "Pas de date au CRM",
    },
    {
      cle: "lettre",
      label: "Lettre de voiture",
      groupe: 4,
      faite: f.lettres.n > 0,
      date: f.lettres.creeesLe,
      detail: f.lettres.n ? `${pluriel(f.lettres.n, "lettre")}${f.lettres.livrees ? ` · ${f.lettres.livrees} livrée${f.lettres.livrees > 1 ? "s" : ""}` : ""}` : "",
      vide: "Aucune lettre de voiture au CRM",
    },
    {
      cle: "demenagement",
      label: "Déménagement",
      groupe: 5,
      faite: f.statut === "termine" || (f.lettres.n > 0 && f.lettres.livrees === f.lettres.n) || (!!date && date < f.aujourdhui && ["planifie", "termine"].includes(f.statut)),
      date: f.livraison ?? f.chargement,
      jour: true,
      detail: date ? (date < f.aujourdhui ? "Effectué" : date === f.aujourdhui ? "Aujourd'hui" : "Prévu") : "",
      vide: "",
    },
    {
      cle: "facture",
      label: "Facture",
      groupe: 6,
      faite: f.factures.n > 0,
      date: f.factures.premiere,
      jour: true,
      detail: f.factures.n ? `${pluriel(f.factures.n, "facture")} · ${eur(f.factures.total)}` : "",
      vide: compte ? "Client « compte » : pas de facture au CRM" : "Aucune facture au CRM",
      sansObjet: compte,
    },
    {
      cle: "paiement",
      label: "Paiement",
      groupe: 6,
      faite: f.factures.n > 0 && f.factures.payees === f.factures.n,
      date: f.factures.derniereReglee,
      jour: true,
      detail: f.factures.n ? (f.factures.payees === f.factures.n ? "Facture réglée" : `Reste à régler : ${eur(f.factures.impaye)}`) : "",
      vide: compte ? "Client « compte » : pas de facture au CRM" : "Aucune facture réglée au CRM",
      sansObjet: compte,
    },
    {
      cle: "sav",
      label: "SAV et avis",
      groupe: 7,
      faite: !!f.avisLe || (f.sav.clos > 0 && f.sav.ouverts === 0),
      date: f.avisLe ?? f.sav.le,
      detail: f.sav.ouverts ? `${pluriel(f.sav.ouverts, "réclamation")} en cours` : f.avisLe ? "Avis demandé au client" : f.sav.clos ? "Réclamations closes" : "",
      vide: "",
    },
  ];

  const perdu = f.statut === "perdu";
  const palier = PALIER[f.statut] ?? -1;
  let encours = false;
  return base.map((e, i) => {
    let etat: EtatEtape;
    if (e.faite) etat = "fait";
    else if (!perdu && i <= palier) etat = e.sansObjet ? "sansobjet" : "manque";
    else if (!perdu && !encours) {
      etat = "encours";
      encours = true;
    } else etat = "avenir";
    const detail = e.faite || etat === "encours" ? e.detail || (etat === "encours" ? "En cours" : "") : etat === "manque" || etat === "sansobjet" ? e.vide : e.detail;
    return { cle: e.cle, label: e.label, groupe: e.groupe, etat, date: e.date, jour: !!e.jour, detail };
  });
}

/**
 * Ce qu'une demande du site sans dossier dit d'elle-même : sa réception et
 * son statut (public.requests.status, tel qu'enregistré).
 */
export type FaitsDemande = { le: string; source: string | null; statut: string; qualifieLe: string | null };

const SOUS_ETAPE: Record<string, string> = { new: "Nouvelle", analyzing: "En analyse", qualified: "Qualifiée", quoted: "Qualifiée", won: "Qualifiée", lost: "Perdue", archived: "Archivée" };

/**
 * Le parcours d'une demande qui n'est pas encore un dossier : les mêmes treize
 * étapes que celui d'un dossier, la première faite (la demande est reçue), la
 * qualification en cours — son détail dit où en est la demande : nouvelle, en
 * analyse, qualifiée —, tout le reste à venir. Les statuts « Devis envoyé » et
 * « Gagnée » d'une demande sont des étapes du dossier : ils se lisent ici
 * « Qualifiée » (demandes-commun.ts, sousStatut). Une demande perdue ou
 * archivée n'a plus d'étape en cours.
 */
export function etapesDeLaDemande(f: FaitsDemande): Etape[] {
  const close = f.statut === "lost" || f.statut === "archived";
  const base = etapesDu({
    statut: "prospect",
    segment: "particulier",
    aujourdhui: f.le.slice(0, 10),
    demande: { le: f.le, site: true, source: f.source },
    qualifieLe: null,
    commercial: null,
    visite: { faite: null, prevue: null, mode: null, par: null },
    devis: { premierEnvoi: null, brouillons: 0, envoyes: 0, signe: null },
    paiements: { n: 0, premier: null, total: 0 },
    commandeLe: null,
    planifieLe: null,
    chargement: null,
    livraison: null,
    lettres: { n: 0, livrees: 0, creeesLe: null },
    factures: { n: 0, payees: 0, premiere: null, derniereReglee: null, total: 0, impaye: 0 },
    sav: { ouverts: 0, clos: 0, le: null },
    avisLe: null,
  });
  return base.map((e): Etape => {
    if (e.cle === "demande") return e;
    if (e.cle === "qualification") {
      const detail = SOUS_ETAPE[f.statut] ?? f.statut;
      return { ...e, etat: close ? "avenir" : "encours", date: close ? null : f.qualifieLe, detail };
    }
    return { ...e, etat: "avenir", date: null, detail: "" };
  });
}

/** Les huit étapes de la bande : faites, en cours ou à venir. */
export function groupesDu(etapes: Etape[]): { label: string; etat: "fait" | "encours" | "avenir" }[] {
  return GROUPES.map((label, g) => {
    const es = etapes.filter((e) => e.groupe === g);
    const etat = es.some((e) => e.etat === "encours") ? "encours" : es.every((e) => e.etat !== "avenir") ? "fait" : "avenir";
    return { label, etat };
  });
}

/** Où en est le dossier, en une ligne : l'étape en cours, ou la dernière faite. */
export function resume(etapes: Etape[]) {
  const enCours = etapes.find((e) => e.etat === "encours");
  if (enCours) return { etape: enCours.label, faites: etapes.filter((e) => e.etat !== "avenir" && e.etat !== "encours").length };
  const faites = etapes.filter((e) => e.etat !== "avenir");
  return { etape: faites[faites.length - 1]?.label ?? "", faites: faites.length };
}
