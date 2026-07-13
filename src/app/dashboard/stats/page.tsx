import { listRequests } from "@/lib/requests";
import { STATUS_META, STATUS_ORDER } from "../status";
import type { RequestRow, RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  let requests: RequestRow[] = [];
  try {
    requests = await listRequests();
  } catch {
    /* affiche zéro */
  }

  const total = requests.length;
  const byStatus = STATUS_ORDER.map((s) => ({
    status: s,
    count: requests.filter((r) => r.status === s).length,
  }));
  const maxStatus = Math.max(1, ...byStatus.map((b) => b.count));

  const won = requests.filter((r) => r.status === "won").length;
  const quotedOrBeyond = requests.filter((r) =>
    ["quoted", "won", "lost"].includes(r.status),
  ).length;
  const conversion = quotedOrBeyond > 0 ? Math.round((won / quotedOrBeyond) * 100) : 0;

  const volumeTotal = Math.round(requests.reduce((s, r) => s + (r.volume_m3 ?? 0), 0));
  const estimations = requests.filter((r) => r.estimation_prix != null);
  const caPotentiel = Math.round(estimations.reduce((s, r) => s + (r.estimation_prix ?? 0), 0));
  const estMoyen =
    estimations.length > 0 ? Math.round(caPotentiel / estimations.length) : 0;

  const bySource = [
    { label: "Formulaire", count: requests.filter((r) => r.source === "form").length },
    { label: "Mail", count: requests.filter((r) => r.source === "email").length },
  ];

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-serif text-3xl">Statistiques</h1>
        <p className="mt-1 text-sm text-ink-soft">Vue d&apos;ensemble de l&apos;activité.</p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Big label="Demandes" value={total} />
        <Big label="Volume cumulé" value={`${volumeTotal} m³`} />
        <Big label="CA potentiel" value={`${caPotentiel.toLocaleString("fr-FR")} €`} accent />
        <Big label="Taux de conversion" value={`${conversion}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Répartition par statut">
          <div className="space-y-3">
            {byStatus.map((b) => (
              <div key={b.status} className="flex items-center gap-3">
                <div className="w-28 text-sm text-ink-soft">
                  {STATUS_META[b.status as RequestStatus].label}
                </div>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-paper">
                  <div
                    className="h-full rounded-md bg-accent/80"
                    style={{ width: `${(b.count / maxStatus) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-sm tabular-nums">{b.count}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Estimation moyenne">
            <div className="font-serif text-4xl">{estMoyen.toLocaleString("fr-FR")} €</div>
            <p className="mt-1 text-sm text-ink-soft">
              sur {estimations.length} devis estimé{estimations.length > 1 ? "s" : ""}
            </p>
          </Panel>
          <Panel title="Origine des demandes">
            <div className="space-y-3">
              {bySource.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-ink-soft">{s.label}</div>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-paper">
                    <div
                      className="h-full rounded-md bg-good/70"
                      style={{ width: `${total ? (s.count / total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-8 text-right text-sm tabular-nums">{s.count}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-accent/30 bg-accent-soft/40" : "border-line bg-card"}`}>
      <div className="text-xs uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-serif text-3xl">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-6">
      <h3 className="mb-5 text-xs font-medium uppercase tracking-wide text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}
