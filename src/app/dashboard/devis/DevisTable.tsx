"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { DevisRow, DevisStatus } from "@/lib/types";
import { updateDevisStatus, deleteDevis } from "@/lib/actions/devis";

export const DEVIS_STATUS: Record<DevisStatus, { label: string; className: string }> = {
  brouillon: { label: "Brouillon", className: "bg-subtle text-ink-soft" },
  envoye: { label: "Envoyé", className: "bg-blue-100 text-blue-800" },
  accepte: { label: "Accepté", className: "bg-accent-soft text-accent-dark" },
  refuse: { label: "Refusé", className: "bg-neutral-200 text-neutral-600" },
  expire: { label: "Expiré", className: "bg-amber-100 text-amber-800" },
};
const ORDER: DevisStatus[] = ["brouillon", "envoye", "accepte", "refuse", "expire"];

export default function DevisTable({ devis }: { devis: DevisRow[] }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");

  const rows = devis.filter(
    (d) =>
      !q.trim() ||
      [d.reference, d.client_nom, d.client_email].some((v) =>
        (v ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
  );

  if (devis.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-12 text-center text-ink-soft">
        Aucun devis. Générez-en un depuis la fiche d&apos;une demande (onglet Devis).
      </div>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher une référence, un client…"
        className="mb-4 w-72 rounded-lg border border-line bg-card px-3.5 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Référence</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 text-right font-medium">HT</th>
              <th className="px-4 py-3 text-right font-medium">TTC</th>
              <th className="px-4 py-3 font-medium">Validité</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-accent-soft/20">
                <td className="px-4 py-3">
                  {d.request_id ? (
                    <Link href={`/dashboard/${d.request_id}`} className="font-medium hover:text-accent">
                      {d.reference}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.reference}</span>
                  )}
                  <div className="text-xs text-ink-soft">
                    {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {d.client_nom ?? "—"}
                  <div className="text-xs text-ink-soft">{d.client_email}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                  {Math.round(d.montant_ht).toLocaleString("fr-FR")} €
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {Math.round(d.montant_ttc).toLocaleString("fr-FR")} €
                </td>
                <td className="px-4 py-3 text-xs text-ink-soft">
                  {d.valid_until ? new Date(d.valid_until).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={d.status}
                    disabled={pending}
                    onChange={(e) => start(() => updateDevisStatus(d.id, e.target.value as DevisStatus))}
                    className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${DEVIS_STATUS[d.status].className}`}
                  >
                    {ORDER.map((s) => (
                      <option key={s} value={s}>{DEVIS_STATUS[s].label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => start(() => deleteDevis(d.id))}
                    disabled={pending}
                    className="text-xs text-ink-soft transition hover:text-accent"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
