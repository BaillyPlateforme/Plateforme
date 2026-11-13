import "server-only";
import { NextResponse } from "next/server";

/*
 * Les limites de débit des portes publiques (audit de sécurité du 13/11/2026).
 *
 * Sans elles, un robot pouvait, depuis le formulaire public : faire tourner
 * Gemini sans fin (chaque photo est un appel payant), épuiser en une heure le
 * quota de Créagidem (50 fiches par jour) ou celui de Brevo (300 e-mails par
 * jour, liens de connexion des clients compris), et se servir des e-mails de
 * Bailly pour écrire à n'importe qui.
 *
 * Fenêtre glissante, gardée en mémoire du serveur : chaque service tourne sur
 * un seul serveur, et un redémarrage remet les compteurs à zéro — il s'agit
 * d'arrêter un robot, pas de facturer. Les plafonds se règlent par variables
 * d'environnement, sans toucher au code (lireLimite).
 */

export type Fenetre = { nom: "minute" | "heure" | "jour"; ms: number; max: number };
type Entree = { t: number; n: number };
export type Refus = { cle: string; fenetre: Fenetre["nom"]; dans: number };

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

const coffre = globalThis as typeof globalThis & { __limitesDebit?: Map<string, Entree[]> };
const journal = (): Map<string, Entree[]> => (coffre.__limitesDebit ??= new Map<string, Entree[]>());

/** Un plafond réglable : la variable si elle est un entier positif ou nul, sinon la valeur par défaut. */
export function lireLimite(nom: string, defaut: number): number {
  const v = Number(process.env[nom]);
  return process.env[nom]?.trim() && Number.isInteger(v) && v >= 0 ? v : defaut;
}

/** Les trois fenêtres usuelles, plafonds lus dans PREFIXE_PAR_MINUTE, _PAR_HEURE, _PAR_JOUR. */
export function fenetres(prefixe: string, defauts: { minute: number; heure: number; jour: number }): Fenetre[] {
  return [
    { nom: "minute", ms: MINUTE, max: lireLimite(`${prefixe}_PAR_MINUTE`, defauts.minute) },
    { nom: "heure", ms: HEURE, max: lireLimite(`${prefixe}_PAR_HEURE`, defauts.heure) },
    { nom: "jour", ms: JOUR, max: lireLimite(`${prefixe}_PAR_JOUR`, defauts.jour) },
  ];
}

export const fenetreJour = (max: number): Fenetre[] => [{ nom: "jour", ms: JOUR, max }];

/**
 * L'adresse IP du visiteur. Railway ajoute l'adresse réelle EN DERNIER dans
 * X-Forwarded-For ; ce qui précède, le visiteur peut l'écrire lui-même.
 */
export function adresseIp(entetes: Headers): string {
  const liste = (entetes.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return liste[liste.length - 1] || entetes.get("x-real-ip")?.trim() || "inconnue";
}

/**
 * Réserve d'un coup plusieurs compteurs (l'adresse IP, l'e-mail, le total du
 * jour…) : si l'un dépasse, rien n'est réservé et le refus dit lequel, et
 * dans combien de temps une place se libère.
 */
export function reserver(demandes: { cle: string; poids?: number; fenetres: Fenetre[] }[]): Refus | null {
  const maintenant = Date.now();
  const m = journal();
  const listes = demandes.map((d) => {
    const plusLongue = Math.max(...d.fenetres.map((f) => f.ms));
    return (m.get(d.cle) ?? []).filter((e) => e.t > maintenant - plusLongue);
  });
  for (const [i, d] of demandes.entries()) {
    const poids = d.poids ?? 1;
    for (const f of d.fenetres) {
      const dedans = listes[i].filter((e) => e.t > maintenant - f.ms);
      const total = dedans.reduce((s, e) => s + e.n, 0);
      if (total + poids > f.max) {
        const libre = dedans.length ? dedans[0].t + f.ms : maintenant + f.ms;
        return { cle: d.cle, fenetre: f.nom, dans: Math.max(1, Math.ceil((libre - maintenant) / 1000)) };
      }
    }
  }
  demandes.forEach((d, i) => m.set(d.cle, [...listes[i], { t: maintenant, n: d.poids ?? 1 }]));
  if (m.size > 20_000) for (const [cle, l] of m) if (!l.length || l[l.length - 1].t < maintenant - JOUR) m.delete(cle);
  return null;
}

/** « dans 3 minutes », « dans 2 heures », « demain ». */
export function delaiLisible(secondes: number): string {
  if (secondes < 90) return "dans une minute";
  if (secondes < 3600) return `dans ${Math.ceil(secondes / 60)} minutes`;
  if (secondes < 6 * 3600) return `dans ${Math.ceil(secondes / 3600)} heures`;
  return "demain";
}

/** La réponse 429, avec Retry-After, et le message lisible à afficher au visiteur. */
export function reponseTropDeDemandes(refus: Refus, message: string): NextResponse {
  return NextResponse.json(
    { error: `${message} Réessayez ${delaiLisible(refus.dans)}.`, limite: refus.fenetre },
    { status: 429, headers: { "Retry-After": String(refus.dans) } },
  );
}
