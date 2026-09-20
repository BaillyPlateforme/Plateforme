"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import DevisTable from "./DevisTable";
import type { DevisRow } from "@/lib/types";

export default function DevisPage() {
  const { donnees, erreur, recharger } = useRessource<{ devis: DevisRow[] }>("/api/data/devis");

  return (
    <div className="px-6 py-8 md:px-10">
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
  const totalTTC = Math.round(devis.reduce((s, d) => s + d.montant_ttc, 0));
  const accepted = devis.filter((d) => d.status === "accepte");
  const caGagne = Math.round(accepted.reduce((s, d) => s + d.montant_ttc, 0));

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Devis émis" value={devis.length} />
        <Stat label="Montant total" value={`${totalTTC.toLocaleString("fr-FR")} €`} />
        <Stat label="Acceptés" value={accepted.length} accent />
        <Stat label="CA signé" value={`${caGagne.toLocaleString("fr-FR")} €`} />
      </div>
      <DevisTable devis={devis} />
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-accent/30 bg-accent-soft/50" : "border-line bg-card"}`}>
      <div className="eyebrow text-ink-soft">{label}</div>
      <div className="mt-2 font-serif text-[26px] leading-none">{value}</div>
    </div>
  );
}
