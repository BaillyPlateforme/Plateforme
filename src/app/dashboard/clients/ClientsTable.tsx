"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientSummary } from "@/lib/clients";

export default function ClientsTable({ clients }: { clients: ClientSummary[] }) {
  const [q, setQ] = useState("");
  const rows = clients.filter(
    (c) =>
      !q.trim() ||
      [c.nom, c.email, c.societe].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-12 text-center text-ink-soft">
        Aucun client pour l&apos;instant.
      </div>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un client…"
        className="mb-4 w-72 rounded-lg border border-line bg-card px-3.5 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Société</th>
              <th className="px-4 py-3 text-right font-medium">Demandes</th>
              <th className="px-4 py-3 text-right font-medium">Volume</th>
              <th className="px-4 py-3 text-right font-medium">CA potentiel</th>
              <th className="px-4 py-3 text-right font-medium">Dernière activité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((c) => (
              <tr key={c.email} className="hover:bg-accent-soft/20">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/clients/${encodeURIComponent(c.email)}`}
                    className="font-medium hover:text-accent"
                  >
                    {c.nom ?? c.email}
                  </Link>
                  <div className="text-xs text-ink-soft">{c.email}</div>
                  {c.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full bg-subtle px-2 py-0.5 text-[10px]">{t}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-soft">{c.societe ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.nb_demandes}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.volume_total} m³</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {c.ca_potentiel.toLocaleString("fr-FR")} €
                </td>
                <td className="px-4 py-3 text-right text-xs text-ink-soft">
                  {new Date(c.derniere_activite).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
