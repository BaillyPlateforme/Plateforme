import { listRequests } from "@/lib/requests";
import { STATUS_META, STATUS_ORDER } from "../status";
import { Donut, BarList, KpiCard, AreaTrend, type Slice } from "./charts";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Palette catégorielle Redion (identités).
const RAMP = ["#3b82f6", "#10b981", "#6366f1", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#94a3b8"];

const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0);

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

  // ---- Séries temporelles (30 derniers jours) ----
  const DAYS = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayIndex = (iso: string) => {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    return DAYS - 1 - Math.round((today.getTime() - d.getTime()) / 86_400_000);
  };
  const counts = new Array(DAYS).fill(0);
  const volumes = new Array(DAYS).fill(0);
  const cas = new Array(DAYS).fill(0);
  requests.forEach((r) => {
    const i = dayIndex(r.created_at);
    if (i >= 0 && i < DAYS) {
      counts[i] += 1;
      volumes[i] += r.volume_m3 ?? 0;
      cas[i] += r.estimation_prix ?? 0;
    }
  });
  const trendPoints = counts.map((v, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    return { label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), value: v };
  });
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const last7 = (a: number[]) => sum(a.slice(-7));
  const prev7 = (a: number[]) => sum(a.slice(-14, -7));
  const deltaDemandes = pct(last7(counts), prev7(counts));
  const deltaVolume = pct(last7(volumes), prev7(volumes));
  const deltaCa = pct(last7(cas), prev7(cas));

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
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Demandes" value={total} series={counts} delta={deltaDemandes} color="#6366f1" />
        <KpiCard label="Volume cumulé" value={volumeTotal} suffix=" m³" series={volumes} delta={deltaVolume} color="#3b82f6" />
        <KpiCard label="CA potentiel" value={caPotentiel} suffix=" €" series={cas} delta={deltaCa} color="#10b981" />
        <KpiCard label="Estimation moy." value={estMoyen} suffix=" €" color="#8b5cf6" />
        <KpiCard label="Conversion" value={conversion} suffix=" %" color="#f59e0b" />
      </div>

      {/* Tendance */}
      <section className="mb-6 rounded-2xl border border-line bg-card p-6">
        <h3 className="eyebrow mb-4 text-ink-soft">Demandes reçues · 30 derniers jours</h3>
        <AreaTrend points={trendPoints} unit="demandes" />
      </section>

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

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-6 ${className}`}>
      <h3 className="eyebrow mb-6 text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}
