"use client";

import { useMemo } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import AgendaClient from "./AgendaClient";
import type { RequestRow } from "@/lib/types";

export default function AgendaPage() {
  const { donnees, erreur, recharger } = useRessource<{ requests: RequestRow[] }>(
    "/api/data/demandes",
  );

  const events = useMemo(
    () =>
      (donnees?.requests ?? [])
        .filter((r) => r.date_souhaitee)
        .map((r) => ({
          id: r.id,
          date: r.date_souhaitee as string,
          client: r.client_nom ?? "—",
          trajet: `${r.depart_ville ?? "?"} → ${r.arrivee_ville ?? "?"}`,
          volume: r.volume_m3,
        })),
    [donnees],
  );

  return (
    <div className="px-6 py-8 md:px-10">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={8} />
      ) : (
        <AgendaClient events={events} />
      )}
    </div>
  );
}
