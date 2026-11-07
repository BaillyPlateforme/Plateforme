"use client";

import { useEffect, useState } from "react";

/**
 * Un bouton d'envoi qui demande confirmation : le premier clic change son
 * libellé, le second envoie le formulaire. Sans réponse, il revient au
 * repos au bout de quelques secondes.
 */
export default function BoutonConfirmer({ libelle, confirmation, className }: { libelle: string; confirmation: string; className?: string }) {
  const [arme, setArme] = useState(false);
  useEffect(() => {
    if (!arme) return;
    const t = window.setTimeout(() => setArme(false), 4000);
    return () => window.clearTimeout(t);
  }, [arme]);
  return (
    <button
      type={arme ? "submit" : "button"}
      className={className}
      onClick={(e) => {
        if (!arme) {
          e.preventDefault();
          setArme(true);
        }
      }}
    >
      {arme ? confirmation : libelle}
    </button>
  );
}
