"use client";

import { useEffect, useState } from "react";

/*
 * Ouvrir une fenêtre de duplication depuis un menu « ⋯ ». Le menu se démonte
 * dès qu'on y a choisi (ui/MenuActions) : la fenêtre ne peut pas y vivre.
 * Elle est posée à côté, dans la page, et écoute ; l'entrée du menu ne fait
 * que la réveiller, par son nom.
 */

const EVENEMENT = "bailly:dupliquer";

/** L'entrée de menu : un bouton qui ouvre la fenêtre `fenetre`. */
export function Declencheur({ fenetre, children, titre }: { fenetre: string; children: React.ReactNode; titre?: string }) {
  return (
    <button type="button" title={titre} onClick={() => window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: fenetre }))}>
      {children}
    </button>
  );
}

/** La fenêtre : ouverte quand une entrée de menu l'appelle par son nom. */
export function useOuverture(fenetre: string): [boolean, (v: boolean) => void] {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    const ecoute = (e: Event) => {
      if ((e as CustomEvent<string>).detail === fenetre) setOuvert(true);
    };
    window.addEventListener(EVENEMENT, ecoute);
    return () => window.removeEventListener(EVENEMENT, ecoute);
  }, [fenetre]);
  return [ouvert, setOuvert];
}
