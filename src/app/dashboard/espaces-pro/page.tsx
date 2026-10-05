"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { EspacePro } from "@/lib/espaces";
import EspacesBoard from "./EspacesBoard";

type Donnees = {
  espaces: EspacePro[];
  demandes: Record<string, number>;
  base: string;
  entreprise: { nom: string | null; email: string | null; tel: string | null };
};

export default function EspacesProPage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/espaces-pro");

  return (
    <div className="px-5 py-5 md:px-7 md:py-6">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={8} />
      ) : (
        <EspacesBoard
          espaces={donnees.espaces}
          demandes={donnees.demandes}
          base={donnees.base}
          entreprise={donnees.entreprise}
        />
      )}
    </div>
  );
}
