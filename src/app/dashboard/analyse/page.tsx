import { listRequests } from "@/lib/requests";
import { STATUS_META, STATUS_ORDER } from "../status";
import { Donut, BarList, type Slice } from "./charts";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const RAMP = ["#cdd4bd", "#b3bd9c", "#97a67c", "#7c8d62", "#61734a", "#495838", "#333f27"];

export default async function AnalysePage() {
  let requests: RequestRow[] = [];
  try {
    requests = await listRequests();
  } catch {
    /* zéro */
  }

  const total = requests.length;
  const volumeTotal = Math.round(requests.reduce((s, r) => s + (r.volume_m3 ?? 0), 0));
  const estimations = requests.filter((r) => r.estimation_prix != null);
  const caPotentiel = Math.round(estimations.reduce((s, r) => s + (r.estimation_prix ?? 0), 0));
  const estMoyen = estimations.length ? Math.round(caPotentiel / estimations.length) : 0;
  const won = requests.filter((r) => r.status === "won").length;
  const decided = requests.filter((r) => ["quoted", "won", "lost"].includes(r.status)).length;
  const conversion = decided ? Math.round((won / decided) * 100) : 0;

  // Camembert statut (ordonné, rampe sauge)
  const statutSlices: Slice[] = STATUS_ORDER.map((s, i) => ({
    label: STATUS_META[s].label,
    value: requests.filter((r) => r.status === s).length,
    color: RAMP[i % RAMP.length],
  })).filter((s) => s.value > 0);

  // Camembert formule
  const formules = [
    { key: "eco", label: "Éco" },
    { key: "standard", label: "Standard" },
    { key: "luxe", label: "Confort" },
  ];
  const formuleSlices: Slice[] = formules
    .map((f, i) => ({
      label: f.label,
      value: requests.filter((r) => r.formule === f.key).length,
      color: RAMP[2 + i * 2],
    }))
    .filter((s) => s.value > 0);

  // Camembert source
  const sourceSlices: Slice[] = [
    { label: "Formulaire", value: requests.filter((r) => r.source === "form").length, color: RAMP[3] },
    { label: "Mail", value: requests.filter((r) => r.source === "email").length, color: RAMP[6] },
  ].filter((s) => s.value > 0);

  // Top villes de départ
  const villeCount = new Map<string, number>();
  requests.forEach((r) => {
    if (r.depart_ville) villeCount.set(r.depart_ville, (villeCount.get(r.depart_ville) ?? 0) + 1);
  });
  const topVilles = [...villeCount.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Volume moyen par formule
  const volParFormule = formules
    .map((f) => {
      const rs = requests.filter((r) => r.formule === f.key && r.volume_m3 != null);
      const avg = rs.length ? Math.round(rs.reduce((s, r) => s + (r.volume_m3 ?? 0), 0) / rs.length) : 0;
      return { label: f.label, value: avg };
    })
    .filter((d) => d.value > 0);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Pilotage</div>
        <h1 className="mt-1 font-serif text-4xl">Analyse</h1>
      </header>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Demandes" value={total} />
        <Kpi label="Volume cumulé" value={`${volumeTotal} m³`} />
        <Kpi label="CA potentiel" value={`${caPotentiel.toLocaleString("fr-FR")} €`} accent />
        <Kpi label="Estimation moy." value={`${estMoyen.toLocaleString("fr-FR")} €`} />
        <Kpi label="Conversion" value={`${conversion}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Répartition par statut" className="lg:col-span-2">
          <Donut data={statutSlices} centerLabel="demandes" />
        </Panel>
        <Panel title="Origine">
          <Donut data={sourceSlices} centerLabel="demandes" size={170} />
        </Panel>

        <Panel title="Formules demandées">
          <Donut data={formuleSlices} centerLabel="demandes" size={170} />
        </Panel>
        <Panel title="Top villes de départ">
          <BarList data={topVilles} />
        </Panel>
        <Panel title="Volume moyen par formule">
          <BarList data={volParFormule} unit="m³" />
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-accent/30 bg-accent-soft/50" : "border-line bg-card"}`}>
      <div className="eyebrow text-ink-soft">{label}</div>
      <div className="mt-2 font-serif text-[28px] leading-none">{value}</div>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-6 ${className}`}>
      <h3 className="eyebrow mb-6 text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}
