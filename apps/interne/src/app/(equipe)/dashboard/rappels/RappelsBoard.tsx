"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { CarteRappel, StatutRappel } from "@/lib/rappels";
import { deplacerRappel } from "@/lib/actions/rappels";

const COLONNES: { key: StatutRappel; label: string; aide: string; pastille: string }[] = [
  { key: "a_rappeler", label: "À rappeler", aide: "Le client attend", pastille: "bg-brand" },
  { key: "en_cours", label: "En cours", aide: "Pris en charge", pastille: "bg-accent" },
  { key: "rappele", label: "Rappelé", aide: "Échange fait", pastille: "bg-good" },
  { key: "injoignable", label: "Injoignable", aide: "À retenter", pastille: "bg-warn" },
  { key: "clos", label: "Clos", aide: "Plus rien à faire", pastille: "bg-ink-soft" },
];

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Le ton de la pastille de priorité : chaud quand le dossier pèse. */
function tonPriorite(p: number) {
  if (p >= 70) return "bg-brand text-[#1b1a18]";
  if (p >= 40) return "bg-brand-soft text-brand-ink";
  return "bg-subtle text-ink-soft";
}

/** Depuis combien de temps la demande attend. */
function depuis(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return `il y a ${j} j`;
}

/**
 * Le tableau des rappels.
 *
 * Les cartes sont classées par priorité décroissante — le score de potentiel
 * figé au moment où le client a cliqué. On rappelle d'abord ce qui pèse.
 */
export default function RappelsBoard({ rappels }: { rappels: CarteRappel[] }) {
  const [items, setItems] = useState(rappels);
  const [dragId, setDragId] = useState<string | null>(null);
  const [survol, setSurvol] = useState<StatutRappel | null>(null);
  const [, start] = useTransition();

  function deplacer(id: string, statut: StatutRappel) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, statut } : r)));
    start(() => deplacerRappel(id, statut));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[18px] bg-card p-12 text-center">
        <p className="font-medium">Aucune demande de rappel</p>
        <p className="mt-1 text-sm text-ink-soft">
          Elles arrivent ici dès qu&apos;un client clique sur « Être rappelé » au bout de son
          estimation.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {COLONNES.map((col) => {
        const cartes = items
          .filter((r) => r.statut === col.key)
          .sort((a, b) => b.priorite - a.priorite || +new Date(a.created_at) - +new Date(b.created_at));
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(col.key);
            }}
            onDragLeave={() => setSurvol((o) => (o === col.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(null);
              if (dragId) deplacer(dragId, col.key);
            }}
            className={`flex w-[300px] shrink-0 flex-col rounded-2xl border p-2 transition ${
              survol === col.key ? "border-brand bg-brand-soft/50" : "border-line bg-subtle/40"
            }`}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.pastille}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="rounded-full bg-card px-1.5 text-xs text-ink-soft">{cartes.length}</span>
              </div>
              <span className="text-[11px] text-ink-soft">{col.aide}</span>
            </div>

            <div className="space-y-2">
              {cartes.map((r) => (
                <article
                  key={r.id}
                  draggable
                  onDragStart={() => setDragId(r.id)}
                  onDragEnd={() => setDragId(null)}
                  className="cursor-grab rounded-xl bg-card p-3 active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/${r.request_id}`}
                      className="min-w-0 text-[13.5px] font-medium transition hover:text-brand-ink"
                    >
                      {r.client_nom || r.client_email || "Client sans nom"}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tnum ${tonPriorite(r.priorite)}`}
                      title="Score de potentiel au moment de la demande"
                    >
                      {r.priorite}
                    </span>
                  </div>

                  {r.client_tel ? (
                    <a
                      href={`tel:${r.client_tel.replace(/\s/g, "")}`}
                      className="mt-1.5 block text-[13px] font-medium text-accent transition hover:text-accent-dark"
                    >
                      {r.client_tel}
                    </a>
                  ) : (
                    <p className="mt-1.5 text-[12.5px] text-danger">Pas de téléphone</p>
                  )}

                  <p className="mt-1.5 truncate text-[12px] text-ink-soft">
                    {r.depart_ville ?? "—"} → {r.arrivee_ville ?? "—"}
                    {r.volume_m3 != null ? ` · ${r.volume_m3} m³` : ""}
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
                    <span className="text-[12px] font-medium tnum">
                      {r.montant_ttc != null ? eur(r.montant_ttc) : "—"}
                    </span>
                    <span className="text-[11px] text-ink-soft">{depuis(r.created_at)}</span>
                  </div>

                  {r.creneau ? (
                    <p className="mt-1.5 text-[11.5px] text-brand-ink">Souhaite : {r.creneau}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
