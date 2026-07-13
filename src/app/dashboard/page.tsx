import { listRequests } from "@/lib/requests";
import DemandesView from "./DemandesView";
import type { RequestRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DemandesPage() {
  let requests: RequestRow[] = [];
  let error: string | null = null;
  try {
    requests = await listRequests();
  } catch (e) {
    error = e instanceof Error ? e.message : "Erreur inconnue";
  }

  const nouvelles = requests.filter((r) => r.status === "new").length;
  const volumeTotal = requests.reduce((s, r) => s + (r.volume_m3 ?? 0), 0);
  const potentielMoyen =
    requests.filter((r) => r.score_potentiel != null).length > 0
      ? Math.round(
          requests.reduce((s, r) => s + (r.score_potentiel ?? 0), 0) /
            requests.filter((r) => r.score_potentiel != null).length,
        )
      : null;

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-serif text-3xl">Demandes</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Toutes les demandes reçues, du formulaire comme des mails.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total" value={requests.length} />
        <Stat label="Nouvelles" value={nouvelles} accent />
        <Stat label="Volume cumulé" value={`${Math.round(volumeTotal)} m³`} />
        <Stat label="Potentiel moyen" value={potentielMoyen != null ? `${potentielMoyen}/100` : "—"} />
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : (
        <DemandesView requests={requests} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-accent/30 bg-accent-soft/40" : "border-line bg-card"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-serif text-2xl">{value}</div>
    </div>
  );
}
