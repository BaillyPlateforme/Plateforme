"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { EspacePro, Regles } from "@/lib/espaces";
import EspacesBoard from "./EspacesBoard";

type Donnees = {
  espaces: EspacePro[];
  regles: Regles;
  demandes: Record<string, number>;
  clients?: Record<string, number>;
  base: string;
  entreprise: { nom: string | null; email: string | null; tel: string | null };
};

export default function EspacesProPage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/espaces-pro");

  return (
    <div>
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={8} />
      ) : (
        <EspacesBoard
          espaces={donnees.espaces}
          regles={donnees.regles}
          demandes={donnees.demandes}
          clients={donnees.clients ?? {}}
          base={donnees.base}
          entreprise={donnees.entreprise}
        />
      )}
    </div>
  );
}
