/*
 * Les règles du Kanban des dossiers : quelles colonnes, et ce que fait le
 * dépôt d'un dossier dans chacune.
 *
 * Une colonne est un statut du dossier (format.ts, STATUTS). Un dépôt n'écrit
 * jamais le statut à la main : il déclenche l'action du métier qui y mène,
 * celle que la fiche du dossier propose déjà (actions.ts) — signer un devis,
 * planifier, régler la facture… —, et c'est elle qui change le statut et
 * l'inscrit au fil d'activité. D'où la règle générale : un dossier avance, il
 * ne recule pas (aucune action ne « dé-signe » un devis), sauf vers « Perdu »,
 * et un dossier perdu se rouvre en « Visite à faire », comme sur la fiche.
 *
 * Module pur, sans accès à la base : le tableau s'en sert pendant le glisser
 * (la colonne survolée dit tout de suite si le dépôt est possible, et
 * pourquoi), et l'action serveur le rejoue sur l'état réel du dossier.
 */

import { ETAPES_DOSSIER, estStatutDossier, STATUTS_DOSSIER, type StatutDossier } from "./etapes";

/** Les colonnes : les étapes d'un dossier, dans l'ordre ; leur nom et leur couleur sont communs à tous les tableaux (etapes.ts). */
export const COLONNES = STATUTS_DOSSIER;
export type Statut = StatutDossier;
export const estStatut = estStatutDossier;

/** Au-delà de ce nombre de jours, un devis envoyé sans réponse est signalé sur la carte du dossier. */
export const RELANCE_JOURS = 7;

/** La ville d'une adresse saisie librement : sa dernière partie, sans le code postal. */
export function ville(adresse: string | null | undefined) {
  if (!adresse) return null;
  const morceaux = adresse.split(",").map((m) => m.trim()).filter(Boolean);
  const derniere = morceaux[morceaux.length - 1] ?? adresse;
  // Les codes postaux, devant (« 69001 Lyon ») ou derrière (« Montréal (QC) H2X 3K9 »).
  return derniere.replace(/^\d{4,5}\s+/, "").replace(/\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/, "").replace(/\s+\d{4,5}$/, "") || adresse;
}

const RANG: Record<Statut, number> = { prospect: 0, visite: 1, devis: 2, commande: 3, planifie: 4, termine: 5, perdu: 6 };

/** Le nom des colonnes : celui de la définition commune (etapes.ts). */
export const NOM = Object.fromEntries(ETAPES_DOSSIER.map((e) => [e.cle, e.label])) as Record<Statut, string>;

/** Un devis, tel que le tableau le connaît. */
export type DevisCarte = { id: number; numero: string; formule: string; montant: number; statut: "brouillon" | "envoye" | "signe" | "refuse"; envoyeLe: string | null };
/** Une facture pas encore réglée. */
export type FactureCarte = { id: number; numero: string; objet: string; montant: number; emiseLe: string };

/** Ce que les règles regardent d'un dossier. */
export type EtatDossier = { statut: Statut; segment: string; volume: number; devis: DevisCarte[]; facturesARegler: FactureCarte[] };

/** Le geste du métier qu'un dépôt déclenche, avec ce qu'il faut demander avant. */
export type Geste =
  | { genre: "visite" }
  | { genre: "generer" }
  | { genre: "envoyer"; devis: DevisCarte[] }
  | { genre: "signer"; devis: DevisCarte[] }
  | { genre: "sansDevis" }
  | { genre: "planifier" }
  | { genre: "regler"; factures: FactureCarte[] }
  | { genre: "perdre" }
  | { genre: "rouvrir" };

export type Verdict = { ok: true; geste: Geste } | { ok: false; raison: string };

/** Ce que le dépôt fera, en quelques mots : affiché dans la place qui s'ouvre. */
export const INTITULE: Record<Geste["genre"], string> = {
  visite: "Planifier la visite",
  generer: "Établir les 3 formules",
  envoyer: "Envoyer un devis",
  signer: "Enregistrer la signature",
  sansDevis: "Commande sans devis",
  planifier: "Planifier le déménagement",
  regler: "Facture réglée",
  perdre: "Marquer perdu",
  rouvrir: "Rouvrir le dossier",
};

const ouverts = (e: EtatDossier) => e.devis.filter((v) => v.statut === "brouillon" || v.statut === "envoye");
const militaire = (e: EtatDossier) => e.segment === "militaire";

/**
 * Le verdict d'un dépôt : le geste à faire, ou la raison du refus. `null`
 * quand le dossier est déjà dans cette colonne (rien à faire).
 */
export function verdict(e: EtatDossier, vers: Statut): Verdict | null {
  const de = e.statut;
  if (vers === de) return null;
  const non = (raison: string): Verdict => ({ ok: false, raison });
  const oui = (geste: Geste): Verdict => ({ ok: true, geste });

  if (de === "termine") return non("Ce dossier est terminé : il ne change plus d'étape.");
  // « Marquer perdu » : depuis toute étape ouverte, comme sur la fiche.
  if (vers === "perdu") return oui({ genre: "perdre" });
  // « Rouvrir » remet le dossier en « Visite à faire » (actions.ts, rouvrir).
  if (de === "perdu") return vers === "visite" ? oui({ genre: "rouvrir" }) : non("Un dossier perdu se rouvre d'abord : glissez-le dans « Visite à faire ».");

  if (RANG[vers] < RANG[de]) {
    if (de === "commande" || de === "planifie") return non("Le client a signé : le dossier ne revient pas en arrière. Pour l'abandonner, glissez-le dans « Perdu ».");
    if (de === "devis") return non("Des devis sont établis : le dossier ne revient pas en arrière.");
    return non("Le dossier ne revient pas à « Nouveau ».");
  }

  switch (vers) {
    case "visite":
      return oui({ genre: "visite" });
    case "devis": {
      if (militaire(e)) return non("Dossier militaire : pas de devis. Glissez-le directement dans « Signé ».");
      const o = ouverts(e);
      if (o.length) return oui({ genre: "envoyer", devis: o });
      if (e.devis.some((v) => v.statut === "signe")) return non("Un devis est déjà signé : ouvrez la fiche du dossier pour reprendre la commande.");
      if (e.volume <= 0) return non("Volume nul : renseignez l'inventaire avant d'établir les devis.");
      return oui({ genre: "generer" });
    }
    case "commande": {
      if (e.devis.some((v) => v.statut === "signe")) return non("Un devis est déjà signé : ouvrez la fiche du dossier pour reprendre la commande.");
      const o = ouverts(e);
      if (o.length) return oui({ genre: "signer", devis: o });
      if (militaire(e)) return oui({ genre: "sansDevis" });
      return non("Aucun devis à signer : établissez d'abord les devis (colonne « Devis envoyé »).");
    }
    case "planifie":
      if (de === "commande") return oui({ genre: "planifier" });
      return non("Le client n'a pas encore signé : passez d'abord le dossier dans « Signé ».");
    case "termine":
      if (de === "commande") return non("Planifiez d'abord le déménagement (colonne « Planifié »).");
      if (de !== "planifie") return non("Le client n'a pas encore signé : le dossier ne peut pas être terminé.");
      if (e.facturesARegler.length) return oui({ genre: "regler", factures: e.facturesARegler });
      if (e.segment === "compte") return non("Un dossier passe en « Terminé » quand sa facture est réglée. Client « compte » : aucune facture n'est émise au CRM.");
      return non("Un dossier passe en « Terminé » quand sa facture est réglée : émettez d'abord la facture depuis la fiche du dossier.");
    default:
      return non("Ce passage n'est pas prévu.");
  }
}
