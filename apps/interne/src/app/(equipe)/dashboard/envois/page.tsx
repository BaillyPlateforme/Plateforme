"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import SuiviEnvois, { type DonneesSuivi } from "./SuiviEnvois";

/** Réglages › Envois et veille : ce qui part vraiment, et la tâche de la veille. */
export default function EnvoisPage() {
  const { donnees, erreur, recharger } = useRessource<DonneesSuivi>("/api/data/envois");
  return (
    <div>
      {erreur ? <Echec message={erreur} onRetry={recharger} /> : !donnees ? <Squelette titre={false} lignes={8} /> : <SuiviEnvois d={donnees} recharger={recharger} />}
    </div>
  );
}
