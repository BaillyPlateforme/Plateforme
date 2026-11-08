"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Tri } from "./regles";

/*
 * Le tri des appels (Chronologique | Pertinence), gardé par utilisateur dans
 * le navigateur (localStorage, clé propre au compte) : le bouton de la barre
 * et la page /appels lisent le même choix, et un changement dans l'un se voit
 * aussitôt dans l'autre. Sans stockage (navigation privée), « Chronologique ».
 */

const EVENEMENT = "bailly:appels-tri";
/** Une action sur un appel (fait, reporté) : le bouton de la barre relit sa liste. */
export const APPELS_CHANGES = "bailly:appels";

const cleDe = (utilisateur: number | null) => `bailly.appels.tri.${utilisateur ?? "anonyme"}`;

/** Sans stockage (navigation privée, stockage bloqué) : le choix vaut pour la page ouverte. */
const memoire: Record<string, Tri> = {};

function lire(cle: string): Tri {
  try {
    const v = window.localStorage.getItem(cle);
    if (v === "pertinence" || v === "chrono") return v;
  } catch {
    /* Stockage illisible : la mémoire de la page. */
  }
  return memoire[cle] ?? "chrono";
}

function abonner(rappel: () => void) {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

export function useTri(utilisateur: number | null): [Tri, (t: Tri) => void] {
  const cle = cleDe(utilisateur);
  const tri = useSyncExternalStore(abonner, () => lire(cle), () => "chrono" as Tri);
  const choisir = useCallback(
    (t: Tri) => {
      memoire[cle] = t;
      try {
        window.localStorage.setItem(cle, t);
      } catch {
        /* Sans stockage : la mémoire de la page suffit. */
      }
      window.dispatchEvent(new Event(EVENEMENT));
    },
    [cle],
  );
  return [tri, choisir];
}
