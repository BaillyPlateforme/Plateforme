/*
 * Les règles du calendrier des cartons, pures : elles servent au calendrier
 * du navigateur comme à la validation du serveur.
 *
 * Les valeurs sont celles de la v0, toutes provisoires (points ouverts du
 * brief) : délai de prévenance, capacité d'un samedi, plage horaire.
 */

import { aujourdhui } from "./format";

/** Jours de prévenance minimum avant un samedi. */
export const DELAI_MIN_JOURS = 3;
/** Livraisons possibles un même samedi, au-delà le samedi est complet. */
export const CAPACITE_SAMEDI = 8;
/** La plage annoncée avant le calcul de la tournée. */
export const PLAGE_SAMEDI = "de 8 h 30 à 13 h";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusJours = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** La fenêtre des samedis possibles : après le délai de prévenance, avant la veille du déménagement. */
export function bornesCartons(periodeDebut: string, now = new Date()) {
  return { min: plusJours(aujourdhui(now), DELAI_MIN_JOURS), max: plusJours(periodeDebut, -1) };
}

export function samedisEntre(min: string, max: string) {
  const out: string[] = [];
  const d = new Date(`${min}T12:00:00Z`);
  const fin = new Date(`${max}T12:00:00Z`);
  // Une date illisible donne un Date invalide : getUTCDay() rend NaN, jamais 6, et la
  // boucle ne finirait pas (une borne haute illisible, comparée en texte, ne l'arrêtait
  // pas non plus). Rien à proposer, comme pour une fenêtre vide.
  if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime())) return out;
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getTime() <= fin.getTime()) {
    out.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

/** Une première estimation pour le client, d'après le volume ; le conseiller fixe le nombre réel. */
export function estimationCartons(volumeM3: number) {
  return Math.round(volumeM3 * 1.25);
}

/** Le samedi qui suit une date (la date elle-même si c'est un samedi). */
export function samediSuivant(jour: string) {
  return samedisEntre(jour, plusJours(jour, 6))[0];
}

export { plusJours };
