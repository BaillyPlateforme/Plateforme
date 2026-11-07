"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/*
 * Le devis intégré au site officiel.
 *
 * Le site de Bailly est un WordPress : il ne peut pas faire tourner le
 * formulaire, mais il peut l'afficher dans un cadre (iframe), au milieu de sa
 * propre page, avec son menu et son pied. L'adresse porte alors `?integre=1`,
 * et le devis s'y plie : ni panneau ni logo — le site a déjà les siens —, et
 * plus aucune hauteur calée sur l'écran.
 *
 * Un cadre ne connaît pas la hauteur de ce qu'il contient. La page la lui dit,
 * à chaque fois qu'elle change, par un message que le petit script posé sur le
 * site officiel écoute :
 *
 *   { source: "bailly-devis", hauteur: 1840 }   la hauteur du contenu, en pixels
 *   { source: "bailly-devis", haut: true }      revenir en haut du cadre
 */

const Integration = createContext(false);

/** Sommes-nous affichés dans une page du site officiel ? */
export const useIntegre = () => useContext(Integration);

/**
 * La hauteur d'un écran entier — sauf dans un cadre. Là, « la hauteur de
 * l'écran » est celle du cadre : une page qui s'y cale ne rétrécit plus
 * jamais, et le cadre garde la hauteur de l'étape la plus longue.
 */
export const usePleinEcran = () => (useContext(Integration) ? "" : "min-h-dvh");

const dire = (message: { hauteur: number } | { haut: true }) => {
  if (window.parent !== window) window.parent.postMessage({ source: "bailly-devis", ...message }, "*");
};

/**
 * Remonte en haut — de la page, et du cadre quand on y est : le cadre ne
 * défile pas, c'est la page du site officiel qui doit revenir sur lui.
 */
export function remonter(doux = false) {
  window.scrollTo({ top: 0, behavior: doux ? "smooth" : "auto" });
  dire({ haut: true });
}

/** Met ses enfants en mode intégré, et tient le cadre à leur hauteur. */
export function Integre({ actif, children }: { actif: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!actif || !el) return;
    // On mesure ce bloc, pas le document : <body> occupe toujours au moins la
    // hauteur du cadre, et ne dirait jamais qu'une étape est plus courte.
    const mesurer = () => dire({ hauteur: Math.ceil(el.getBoundingClientRect().height) });
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    mesurer();
    return () => observateur.disconnect();
  }, [actif]);

  if (!actif) return <>{children}</>;
  return (
    <Integration.Provider value>
      <div ref={ref}>{children}</div>
    </Integration.Provider>
  );
}
