"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RequestRow } from "@/lib/types";
import { STATUTS } from "@/crm/lib/format";
import { STATUS_META, scoreColor, sourceLabel, sourceClass, isIncomplete, ESPACE_CLASSE, espaceLabel, parcoursBadge, PARCOURS_CLASSE } from "@/app/(interne)/(coque)/dashboard/status";
import { demandeClose, libelleDemande, sousStatut, type DossierDeDemande } from "../demandes-commun";
import { lireFiltres, type EtapeDemande } from "./FiltresDemandes";

/** Le seuil du « fort potentiel » (l'ancienne vue Focus) : 70/100. */
export const SEUIL = 70;

/** L'étape d'une demande dans le Parcours : celle de son dossier s'il existe, sinon sa sous-étape. */
const etapeDe = (r: RequestRow, dossier: DossierDeDemande | undefined): Exclude<EtapeDemande, "all"> => (dossier ? "dossier" : sousStatut(r.status));

/**
 * Parcours › Analyse des demandes › Demandes : toutes les demandes du site,
 * filtrées et triées. Ses filtres (recherche, étape, origine, fort potentiel,
 * tri) sont dans la rangée basse du bandeau (FiltresDemandes) : l'adresse les
 * porte, la liste les lit là.
 *
 * Un seul statut par ligne, celui du parcours : une demande acceptée montre
 * l'étape de son dossier ; une autre, sa sous-étape de « Demande » — les
 * statuts « Devis envoyé » et « Gagnée » d'une demande sans dossier se lisent
 * « Qualifiée » (demandes-commun.ts).
 */
export default function ListeDemandes({ requests, dossiers }: { requests: RequestRow[]; dossiers: Record<string, DossierDeDemande> }) {
  const router = useRouter();
  const { q, etape, origine, tri, potentiel } = lireFiltres(useSearchParams());
  const filtres = !!(q.trim() || etape !== "all" || origine !== "all" || potentiel);

  const rows = useMemo(() => {
    let out = requests;
    if (etape !== "all") out = out.filter((r) => etapeDe(r, dossiers[r.id]) === etape);
    if (origine !== "all") out = out.filter((r) => r.source === origine);
    if (potentiel) out = out.filter((r) => (r.score_potentiel ?? 0) >= SEUIL && !demandeClose(r.status));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const chiffres = needle.replace(/[^0-9]/g, "");
      out = out.filter(
        (r) =>
          [r.client_nom, r.client_email, r.depart_ville, r.arrivee_ville, dossiers[r.id]?.ref].filter(Boolean).some((v) => v!.toLowerCase().includes(needle)) ||
          (chiffres.length >= 4 && (r.client_tel ?? "").replace(/[^0-9]/g, "").includes(chiffres)),
      );
    }
    const val = (r: RequestRow) =>
      tri === "date"
        ? new Date(r.created_at).getTime()
        : tri === "potentiel"
          ? r.score_potentiel ?? -1
          : tri === "difficulte"
            ? r.score_difficulte ?? -1
            : tri === "volume"
              ? r.volume_m3 ?? -1
              : r.estimation_prix ?? -1;
    return [...out].sort((a, b) => val(b) - val(a));
  }, [requests, dossiers, q, etape, origine, potentiel, tri]);

  return (
    <div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">{filtres ? "Aucune demande pour ces filtres." : "Aucune demande."}</div>
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
                <Th>Étape</Th>
                <Th right>Reçue</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((r) => {
                const dossier = dossiers[r.id];
                return (
                  <tr key={r.id} onClick={() => router.push(`/dashboard/${r.id}`)} className="group cursor-pointer transition hover:bg-accent-soft/20">
                    <td className="px-4 py-3">
                      <span className="font-medium group-hover:text-accent">{r.client_nom ?? "—"}</span>
                      <div className="text-xs text-ink-soft">{r.client_email}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sourceClass(r.source)}`}>{sourceLabel(r.source)}</span>
                        {r.espace_nom && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ESPACE_CLASSE}`}>{espaceLabel(r.espace_nom)}</span>}
                        {parcoursBadge(r) && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PARCOURS_CLASSE}`}>{parcoursBadge(r)}</span>}
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
                    <td className="px-4 py-3 text-right tabular-nums">{r.volume_m3 != null ? `${r.volume_m3} m³` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.estimation_prix != null ? `${Math.round(r.estimation_prix)} €` : "—"}</td>
                    <td className={`px-4 py-3 text-center font-medium tabular-nums ${scoreColor(r.score_potentiel)}`}>{r.score_potentiel ?? "—"}</td>
                    <td className={`px-4 py-3 text-center font-medium tabular-nums ${scoreColor(r.score_difficulte)}`}>{r.score_difficulte ?? "—"}</td>
                    <td className="px-4 py-3">
                      {dossier ? (
                        <span className="inline-flex flex-col">
                          <span className="w-fit whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent" title="Demande acceptée : l'étape de son dossier">
                            Dossier · {STATUTS[dossier.statut]?.label ?? dossier.statut}
                          </span>
                          <span className="mt-1 pl-1 text-[11px] text-ink-soft">{dossier.ref}</span>
                        </span>
                      ) : (
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_META[sousStatut(r.status)].className}`}>{libelleDemande(r.status)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-soft">
                      <div>{new Date(r.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</div>
                      <div className="text-[11px] text-ink-soft/70">{new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</div>
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
  return <th className={`px-4 py-3 font-medium ${right ? "text-right" : center ? "text-center" : "text-left"}`}>{children}</th>;
}
