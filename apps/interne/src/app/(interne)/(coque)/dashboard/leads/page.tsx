"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { Lead } from "@/lib/suivi-commun";
import SuiviLeads from "./SuiviLeads";

export default function LeadsPage() {
  const { donnees, erreur, recharger } = useRessource<{ leads: Lead[] }>("/api/data/leads");

  return (
    <div>
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={8} />
      ) : (
        <SuiviLeads leads={donnees.leads} />
      )}
    </div>
  );
}
