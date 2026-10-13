"use client";

import { useState } from "react";
import Vitrine, { type Parcours } from "./Vitrine";
import DemandeForm from "./demande/DemandeForm";
import { Integre, remonter } from "./demande/integration";
import type { LibraryPhoto } from "@/components/PhotoAnalyzer";
import ThemeClair from "@/components/ThemeClair";

/**
 * La racine du site : le choix du devis et le formulaire au même endroit.
 *
 * Choisir un parcours ne change pas de page — on bascule sur place, et la
 * flèche de retour ramène au choix. Rien à recharger, rien à attendre. C'est
 * aussi ce qui permet d'afficher le tout dans un cadre du site officiel : une
 * seule adresse, du choix à l'estimation.
 */
export default function Accueil({
  library,
  instant,
  annee,
  parcoursInitial = null,
  integre = false,
}: {
  library: LibraryPhoto[];
  instant: boolean;
  annee: number;
  /** Un lien extérieur peut viser directement un parcours. */
  parcoursInitial?: Parcours | null;
  /** Affiché dans une page du site officiel : ni en-tête, ni panneau, ni pied. */
  integre?: boolean;
}) {
  const [parcours, setParcours] = useState<Parcours | null>(parcoursInitial);

  const choisir = (p: Parcours) => {
    setParcours(p);
    remonter();
  };

  const revenir = () => {
    setParcours(null);
    remonter();
  };

  return (
    <Integre actif={integre}>
      <ThemeClair />
      {parcours ? (
        <DemandeForm library={library} instant={instant} modeInitial={parcours} onQuitter={revenir} />
      ) : (
        <Vitrine onChoisir={choisir} annee={annee} integre={integre} />
      )}
    </Integre>
  );
}
