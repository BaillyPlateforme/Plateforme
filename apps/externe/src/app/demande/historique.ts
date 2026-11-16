"use client";

import { useCallback, useEffect, useRef } from "react";

/*
 * Les étapes d'un parcours dans l'historique du navigateur.
 *
 * Un parcours change d'étape sur place, sans changer de page. Sans entrée
 * d'historique, le bouton Retour du navigateur — ou le geste retour
 * d'Android, très utilisé au téléphone — quittait le formulaire au lieu de
 * revenir à l'étape précédente, et toute la saisie était perdue.
 *
 * Chaque étape affichée a donc son entrée : la première marque l'entrée
 * courante, les suivantes s'empilent. Retour et Avance rouvrent l'étape de
 * l'entrée ; le formulaire, resté affiché, garde la saisie. L'adresse, elle,
 * ne change pas : un rechargement ramène au début, comme avant.
 *
 * Next.js prend ces entrées à son compte : il recopie son propre état dans
 * celui qu'on pose et le garde quand on y revient, sans recharger la page.
 *
 * Dans le cadre du site officiel (?integre=1), les entrées du cadre
 * rejoignent l'historique de la page qui l'accueille : son bouton Retour
 * revient d'abord sur les étapes, puis quitte la page, comme ailleurs.
 */

const CLE = "baillyEtape";

/** Ce qu'on pose dans l'entrée : le parcours, son étape, et le nombre d'entrées depuis la première. */
type Marque = { parcours: string; etape: number; profondeur: number };

const marqueDe = (etat: unknown): Marque | null => ((etat as Record<string, Marque> | null)?.[CLE] ?? null);

/**
 * Tient `etape` dans l'historique et la rouvre sur Retour ou Avance.
 *
 * `fini` : la demande est partie. L'historique revient alors à la première
 * entrée du parcours — sinon Retour, sur l'écran de fin, rejouerait une à
 * une des étapes qu'on ne voit plus, sans que rien ne bouge à l'écran.
 *
 * Renvoie de quoi en faire autant avant de quitter le parcours par la page
 * (le bouton « Accueil »).
 */
export function useEtapesDansLHistorique(etape: number, allerA: (etape: number) => void, fini = false) {
  // Un nom par parcours ouvert : les entrées d'un parcours quitté puis rouvert ne pilotent pas le nouveau.
  const parcours = useRef<string | null>(null);
  const finiRef = useRef(fini);

  /** La marque de l'entrée courante, si elle est de ce parcours. */
  const ici = useCallback(() => {
    const m = marqueDe(window.history.state);
    return m && m.parcours === parcours.current ? m : null;
  }, []);

  const rembobiner = useCallback(() => {
    const m = ici();
    if (m && m.profondeur > 0) window.history.go(-m.profondeur);
  }, [ici]);

  useEffect(() => {
    finiRef.current = fini;
    parcours.current ??= Math.random().toString(36).slice(2);
    if (fini) {
      rembobiner();
      return;
    }
    const m = ici();
    // Arrivé par Retour ou Avance : l'entrée de cette étape existe déjà.
    if (m?.etape === etape) return;
    const etat = { ...window.history.state, [CLE]: { parcours: parcours.current, etape, profondeur: m ? m.profondeur + 1 : 0 } };
    if (m) window.history.pushState(etat, "");
    else window.history.replaceState(etat, "");
  }, [etape, fini, ici, rembobiner]);

  useEffect(() => {
    const surRetour = (e: PopStateEvent) => {
      const m = marqueDe(e.state);
      if (!finiRef.current && m && m.parcours === parcours.current) allerA(m.etape);
    };
    window.addEventListener("popstate", surRetour);
    return () => window.removeEventListener("popstate", surRetour);
  }, [allerA]);

  return rembobiner;
}
