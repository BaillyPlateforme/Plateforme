"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { CarteRappel } from "@/lib/rappels";
import RappelsBoard from "./RappelsBoard";

export default function RappelsPage() {
  const { donnees, erreur, recharger } = useRessource<{ rappels: CarteRappel[] }>("/api/data/rappels");

  return (
    <div>
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
