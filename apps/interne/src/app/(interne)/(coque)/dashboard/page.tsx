"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import RequestsTable from "./RequestsTable";
import KanbanBoard from "./KanbanBoard";
import FocusVue, { SEUIL } from "./FocusVue";
import type { RequestRow, RequestStatus } from "@/lib/types";

type Vue = "liste" | "focus" | "kanban";
const VUES: { cle: Vue; label: string; sous: string }[] = [
  { cle: "liste", label: "Liste", sous: "toutes les demandes" },
  { cle: "focus", label: "Focus", sous: "à ne pas rater" },
  { cle: "kanban", label: "Kanban", sous: "par étape" },
];

export default function DemandesPage() {
  const params = useSearchParams();
  const demande = params.get("vue");
  const vue: Vue = VUES.some((v) => v.cle === demande) ? (demande as Vue) : "liste";

  const { donnees, erreur, recharger } = useRessource<{ requests: RequestRow[] }>(
    "/api/data/demandes",
  );
  const requests = donnees?.requests ?? [];

  const aFocus = requests.filter(
    (r) => (r.score_potentiel ?? 0) >= SEUIL && !["lost", "archived"].includes(r.status),
  ).length;

  const compteur: Record<Vue, number> = {
    liste: requests.length,
    focus: aFocus,
    kanban: requests.filter((r) => r.status !== "archived").length,
  };

  return (
    <div>
      {/* Les trois façons de regarder les mêmes demandes. */}
      <div className="mb-4 flex w-fit gap-1 rounded-xl bg-subtle p-1">
        {VUES.map((v) => {
          const on = v.cle === vue;
          return (
            <Link
              key={v.cle}
              href={v.cle === "liste" ? "/dashboard" : `/dashboard?vue=${v.cle}`}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition ${
                on ? "bg-card shadow-[0_2px_8px_-2px_rgba(28,28,34,0.10)]" : "hover:bg-card/60"
              }`}
            >
              <span className={`text-[14px] ${on ? "font-semibold text-ink" : "text-ink-soft"}`}>
                {v.label}
              </span>
              {donnees && (
                <span
                  className={`rounded-xl px-1.5 py-0.5 text-[11px] font-semibold tnum ${
                    on ? "bg-accent-soft text-accent-dark" : "bg-card text-ink-soft"
                  }`}
                >
                  {compteur[v.cle]}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {erreur ? (
        <Echec message={erreur} onRetry={recharger} />
      ) : !donnees ? (
        <Squelette lignes={8} />
      ) : vue === "liste" ? (
        <RequestsTable
            requests={requests}
            initialQ={params.get("q") ?? ""}
            initialStatut={(params.get("statut") as RequestStatus) ?? "all"}
          />
      ) : vue === "focus" ? (
        <FocusVue requests={requests} />
      ) : (
        <KanbanBoard requests={requests} />
      )}
    </div>
  );
}

