"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import StatsTabs from "./StatsTabs";
import type { RequestRow } from "@/lib/types";

export default function StatistiquesPage() {
  const { donnees, erreur, recharger } = useRessource<{ requests: RequestRow[] }>(
    "/api/data/demandes",
  );

  return (
    <div>
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette lignes={8} />
      ) : (
        <StatsTabs requests={donnees.requests} />
      )}
    </div>
  );
}
