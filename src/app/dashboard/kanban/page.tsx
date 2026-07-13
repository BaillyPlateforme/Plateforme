import { listRequests } from "@/lib/requests";
import KanbanBoard from "../KanbanBoard";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  let requests: RequestRow[] = [];
  try {
    requests = await listRequests();
  } catch {
    /* vide */
  }

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="eyebrow text-ink-soft">Pilotage</div>
        <h1 className="mt-1 font-serif text-4xl">Kanban</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Le cycle de vie des demandes — glissez les cartes d&apos;une étape à l&apos;autre.
        </p>
      </header>
      <KanbanBoard requests={requests} />
    </div>
  );
}
