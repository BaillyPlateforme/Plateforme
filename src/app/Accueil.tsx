"use client";

import { useState } from "react";
import Vitrine, { type Choix, type Filtre } from "./Vitrine";
import DemandeForm from "./demande/DemandeForm";
import { FormulaireMutation, FormulaireProjet, FormulaireTransfert } from "./demande/Questionnaires";
import { Integre, remonter } from "./demande/integration";
import type { LibraryPhoto } from "@/components/PhotoAnalyzer";
import ThemeClair from "@/components/ThemeClair";

/**
 * La racine du site : les trois portes et leurs questionnaires au même endroit.
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
  initial = null,
  filtre = null,
  integre = false,
}: {
  library: LibraryPhoto[];
  instant: boolean;
  annee: number;
  /** Un lien extérieur — un bloc du site officiel — peut viser directement un questionnaire… */
  initial?: Choix | null;
  /** …ou n'ouvrir qu'une porte, dont il montre les branches. */
  filtre?: Filtre;
  /** Affiché dans une page du site officiel : ni en-tête, ni panneau, ni pied. */
  integre?: boolean;
}) {
  const [choix, setChoix] = useState<Choix | null>(initial);
  // La porte ouverte. Une adresse qui en impose une la garde ; sinon, revenir
  // d'un devis ramène à ses deux branches, et « Retour » aux trois portes.
  const [ouvert, setOuvert] = useState<Filtre>(filtre ?? (initial && initial.parcours !== "mutation" ? initial.parcours : null));
  const impose = filtre != null;

  const choisir = (c: Choix) => {
    setChoix(c);
    if (!impose) setOuvert(c.parcours === "mutation" ? null : c.parcours);
    remonter();
  };

  const ouvrir = (f: Filtre) => {
    setOuvert(f);
    // Les branches remplacent les trois portes au même endroit. Sur un
    // téléphone, où les portes sont empilées, on a pu cliquer la dernière bien
    // plus bas : on ramène le regard sur le haut du bloc s'il est sorti de l'écran.
    requestAnimationFrame(() => {
      if (integre) return remonter(true);
      const bloc = document.getElementById("portes");
      const haut = bloc?.getBoundingClientRect().top ?? 0;
      if (bloc && (haut < 0 || haut > window.innerHeight - 220)) bloc.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const revenir = () => {
    setChoix(null);
    remonter();
  };

  return (
    <Integre actif={integre}>
      <ThemeClair />
      {choix?.parcours === "particulier" ? (
        <DemandeForm library={library} instant={instant} modeInitial={choix.mode} onQuitter={revenir} />
      ) : choix?.parcours === "mutation" ? (
        <FormulaireMutation onBack={revenir} />
      ) : choix?.parcours === "entreprise" ? (
        choix.transfert === "projet" ? <FormulaireProjet onBack={revenir} /> : <FormulaireTransfert onBack={revenir} />
      ) : (
        <Vitrine onChoisir={choisir} annee={annee} integre={integre} filtre={ouvert} onOuvrir={ouvrir} impose={impose} />
      )}
    </Integre>
  );
}
