/*
 * Les appels à passer (demande de David, 08/11/2026 : « un bouton dans la
 * barre en haut "appel", avec la liste des appels à faire, soit chronologique
 * soit de pertinence avec un switch »). Module pur : les règles, le score de
 * pertinence, le tri. Partagé par le serveur (donnees.ts) et les écrans.
 *
 * Aucune règle métier n'est inventée : chaque source reprend une règle qui
 * existait déjà ailleurs dans la plateforme (voir donnees.ts, une source par
 * fonction, sa règle écrite à côté). Les seuils qui n'existaient pas sont
 * ci-dessous, nommés, à valider avec Bailly.
 */

import type { NomIcone } from "@/ui/icones";

export type SourceAppel = "visite" | "rappel" | "devis" | "nouvelle";

export const SOURCES: { cle: SourceAppel; libelle: string; court: string }[] = [
  { cle: "visite", libelle: "Visites de demain non confirmées", court: "Visite demain" },
  { cle: "rappel", libelle: "Rappels demandés", court: "Rappel demandé" },
  { cle: "devis", libelle: "Devis sans réponse", court: "Devis sans réponse" },
  { cle: "nouvelle", libelle: "Nouvelles demandes du site", court: "Nouvelle demande" },
];
export const sourceDe = (s: string | null | undefined) => SOURCES.find((x) => x.cle === s) ?? null;

/** L'icône de chaque source (src/ui/icones.tsx). */
export const ICONE_SOURCE: Record<SourceAppel, NomIcone> = { visite: "calendrier", rappel: "telephone", devis: "devis", nouvelle: "questionnaires" };

/* ─────────────── Les seuils ─────────────── */

/**
 * Un devis du CRM envoyé depuis plus de N jours sans réponse est à appeler.
 * Seuil EXISTANT : celui de la cloche (« Relancer … — devis envoyé il y a N
 * jours, sans réponse », relancesDevis dans crm/lib/data.ts) et le premier
 * délai par défaut de la relance de devis (crm/relances/regles.ts).
 */
export const DEVIS_SANS_REPONSE_JOURS = 2;

/** « Plus tard » sans heure choisie : le lendemain, à cette heure (heure de Paris). À valider. */
export const HEURE_REPRISE = 9;

/** Un report va jusqu'à 60 jours au plus : au-delà, l'appel n'a plus de sens. À valider. */
export const REPORT_MAX_JOURS = 60;

/** La vue « Faits » de la page : les appels notés depuis N jours. */
export const FAITS_JOURS = 30;
/**
 * Une demande du site qualifiée d'office par l'analyse (en une seconde, sans
 * personne) reste « à appeler » pendant ce nombre de jours si personne ne l'a
 * contactée (David, 08/11/2026 : sa demande n'apparaissait pas). À valider.
 */
export const NOUVELLES_QUALIFIEES_JOURS = 30;

/** Le bouton de la barre relit la liste toutes les N secondes (onglet visible), et à chaque changement de page. */
export const RAFRAICHIR_SECONDES = 60;

/** Une note d'appel tient en une phrase ou deux. */
export const NOTE_MAX = 280;

/* ─────────────── Le score de pertinence ─────────────── */

/*
 * score (0 à 100) = urgence + potentiel + montant + attente
 *
 *   urgence   0–45  la source : visite de demain non confirmée 45, rappel
 *                   demandé par le client 35, devis sans réponse 20,
 *                   nouvelle demande pas encore contactée 15 ;
 *   potentiel 0–20  le score de potentiel de la demande (qualification,
 *                   0 à 100) × 0,2 ; inconnu (dossier sans demande du
 *                   site) : la moitié, 10 ;
 *   montant   0–20  le montant du devis (ou l'estimation du site) :
 *                   20 × montant / 5 000 €, plafonné à 20 ; inconnu : 0 ;
 *   attente   0–15  pour un devis sans réponse, depuis quand l'appel est
 *                   dû : 15 × heures / 72, plafonné à 15 (trois jours
 *                   d'attente = part pleine) ; pour un rappel demandé ou
 *                   une nouvelle demande, la FRAÎCHEUR : 15 tout de suite,
 *                   puis de moins en moins jusqu'à 0 à trois jours — un
 *                   client qui vient d'écrire est le plus chaud (David,
 *                   08/11/2026) ; une visite de demain a d'emblée la part
 *                   pleine : son échéance est là.
 *
 * Ainsi une visite de demain passe devant un devis ancien et cher, et un
 * rappel récent à fort potentiel devant un rappel ancien et modeste.
 *
 * La « Pertinence » trie par score décroissant, puis par échéance ; la vue
 * « Chronologique » par échéance, la plus récente d'abord : ce qui vient
 * d'arriver est en haut (David, 08/11/2026).
 */
export const URGENCE: Record<SourceAppel, number> = { visite: 45, rappel: 35, devis: 20, nouvelle: 15 };
export const POIDS = { potentiel: 20, montant: 20, attente: 15 } as const;
export const POTENTIEL_INCONNU = 50;
export const MONTANT_PLEIN = 5000;
export const ATTENTE_PLEINE_HEURES = 72;

export interface Score {
  total: number;
  urgence: number;
  potentiel: number;
  montant: number;
  attente: number;
}

const borne = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

export function scoreAppel(a: { source: SourceAppel; potentiel: number | null; montant: number | null; attenteHeures: number }): Score {
  const urgence = URGENCE[a.source];
  const potentiel = Math.round(POIDS.potentiel * borne((a.potentiel ?? POTENTIEL_INCONNU) / 100));
  const montant = Math.round(POIDS.montant * borne((a.montant ?? 0) / MONTANT_PLEIN));
  const fraicheur = a.source === "rappel" || a.source === "nouvelle";
  const attente =
    a.source === "visite"
      ? POIDS.attente
      : Math.round(POIDS.attente * (fraicheur ? 1 - borne(a.attenteHeures / ATTENTE_PLEINE_HEURES) : borne(a.attenteHeures / ATTENTE_PLEINE_HEURES)));
  return { total: urgence + potentiel + montant + attente, urgence, potentiel, montant, attente };
}

export const detailScore = (s: Score) =>
  `Urgence ${s.urgence}/${URGENCE.visite} · potentiel ${s.potentiel}/${POIDS.potentiel} · montant ${s.montant}/${POIDS.montant} · attente ${s.attente}/${POIDS.attente}`;

/* ─────────────── Un appel ─────────────── */

export interface Appel {
  /** source|objet|occurrence : ce que les actions reçoivent. */
  cle: string;
  source: SourceAppel;
  /** Le rappel (request_events), la demande (requests), le dossier ou le rendez-vous. */
  objetId: string;
  /** Ce qui rend l'appel dû (l'envoi du devis, l'heure de la visite) : une nouvelle occurrence le ramène. */
  occurrence: string;
  client: string;
  telephone: string | null;
  /** « Rappel demandé il y a 2 h », « Devis DV-… envoyé il y a 6 jours, pas de réponse »… */
  motif: string;
  /** Le complément : trajet, créneau souhaité, commercial… */
  detail: string | null;
  /** Une pastille de plus : « Incomplète », « Visio », « En cours »… */
  marque: string | null;
  /** ISO : depuis quand l'appel est dû (le tri chronologique). */
  echeance: string;
  /** « depuis 2 h », « depuis 6 j » : écrit par le serveur, au moment de la lecture. */
  depuis: string;
  /** « hier 14 h », « lun. 2 nov. 13 h » : l'échéance, écrite par le serveur. */
  echeanceLibelle: string;
  potentiel: number | null;
  montant: number | null;
  score: Score;
  lien: { href: string; libelle: string };
  dossierId: number | null;
  requestId: string | null;
  /** Ce que dit le journal des gestes : « rappel demandé », « devis DV-… sans réponse ». */
  resume: string;
  /** Pour le Feed : l'objet du geste (rappel, demande, devis, rendez-vous). */
  objetFeed: { type: string; id: string };
  /** ISO : reporté jusque-là (« Plus tard »), ou rien. */
  reporteAu: string | null;
  /** « demain 9 h » : écrit par le serveur. */
  reporteLibelle: string | null;
}

/** Un appel noté « fait », ou fermé sans appel (vue « Faits » de la page). */
export interface AppelFait {
  cle: string;
  source: SourceAppel;
  etat: "fait" | "ferme";
  client: string;
  motif: string;
  telephone: string | null;
  note: string | null;
  par: string | null;
  quand: string;
  quandLibelle: string;
  lien: string | null;
}

export const cleAppel = (source: SourceAppel, objetId: string, occurrence: string) => `${source}|${objetId}|${occurrence}`;

export function lireCle(cle: string): { source: SourceAppel; objetId: string; occurrence: string } | null {
  const [source, objetId, ...reste] = String(cle ?? "").split("|");
  if (!sourceDe(source) || !objetId || objetId.length > 64) return null;
  return { source: source as SourceAppel, objetId, occurrence: reste.join("|").slice(0, 64) };
}

/* ─────────────── Le tri ─────────────── */

export type Tri = "chrono" | "pertinence";

export function trier<T extends Pick<Appel, "echeance" | "score">>(appels: T[], tri: Tri): T[] {
  const t = (a: T) => Date.parse(a.echeance) || 0;
  return [...appels].sort((a, b) => (tri === "pertinence" ? b.score.total - a.score.total || t(b) - t(a) : t(b) - t(a) || b.score.total - a.score.total));
}

/* ─────────────── Le téléphone ─────────────── */

/** « 0612345678 », « +33 6 12… », « 33612345678 » → « 06 12 34 56 78 » ; un numéro étranger reste tel quel. */
export function telAffiche(brut: string | null | undefined): string | null {
  const b = String(brut ?? "").trim();
  if (!b) return null;
  let d = b.replace(/[^\d+]/g, "");
  if (d.startsWith("+33")) d = `0${d.slice(3)}`;
  else if (d.startsWith("0033")) d = `0${d.slice(4)}`;
  else if (/^33\d{9}$/.test(d)) d = `0${d.slice(2)}`;
  return /^0\d{9}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, "$1 ") : b;
}

/** Le lien d'appel : chiffres et « + » seuls ; un numéro français en +33. */
export function telLien(brut: string | null | undefined): string | null {
  let d = String(brut ?? "").replace(/[^\d+]/g, "");
  if (!d.replace(/\D/g, "")) return null;
  if (/^0\d{9}$/.test(d)) d = `+33${d.slice(1)}`;
  else if (/^33\d{9}$/.test(d)) d = `+${d}`;
  return `tel:${d}`;
}
