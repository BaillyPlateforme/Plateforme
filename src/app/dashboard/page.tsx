import Link from "next/link";
import { listRequests } from "@/lib/requests";
import type { RequestRow } from "@/lib/types";

// Données live : pas de pré-rendu statique (dépend de la base).
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "Nouvelle",
  analyzing: "En analyse",
  qualified: "Qualifiée",
  quoted: "Devis envoyé",
  won: "Gagnée",
  lost: "Perdue",
  archived: "Archivée",
};

function Score({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <span className="text-neutral-400">—</span>;
  return (
    <span title={label} className="tabular-nums">
      {value}
    </span>
  );
}

export default async function DashboardPage() {
  let requests: RequestRow[] = [];
  let error: string | null = null;
  try {
    requests = await listRequests();
  } catch (e) {
    error = e instanceof Error ? e.message : "Erreur inconnue";
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Demandes</h1>
          <p className="text-sm text-neutral-500">
            {requests.length} demande{requests.length > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Impossible de charger les demandes : {error}
          <br />
          <span className="text-amber-600">
            Vérifie tes variables Supabase dans <code>.env.local</code>.
          </span>
        </div>
      )}

      {!error && requests.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-neutral-500">
          Aucune demande pour l&apos;instant.
        </div>
      )}

      {requests.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Trajet</th>
                <th className="px-4 py-3 font-medium">Volume</th>
                <th className="px-4 py-3 font-medium">Potentiel</th>
                <th className="px-4 py-3 font-medium">Difficulté</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/${r.id}`} className="font-medium hover:underline">
                      {r.client_nom ?? "—"}
                    </Link>
                    <div className="text-xs text-neutral-400">{r.client_email}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.volume_m3 != null ? `${r.volume_m3} m³` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Score value={r.score_potentiel} label="Potentiel" />
                  </td>
                  <td className="px-4 py-3">
                    <Score value={r.score_difficulte} label="Difficulté" />
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{r.source}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
