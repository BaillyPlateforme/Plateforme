import { listRequests } from "@/lib/requests";
import AgendaClient from "./AgendaClient";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const requests = await listRequests();
  const events = requests
    .filter((r) => r.date_souhaitee)
    .map((r) => ({
      id: r.id,
      date: r.date_souhaitee as string,
      client: r.client_nom ?? "—",
      trajet: `${r.depart_ville ?? "?"} → ${r.arrivee_ville ?? "?"}`,
      volume: r.volume_m3,
    }));

  return (
    <div className="px-6 py-8 md:px-10">
      <AgendaClient events={events} />
    </div>
  );
}
