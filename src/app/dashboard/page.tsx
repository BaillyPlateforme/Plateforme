import Link from "next/link";
import { listRequests } from "@/lib/requests";
import RequestsTable from "./RequestsTable";
import KanbanBoard from "./KanbanBoard";
import FocusVue, { SEUIL } from "./FocusVue";
import type { RequestRow, RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Vue = "liste" | "focus" | "kanban";
const VUES: { cle: Vue; label: string; sous: string }[] = [
  { cle: "liste", label: "Liste", sous: "toutes les demandes" },
  { cle: "focus", label: "Focus", sous: "à ne pas rater" },
  { cle: "kanban", label: "Kanban", sous: "par étape" },
];

export default async function DemandesPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; statut?: string }>;
}) {
  const params = await searchParams;
  const vue: Vue = VUES.some((v) => v.cle === params.vue) ? (params.vue as Vue) : "liste";

  let requests: RequestRow[] = [];
  let error: string | null = null;
  try {
    requests = await listRequests();
  } catch (e) {
    error = e instanceof Error ? e.message : "Erreur inconnue";
  }

  const nouvelles = requests.filter((r) => r.status === "new").length;
  const volumeTotal = requests.reduce((s, r) => s + (r.volume_m3 ?? 0), 0);
  const notees = requests.filter((r) => r.score_potentiel != null);
  const potentielMoyen = notees.length
    ? Math.round(notees.reduce((s, r) => s + (r.score_potentiel ?? 0), 0) / notees.length)
    : null;
  const aFocus = requests.filter(
    (r) => (r.score_potentiel ?? 0) >= SEUIL && !["lost", "archived"].includes(r.status),
  ).length;

  const compteur: Record<Vue, number> = {
    liste: requests.length,
    focus: aFocus,
    kanban: requests.filter((r) => !["archived"].includes(r.status)).length,
  };

  return (
    <div className="px-6 py-7 md:px-10">
      {/* Les trois façons de regarder les mêmes demandes. */}
      <div className="mb-6 flex w-fit gap-1 rounded-full bg-card p-1.5">
        {VUES.map((v) => {
          const on = v.cle === vue;
          return (
            <Link
              key={v.cle}
              href={v.cle === "liste" ? "/dashboard" : `/dashboard?vue=${v.cle}`}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-full px-4 py-2 transition ${
                on ? "bg-paper shadow-[0_1px_3px_rgba(26,26,26,0.08)]" : "hover:bg-paper/60"
              }`}
            >
              <span className={`text-[14px] ${on ? "font-semibold text-ink" : "text-ink-soft"}`}>
                {v.label}
              </span>
              <span
                className={`rounded-lg px-1.5 py-0.5 text-[11px] font-semibold tnum ${
                  on ? "bg-ink text-white" : "bg-paper text-ink-soft"
                }`}
              >
                {compteur[v.cle]}
              </span>
              <span className="hidden text-[11.5px] text-ink-soft lg:block">{v.sous}</span>
            </Link>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 text-sm">{error}</div>
      ) : vue === "liste" ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Total" value={requests.length} />
            <Stat label="Nouvelles" value={nouvelles} accent />
            <Stat label="Volume cumulé" value={`${Math.round(volumeTotal)} m³`} />
            <Stat
              label="Potentiel moyen"
              value={potentielMoyen != null ? `${potentielMoyen}/100` : "—"}
            />
          </div>
          <RequestsTable
            requests={requests}
            initialQ={params.q ?? ""}
            initialStatut={(params.statut as RequestStatus) ?? "all"}
          />
        </>
      ) : vue === "focus" ? (
        <FocusVue requests={requests} />
      ) : (
        <KanbanBoard requests={requests} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-3xl p-5 ${accent ? "bg-ciel" : "bg-card"}`}>
      <div className="text-[11px] uppercase tracking-wide text-ink/60">{label}</div>
      <div className="mt-1.5 font-serif text-[26px]">{value}</div>
    </div>
  );
}
