"use client";

import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import ClientsTable from "./ClientsTable";
import type { ClientSummary } from "@/lib/clients";

export default function ClientsPage() {
  const { donnees, erreur, recharger } = useRessource<{ clients: ClientSummary[] }>(
    "/api/data/clients",
  );

  return (
    <div className="px-6 py-8 md:px-10">
      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette />
      ) : (
        <Contenu clients={donnees.clients} />
      )}
    </div>
  );
}

function Contenu({ clients }: { clients: ClientSummary[] }) {
  const caTotal = Math.round(clients.reduce((s, c) => s + c.ca_potentiel, 0));
  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Clients" value={clients.length} />
        <Stat label="CA potentiel cumulé" value={`${caTotal.toLocaleString("fr-FR")} €`} accent />
        <Stat label="Volume total" value={`${clients.reduce((s, c) => s + c.volume_total, 0)} m³`} />
      </div>
      <ClientsTable clients={clients} />
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
