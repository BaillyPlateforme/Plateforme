"use client";

import { useEffect } from "react";

/**
 * Remet la page en clair.
 *
 * Le thème sombre est celui de l'espace équipe. Quand on en sort par un lien
 * interne, <html> porte encore son attribut : le site public s'afficherait en
 * sombre. Ce composant le retire, sans toucher au choix retenu.
 */
export default function ThemeClair() {
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);
  return null;
}
