"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import MessagerieTabs from "./MessagerieTabs";

type Donnees = {
  templates: Parameters<typeof MessagerieTabs>[0]["templates"];
  rules: Parameters<typeof MessagerieTabs>[0]["rules"];
  base?: string;
  entreprise?: Parameters<typeof MessagerieTabs>[0]["entreprise"];
};

export default function MessageriePage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/messagerie");

  return (
    <div>
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={6} />
      ) : (
        <MessagerieTabs templates={donnees.templates} rules={donnees.rules} base={donnees.base} entreprise={donnees.entreprise} />
      )}
    </div>
  );
}
