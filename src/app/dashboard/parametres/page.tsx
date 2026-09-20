"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import ParametresClient from "./ParametresClient";
import type { SettingsRow } from "@/lib/types";

type Donnees = { settings: SettingsRow; brevo: { ok: boolean; message: string } };

export default function ParametresPage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/parametres");

  return (
    <div className="px-6 py-8 md:px-10">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={6} />
      ) : (
        <ParametresClient settings={donnees.settings} brevo={donnees.brevo} />
      )}
    </div>
  );
}
