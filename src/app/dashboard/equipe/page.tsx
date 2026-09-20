"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import EquipeClient from "./EquipeClient";
import type { TeamMemberRow } from "@/lib/types";

export default function EquipePage() {
  const { donnees, erreur, recharger } = useRessource<{ members: TeamMemberRow[] }>(
    "/api/data/equipe",
  );

  return (
    <div className="px-6 py-8 md:px-10">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={4} />
      ) : (
        <EquipeClient members={donnees.members} />
      )}
    </div>
  );
}
