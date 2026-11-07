"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { CarteRappel } from "@/lib/rappels";
import RappelsBoard from "./RappelsBoard";

export default function RappelsPage() {
  const { donnees, erreur, recharger } = useRessource<{ rappels: CarteRappel[] }>("/api/data/rappels");

  return (
    <div className="px-5 py-5 md:px-7 md:py-6">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={6} />
      ) : (
        <RappelsBoard rappels={donnees.rappels} />
      )}
    </div>
  );
}
