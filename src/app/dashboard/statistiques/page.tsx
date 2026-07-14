import { listRequests } from "@/lib/requests";
import { STATUS_META, STATUS_ORDER } from "../status";
import { Donut, KpiCard, MultiAreaTrend, CategoryBars, type Slice } from "./charts";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Palette catégorielle Redion.
const CATC: Record<string, string> = {
  new: "#94a3b8", analyzing: "#f59e0b", qualified: "#6366f1", quoted: "#3b82f6", won: "#10b981", lost: "#ef4444", archived: "#cbd5e1",
};

export default async function StatistiquesPage() {
  let requests: RequestRow[] = [];
  try {
    requests = await listRequests();
  } catch {
    /* zéro */
  }

  const isComplete = (r: RequestRow) => r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville && !r.completion_token;
  const total = requests.length;
  const completes = requests.filter(isComplete).length;
  const incompletes = total - completes;
  const tauxCompletude = total ? Math.round((completes / total) * 1000) / 10 : 0;
  const scored = requests.filter((r) => r.score_potentiel != null);
  const scoreMoyen = scored.length ? Math.round((scored.reduce((s, r) => s + (r.score_potentiel ?? 0), 0) / scored.length) * 10) / 10 : 0;
  const aTraiter = requests.filter((r) => r.status === "new" && isComplete(r)).length;
  const devisEnvoyes = requests.filter((r) => ["quoted", "won"].includes(r.status)).length;
  const gagnes = requests.filter((r) => r.status === "won").length;

  // ---- Séries temporelles (30 derniers jours) : reçues vs qualifiées ----
  const DAYS = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const idx = (iso: string) => DAYS - 1 - Math.round((today.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  const recues = new Array(DAYS).fill(0);
  const qualifiees = new Array(DAYS).fill(0);
  requests.forEach((r) => {
    const i = idx(r.created_at);
    if (i >= 0 && i < DAYS) {
      recues[i] += 1;
      if (["qualified", "quoted", "won", "lost"].includes(r.status)) qualifiees[i] += 1;
    }
  });
  const labels = recues.map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  });

  // Donut répartition par statut
  const statutSlices: Slice[] = STATUS_ORDER.map((s) => ({
    label: STATUS_META[s].label,
    value: requests.filter((r) => r.status === s).length,
    color: CATC[s] ?? "#94a3b8",
  })).filter((s) => s.value > 0);

  // Barres statuts
  const statutBars = STATUS_ORDER.map((s) => ({
    label: STATUS_META[s].label,
    value: requests.filter((r) => r.status === s).length,
    color: CATC[s] ?? "#94a3b8",
  })).filter((b) => b.value > 0).sort((a, b) => b.value - a.value);

  // Top villes de départ (sous-liste)
  const villeCount = new Map<string, number>();
  requests.forEach((r) => {
    if (r.depart_ville) villeCount.set(r.depart_ville, (villeCount.get(r.depart_ville) ?? 0) + 1);
  });
  const villeMax = Math.max(1, ...villeCount.values());
  const topVilles = [...villeCount.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 7);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <div className="eyebrow text-ink-soft">Pilotage</div>
        <h1 className="mt-1 font-serif text-4xl">Statistiques</h1>
        <p className="mt-1 text-sm text-ink-soft">Vue d&apos;ensemble du flux de demandes.</p>
      </header>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <KpiCard label="Demandes reçues" value={total} sub="Total des demandes" color="#10b981" />
        <KpiCard label="Complètes" value={completes} sub={`${incompletes} incomplètes`} color="#6366f1" />
        <KpiCard label="Taux de complétude" value={tauxCompletude} suffix=" %" decimals={1} sub="Complètes ÷ reçues" color="#f59e0b" />
        <KpiCard label="Score moyen" value={scoreMoyen} suffix=" /100" decimals={1} sub="Qualité des demandes" color="#3b82f6" />
        <KpiCard label="À traiter" value={aTraiter} sub="Complètes non traitées" color="#f59e0b" />
        <KpiCard label="Devis envoyés" value={devisEnvoyes} sub={`${gagnes} gagnés`} color="#3b82f6" />
      </div>

      {/* Tendance + donut */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-card p-6 lg:col-span-2">
          <h3 className="font-serif text-lg">Demandes & qualification dans le temps</h3>
          <p className="mb-4 text-sm text-ink-soft">Demandes reçues vs effectivement qualifiées</p>
          <MultiAreaTrend
            labels={labels}
            series={[
              { name: "Reçues", color: "#10b981", data: recues },
              { name: "Qualifiées", color: "#6366f1", data: qualifiees },
            ]}
          />
        </section>
        <section className="rounded-2xl border border-line bg-card p-6">
          <h3 className="font-serif text-lg">Répartition par statut</h3>
          <p className="mb-4 text-sm text-ink-soft">Part de chaque étape</p>
          <Donut data={statutSlices} centerLabel="demandes" size={190} />
        </section>
      </div>

      {/* Barres statuts + sous-liste villes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-6">
          <h3 className="font-serif text-lg">Statuts — volume</h3>
          <p className="mb-5 text-sm text-ink-soft">Répartition des demandes par étape</p>
          <CategoryBars data={statutBars} />
        </section>
        <section className="rounded-2xl border border-line bg-card p-6">
          <h3 className="font-serif text-lg">Top villes de départ</h3>
          <p className="mb-5 text-sm text-ink-soft">Origine des déménagements</p>
          <div className="divide-y divide-line/70">
            {topVilles.length === 0 && <p className="text-sm text-ink-soft">Pas de données.</p>}
            {topVilles.map((v) => (
              <div key={v.label} className="flex items-center gap-3 py-2.5">
                <span className="w-28 shrink-0 truncate text-sm">{v.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(v.value / villeMax) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-semibold tabular-nums">{v.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
