import { listDevis } from "@/lib/devis";
import DevisTable from "./DevisTable";

export const dynamic = "force-dynamic";

export default async function DevisPage() {
  const devis = await listDevis();
  const totalTTC = Math.round(devis.reduce((s, d) => s + d.montant_ttc, 0));
  const accepted = devis.filter((d) => d.status === "accepte");
  const caGagne = Math.round(accepted.reduce((s, d) => s + d.montant_ttc, 0));

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Pilotage</div>
        <h1 className="mt-1 font-serif text-4xl">Devis</h1>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Devis émis" value={devis.length} />
        <Stat label="Montant total" value={`${totalTTC.toLocaleString("fr-FR")} €`} />
        <Stat label="Acceptés" value={accepted.length} accent />
        <Stat label="CA signé" value={`${caGagne.toLocaleString("fr-FR")} €`} />
      </div>

      <DevisTable devis={devis} />
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
