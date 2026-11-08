"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import DevisTable from "./DevisTable";
import type { DevisRow } from "@/lib/types";

export default function DevisPage() {
  const { donnees, erreur, recharger } = useRessource<{ devis: DevisRow[] }>("/api/data/devis");

  return (
    <div>
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette />
      ) : (
        <Contenu devis={donnees.devis} />
      )}
    </div>
  );
}

function Contenu({ devis }: { devis: DevisRow[] }) {
  return <DevisTable devis={devis} />;
}

