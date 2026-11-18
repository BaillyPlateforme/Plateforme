"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import ParametresClient from "./ParametresClient";
import type { SettingsRow } from "@/lib/types";
import type { ConnexionEnvois } from "@/lib/connexion-envois";

type Donnees = { settings: SettingsRow; connexion: ConnexionEnvois };

export default function ParametresPage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/parametres");
  const router = useRouter();

  // Les mentions des factures ont leur page dans Réglages : un ancien lien « …/parametres#facturation » y mène.
  useEffect(() => {
    if (window.location.hash === "#facturation") router.replace("/dashboard/parametres/facturation");
  }, [router]);

  return (
    <div>
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette titre={false} lignes={6} />
      ) : (
        <ParametresClient settings={donnees.settings} connexion={donnees.connexion} />
      )}
    </div>
  );
}
