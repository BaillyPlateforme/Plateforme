"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import ConfigClient from "./ConfigClient";
import type { LibraryPhoto } from "@/lib/library";
import type { AiConfig } from "@/lib/ai-config";
import type { CriterionConfig } from "@/lib/qualification";

type Donnees = { library: LibraryPhoto[]; aiConfig: AiConfig; qualifConfig: CriterionConfig[] };

export default function ConfigurationPage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/configuration");

  return (
    <div className="px-6 py-8 md:px-10">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={8} />
      ) : (
        <ConfigClient
          library={donnees.library}
          aiConfig={donnees.aiConfig}
          qualifConfig={donnees.qualifConfig}
        />
      )}
    </div>
  );
}
