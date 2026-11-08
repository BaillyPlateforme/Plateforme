"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import s from "./bandeau.module.css";

/*
 * « Retour » : la page d'avant (demande de David, 08/11/2026 : « un bouton
 * retour à la page précédente, de manière générale »). Posé dans chaque
 * bandeau, devant le surtitre.
 *
 * Les pages vues dans cet onglet sont suivies ici (une pile d'adresses, hors
 * paramètres) : tant qu'une page de l'app précède, « Retour » y revient comme
 * le bouton du navigateur ; arrivé directement sur une page (un lien, un
 * nouvel onglet), il remonte à la page parente au lieu de quitter l'app.
 */
const pile = (globalThis as { __baillyPages?: string[] }).__baillyPages ?? ((globalThis as { __baillyPages?: string[] }).__baillyPages = []);

/** La page parente d'une adresse : /dossiers/12 → /dossiers ; une page de premier niveau → l'accueil. */
function parente(chemin: string) {
  const parts = chemin.split("/").filter(Boolean);
  return parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "/";
}

export default function BoutonRetour() {
  const chemin = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pile.at(-1) === chemin) return;
    // Revenir sur l'avant-dernière page (Retour, ou le bouton du navigateur) dépile ; sinon on empile.
    if (pile.at(-2) === chemin) pile.pop();
    else pile.push(chemin);
  }, [chemin]);

  if (chemin === "/") return null;
  return (
    <button
      type="button"
      className={s.retour}
      onClick={() => (pile.length > 1 && pile.at(-1) === chemin ? router.back() : router.push(parente(chemin)))}
      aria-label="Retour à la page précédente"
      title="Retour à la page précédente"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Retour
    </button>
  );
}
