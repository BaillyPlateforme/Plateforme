"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import StatsTabs from "./StatsTabs";
import VueEnsemble, { type Donnees } from "./VueEnsemble";
import type { VueDuSite } from "./vues";

/*
 * Statistiques › Demandes du site : une seule lecture (/api/data/tableau-de-bord,
 * qui porte aussi toutes les demandes), puis l'analyse choisie dans le bandeau.
 * Le cache de useRessource rend le passage d'une analyse à l'autre instantané.
 */
export default function StatistiquesDuSite({ vue }: { vue: VueDuSite }) {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/tableau-de-bord");
  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette titre={false} lignes={8} />;
  return vue === "ensemble" ? <VueEnsemble d={donnees} /> : <StatsTabs requests={donnees.requests} vue={vue} />;
}
