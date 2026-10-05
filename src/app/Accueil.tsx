"use client";

import { useState } from "react";
import Vitrine, { type Parcours } from "./Vitrine";
import DemandeForm from "./demande/DemandeForm";
import type { LibraryPhoto } from "@/components/PhotoAnalyzer";
import ThemeClair from "@/components/ThemeClair";

/**
 * La racine du site : la vitrine et le formulaire au même endroit.
 *
 * Choisir un parcours ne change pas de page — on bascule sur place, et la
 * flèche de retour ramène à la vitrine. Rien à recharger, rien à attendre.
 */
export default function Accueil({
  library,
  instant,
  annee,
  parcoursInitial = null,
}: {
  library: LibraryPhoto[];
  instant: boolean;
  annee: number;
  /** Un lien extérieur peut viser directement un parcours. */
  parcoursInitial?: Parcours | null;
}) {
  const [parcours, setParcours] = useState<Parcours | null>(parcoursInitial);

  const choisir = (p: Parcours) => {
    setParcours(p);
    window.scrollTo({ top: 0 });
  };

  const revenir = () => {
    setParcours(null);
    window.scrollTo({ top: 0 });
  };

  if (parcours) {
    return (
      <>
        <ThemeClair />
        <DemandeForm
          library={library}
          instant={instant}
          modeInitial={parcours}
          onQuitter={revenir}
        />
      </>
    );
  }

  return (
    <>
      <ThemeClair />
      <Vitrine onChoisir={choisir} annee={annee} />
    </>
  );
}
