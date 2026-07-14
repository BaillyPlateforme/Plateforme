import { listRequests } from "@/lib/requests";
import StatsTabs from "./StatsTabs";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StatistiquesPage() {
  let requests: RequestRow[] = [];
  try {
    requests = await listRequests();
  } catch {
    /* zéro */
  }

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <div className="eyebrow text-ink-soft">Pilotage</div>
        <h1 className="mt-1 font-serif text-4xl">Statistiques</h1>
        <p className="mt-1 text-sm text-ink-soft">Analyse complète du flux de demandes.</p>
      </header>
      <StatsTabs requests={requests} />
    </div>
  );
}
