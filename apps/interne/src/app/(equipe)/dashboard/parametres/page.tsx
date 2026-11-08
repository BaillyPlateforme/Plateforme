"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import ParametresClient from "./ParametresClient";
import ReglagesFacturation from "@/crm/facturation/ReglagesFacturation";
import type { SettingsRow } from "@/lib/types";

type Donnees = { settings: SettingsRow; brevo: { ok: boolean; message: string } };

export default function ParametresPage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/parametres");

  return (
    <div>
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={6} />
      ) : (
        <ParametresClient settings={donnees.settings} brevo={donnees.brevo} />
      )}
      {/* Les mentions et conditions des factures (src/crm/facturation), dans le schéma du CRM. */}
      <ReglagesFacturation />

    </div>
  );
}
