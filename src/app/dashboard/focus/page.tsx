import Link from "next/link";
import { listRequests } from "@/lib/requests";
import { STATUS_META, scoreColor, sourceLabel, sourceClass } from "../status";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEUIL = 70;

export default async function FocusPage() {
  let requests: RequestRow[] = [];
  try {
    requests = await listRequests();
  } catch {
    /* zéro */
  }

  const focus = requests
    .filter((r) => (r.score_potentiel ?? 0) >= SEUIL && !["lost", "archived"].includes(r.status))
    .sort((a, b) => (b.score_potentiel ?? 0) - (a.score_potentiel ?? 0));

  const caFocus = Math.round(focus.reduce((s, r) => s + (r.estimation_prix ?? 0), 0));

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <div className="eyebrow text-ink-soft">Pilotage</div>
        <h1 className="mt-1 font-serif text-4xl">Focus</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Les demandes les plus prometteuses (score ≥ {SEUIL}/100) — à traiter en priorité, à ne pas rater.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-4">
        <Stat label="Opportunités" value={`${focus.length}`} />
        <Stat label="CA potentiel" value={`${caFocus.toLocaleString("fr-FR")} €`} accent />
        <Stat label="Score min." value={`${SEUIL}/100`} />
      </div>

      {focus.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-ink-soft">
          Aucune demande à fort potentiel pour l&apos;instant. Elles apparaîtront ici dès qu&apos;une demande dépasse {SEUIL}/100.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {focus.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/${r.id}`}
              className="group flex flex-col rounded-2xl border border-line bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium group-hover:text-accent">{r.client_nom ?? r.client_email ?? "—"}</div>
                  <div className="truncate text-xs text-ink-soft">{r.client_email}</div>
                </div>
                <ScoreBadge score={r.score_potentiel ?? 0} />
              </div>

              <div className="mt-3 text-sm text-ink-soft">{r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}</div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Cell label="Volume" value={r.volume_m3 != null ? `${r.volume_m3} m³` : "—"} />
                <Cell label="Estimation" value={r.estimation_prix != null ? `${Math.round(r.estimation_prix).toLocaleString("fr-FR")} €` : "—"} />
                <Cell label="Distance" value={r.distance_km != null ? `${r.distance_km} km` : "—"} />
                <Cell label="Difficulté" value={r.score_difficulte != null ? `${r.score_difficulte}/100` : "—"} />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceClass(r.source)}`}>{sourceLabel(r.source)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_META[r.status].className}`}>{STATUS_META[r.status].label}</span>
                <span className="ml-auto text-xs text-ink-soft transition group-hover:text-accent">Ouvrir →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border-2 ${score >= 85 ? "border-good/40 bg-good/10" : "border-accent/30 bg-accent-soft/50"}`}>
      <span className={`font-serif text-xl leading-none ${scoreColor(score)}`}>{score}</span>
      <span className="text-[9px] text-ink-soft">/100</span>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-subtle/60 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`min-w-[150px] rounded-2xl border px-5 py-4 ${accent ? "border-accent/30 bg-accent-soft/40" : "border-line bg-card"}`}>
      <div className="eyebrow text-ink-soft">{label}</div>
      <div className="mt-1 font-serif text-2xl">{value}</div>
    </div>
  );
}
