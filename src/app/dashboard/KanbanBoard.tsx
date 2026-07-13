"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { RequestRow } from "@/lib/types";
import { moveRequestStage } from "@/lib/actions/requests";
import { sourceLabel, sourceClass, isIncomplete } from "./status";

type Stage = "incomplete" | "qualifier" | "devis" | "chantier" | "perdu";

const COLUMNS: { key: Stage; label: string; hint: string; droppable: boolean; accent: string }[] = [
  { key: "incomplete", label: "Incomplète", hint: "En attente du client", droppable: false, accent: "bg-amber-400" },
  { key: "qualifier", label: "À qualifier", hint: "Complète, à chiffrer", droppable: true, accent: "bg-blue-400" },
  { key: "devis", label: "Devis", hint: "Devis envoyé", droppable: true, accent: "bg-indigo-400" },
  { key: "chantier", label: "Chantier", hint: "Accepté", droppable: true, accent: "bg-good" },
  { key: "perdu", label: "Perdu", hint: "Refusé", droppable: true, accent: "bg-neutral-400" },
];

function stageOf(r: RequestRow): Stage | null {
  if (r.completion_token) return "incomplete";
  if (r.status === "won") return "chantier";
  if (r.status === "lost") return "perdu";
  if (r.status === "quoted") return "devis";
  if (r.status === "archived") return null;
  return "qualifier";
}

const STATUS_FOR: Record<Stage, RequestRow["status"]> = {
  incomplete: "new", qualifier: "qualified", devis: "quoted", chantier: "won", perdu: "lost",
};

export default function KanbanBoard({ requests }: { requests: RequestRow[] }) {
  const [items, setItems] = useState<RequestRow[]>(requests);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [, start] = useTransition();

  function move(id: string, stage: Stage) {
    if (stage === "incomplete") return;
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status: STATUS_FOR[stage], completion_token: null } : r)));
    start(() => moveRequestStage(id, stage));
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {COLUMNS.map((col) => {
        const cards = items.filter((r) => stageOf(r) === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => { if (col.droppable) { e.preventDefault(); setOver(col.key); } }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId && col.droppable) move(dragId, col.key); }}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border p-2 transition ${over === col.key ? "border-accent bg-accent-soft/40" : "border-line bg-subtle/40"}`}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.accent}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="rounded-full bg-card px-1.5 text-xs text-ink-soft">{cards.length}</span>
              </div>
            </div>
            <div className="mb-2 px-2 text-[11px] text-ink-soft">{col.hint}</div>

            <div className="flex min-h-[60px] flex-1 flex-col gap-2">
              {cards.map((r) => (
                <Card key={r.id} r={r} onDragStart={() => setDragId(r.id)} onDragEnd={() => setDragId(null)} />
              ))}
              {cards.length === 0 && (
                <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-ink-soft/60">
                  {col.droppable ? "Déposez ici" : "Vide"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ r, onDragStart, onDragEnd }: { r: RequestRow; onDragStart: () => void; onDragEnd: () => void }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group cursor-grab rounded-xl border border-line bg-card p-3 shadow-sm transition hover:border-accent active:cursor-grabbing"
    >
      <Link href={`/dashboard/${r.id}`} className="text-sm font-medium hover:text-accent">
        {r.client_nom ?? r.client_email ?? "—"}
      </Link>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sourceClass(r.source)}`}>
          {sourceLabel(r.source)}
        </span>
        {isIncomplete(r) ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Incomplète</span>
        ) : (
          <span className="rounded-full bg-good/15 px-1.5 py-0.5 text-[10px] font-medium text-good">Complète</span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-ink-soft">
        {r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="tabular-nums text-ink-soft">{r.volume_m3 != null ? `${r.volume_m3} m³` : "— m³"}</span>
        {r.estimation_prix != null && <span className="font-medium tabular-nums">{Math.round(r.estimation_prix)} €</span>}
      </div>
    </div>
  );
}
