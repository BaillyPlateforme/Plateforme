"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RequestRow } from "@/lib/types";
import type { Filtres } from "./FiltresDemandes";
import { STATUS_META, scoreColor, sourceLabel, sourceClass, isIncomplete, ESPACE_CLASSE, espaceLabel, parcoursBadge, PARCOURS_CLASSE } from "./status";

/**
 * La liste des demandes, filtrée et triée. Ses filtres (recherche, statut,
 * origine, tri) sont dans la rangée basse du bandeau (FiltresDemandes) :
 * l'adresse les porte, la page les lit et les passe ici.
 */
export default function RequestsTable({ requests, filtres }: { requests: RequestRow[]; filtres: Filtres }) {
  const router = useRouter();
  const { q, statut: status, origine, tri: sort } = filtres;

  const rows = useMemo(() => {
    let out = requests;
    if (status !== "all") out = out.filter((r) => r.status === status);
    if (origine !== "all") out = out.filter((r) => r.source === origine);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((r) =>
        [r.client_nom, r.client_email, r.depart_ville, r.arrivee_ville]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(needle)),
      );
    }
    const val = (r: RequestRow) =>
      sort === "date"
        ? new Date(r.created_at).getTime()
        : sort === "potentiel"
          ? r.score_potentiel ?? -1
          : sort === "difficulte"
            ? r.score_difficulte ?? -1
            : sort === "volume"
              ? r.volume_m3 ?? -1
              : r.estimation_prix ?? -1;
    return [...out].sort((a, b) => val(b) - val(a));
  }, [requests, q, status, origine, sort]);

  return (
    <div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">
          Aucune demande.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-[11.5px] font-medium text-ink-soft">
              <tr>
                <Th>Client</Th>
                <Th>Trajet</Th>
                <Th right>Volume</Th>
                <Th right>Estimation</Th>
                <Th center>Potentiel</Th>
                <Th center>Difficulté</Th>
                <Th>Statut</Th>
                <Th right>Reçue</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/dashboard/${r.id}`)}
                    className="group cursor-pointer transition hover:bg-accent-soft/20"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium group-hover:text-accent">
                        {r.client_nom ?? "—"}
                      </span>
                      <div className="text-xs text-ink-soft">{r.client_email}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sourceClass(r.source)}`}>
                          {sourceLabel(r.source)}
                        </span>
                        {r.espace_nom && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ESPACE_CLASSE}`}>{espaceLabel(r.espace_nom)}</span>
                        )}
                        {parcoursBadge(r) && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PARCOURS_CLASSE}`}>{parcoursBadge(r)}</span>
                        )}
                        {isIncomplete(r) ? (
                          <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn">Incomplète</span>
                        ) : (
                          <span className="rounded-full bg-good/15 px-1.5 py-0.5 text-[10px] font-medium text-good">Complète</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.volume_m3 != null ? `${r.volume_m3} m³` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.estimation_prix != null ? `${Math.round(r.estimation_prix)} €` : "—"}
                    </td>
                    <td className={`px-4 py-3 text-center font-medium tabular-nums ${scoreColor(r.score_potentiel)}`}>
                      {r.score_potentiel ?? "—"}
                    </td>
                    <td className={`px-4 py-3 text-center font-medium tabular-nums ${scoreColor(r.score_difficulte)}`}>
                      {r.score_difficulte ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-soft">
                      <div>{new Date(r.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</div>
                      <div className="text-[11px] text-ink-soft/70">
                        {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th
      className={`px-4 py-3 font-medium ${right ? "text-right" : center ? "text-center" : "text-left"}`}
    >
      {children}
    </th>
  );
}
