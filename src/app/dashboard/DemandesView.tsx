"use client";

import { useState } from "react";
import type { RequestRow } from "@/lib/types";
import RequestsTable from "./RequestsTable";
import KanbanBoard from "./KanbanBoard";

export default function DemandesView({ requests }: { requests: RequestRow[] }) {
  const [view, setView] = useState<"kanban" | "liste">("kanban");

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5 text-sm">
          <button onClick={() => setView("kanban")} className={`rounded-md px-3 py-1.5 font-medium transition ${view === "kanban" ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>Kanban</button>
          <button onClick={() => setView("liste")} className={`rounded-md px-3 py-1.5 font-medium transition ${view === "liste" ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>Liste</button>
        </div>
      </div>
      {view === "kanban" ? <KanbanBoard requests={requests} /> : <RequestsTable requests={requests} />}
    </div>
  );
}
