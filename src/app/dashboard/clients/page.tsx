import { listClients } from "@/lib/clients";
import ClientsTable from "./ClientsTable";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listClients();
  const caTotal = Math.round(clients.reduce((s, c) => s + c.ca_potentiel, 0));

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Pilotage</div>
        <h1 className="mt-1 font-serif text-4xl">Clients</h1>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Clients" value={clients.length} />
        <Stat label="CA potentiel cumulé" value={`${caTotal.toLocaleString("fr-FR")} €`} accent />
        <Stat
          label="Volume total"
          value={`${clients.reduce((s, c) => s + c.volume_total, 0)} m³`}
        />
      </div>

      <ClientsTable clients={clients} />
    </div>
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
