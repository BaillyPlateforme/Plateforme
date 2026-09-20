"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import PlaygroundShell from "./PlaygroundShell";
import type { LibraryPhoto } from "@/components/PhotoAnalyzer";

export default function PlaygroundPage() {
  const { donnees, erreur, recharger } = useRessource<{ library: LibraryPhoto[] }>(
    "/api/data/bibliotheque",
  );

  return (
    <div className="px-6 py-8 md:px-10">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={6} />
      ) : (
        <PlaygroundShell library={donnees.library} />
      )}
    </div>
  );
}
