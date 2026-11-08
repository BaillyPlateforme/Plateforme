"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Le suivi des pages vues dans l'espace d'un dossier (lib/suivi-envois) : à chaque
 * page, le navigateur dit laquelle à /t/p, avec le jeton de visite que le
 * serveur a remis à cette session. Rien n'est rendu, rien n'est attendu ; le
 * serveur ne garde qu'une ligne par page et par demi-heure. Jamais monté
 * pendant un aperçu de l'équipe (le cadre du dossier ne remet alors pas de
 * jeton).
 */
export function SuiviPortail({ jeton }: { jeton: string }) {
  const chemin = usePathname();
  useEffect(() => {
    const corps = JSON.stringify({ v: jeton, p: chemin });
    try {
      if (navigator.sendBeacon?.("/t/p", new Blob([corps], { type: "application/json" }))) return;
    } catch {
      // Pas de balise : la requête ordinaire, ci-dessous.
    }
    fetch("/t/p", { method: "POST", body: corps, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
  }, [chemin, jeton]);
  return null;
}
