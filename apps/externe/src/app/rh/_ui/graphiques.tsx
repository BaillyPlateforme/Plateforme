"use client";

import { useState, type CSSProperties } from "react";
import { ETAPE_RH, type CleEtapeRh } from "@/lib/rh-modele";
import { euro, euroCompact, moisCourt, moisLong, type MoisBudget } from "../calculs";

/*
 * Les graphiques de l'espace RH. Une règle par graphique, prise au guide de
 * visualisation (skill dataviz) :
 *  - une seule série → une seule couleur, celle de l'entreprise, sans légende ;
 *  - signé / en attente de signature → l'accent de l'entreprise et un gris
 *    neutre (forme « mise en avant »), séparés par un liseré de 2 px ;
 *  - barres de 24 px au plus, bout arrondi de 4 px, base carrée ; grilles en
 *    filet plein ; textes en couleurs de texte, jamais en couleur de série ;
 *  - chaque valeur se lit aussi sans survol (étiquette, tableau).
 */

/** Le gris des montants en attente de signature (jeton --chart-5 de la marque). */
export const GRIS_ATTENTE = "#9d9aa3";

/* ─────────────────────────── Les mobilités par étape ─────────────────────────── */

export function BarresEtapes({ lignes, onChoisir }: { lignes: { cle: CleEtapeRh; n: number }[]; onChoisir?: (cle: CleEtapeRh) => void }) {
  const max = Math.max(1, ...lignes.map((l) => l.n));
  return (
    <ol className="space-y-2.5">
      {lignes.map((l, i) => (
        <li key={l.cle}>
          <button
            type="button"
            onClick={() => onChoisir?.(l.cle)}
            title={ETAPE_RH[l.cle].aide}
            className="group grid w-full grid-cols-[22px_minmax(0,128px)_minmax(0,1fr)_28px] items-center gap-3 rounded-[12px] px-1.5 py-1 text-left transition hover:bg-subtle sm:grid-cols-[22px_150px_minmax(0,1fr)_32px]"
          >
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-subtle text-[11px] font-bold text-ink-mid tabular-nums">{i + 1}</span>
            <span className={`truncate text-[13.5px] ${l.n ? "font-semibold text-ink" : "text-ink-soft"}`}>{ETAPE_RH[l.cle].label}</span>
            <span className="relative h-[18px]">
              <span className="absolute inset-y-0 left-0 right-0 my-auto h-px bg-line" />
              {l.n > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand transition-[width] duration-700 group-hover:bg-brand-mid"
                  style={{ width: `${Math.max(4, (l.n / max) * 100)}%` }}
                />
              )}
            </span>
            <span className={`text-right text-[14px] font-bold tabular-nums ${l.n ? "text-ink" : "text-ink-soft"}`}>{l.n}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────────────────── Le budget, mois par mois ─────────────────────────── */

export function ColonnesMois({ serie, courant }: { serie: MoisBudget[]; courant: string }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  const max = Math.max(1, ...serie.map((m) => m.signe + m.attente));
  // Trois graduations rondes : 0, la moitié, le haut.
  const pas = (() => {
    const brut = max / 3;
    const p = 10 ** Math.floor(Math.log10(brut));
    return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= brut) ?? brut;
  })();
  const haut = Math.max(pas, Math.ceil(max / pas) * pas);
  const graduations = Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => i * pas);
  const s = survol != null ? serie[survol] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-mid">
          <li className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px] bg-brand" /> Signé
          </li>
          <li className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: GRIS_ATTENTE }} /> En attente de signature
          </li>
        </ul>
        <button type="button" onClick={() => setTableau((t) => !t)} className="text-[12.5px] font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          {tableau ? "Voir le graphique" : "Voir en tableau"}
        </button>
      </div>

      {tableau ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                <th className="py-2 font-semibold">Mois</th>
                <th className="py-2 text-right font-semibold">Signé HT</th>
                <th className="py-2 text-right font-semibold">En attente HT</th>
                <th className="py-2 text-right font-semibold">Mobilités</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((m) => (
                <tr key={m.cle} className="border-b border-line last:border-0">
                  <td className="py-2 capitalize">{moisLong(m.cle)}</td>
                  <td className="py-2 text-right tabular-nums">{m.signe ? euro(m.signe) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{m.attente ? euro(m.attente) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{m.n || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
            {/* L'axe des montants */}
            <div className="relative h-[220px]">
              {graduations.map((g) => (
                <span key={g} className="absolute right-0 text-[10.5px] tabular-nums text-ink-soft" style={{ bottom: `${(g / haut) * 100}%`, transform: "translateY(50%)" }}>
                  {g === 0 ? "0" : euroCompact(g).replace(" €", "")}
                </span>
              ))}
            </div>
            <div className="relative h-[220px]">
              {graduations.map((g) => (
                <span key={g} aria-hidden className={`absolute inset-x-0 h-px ${g === 0 ? "bg-line-strong" : "bg-line"}`} style={{ bottom: `${(g / haut) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex items-end">
                {serie.map((m, i) => {
                  const total = m.signe + m.attente;
                  const libelle = `${moisLong(m.cle)} : ${total ? `${euro(total)} HT, dont ${euro(m.signe)} signés` : "aucun montant"}`;
                  return (
                    <div
                      key={m.cle}
                      role="img"
                      tabIndex={0}
                      aria-label={libelle}
                      onPointerEnter={() => setSurvol(i)}
                      onPointerLeave={() => setSurvol(null)}
                      onFocus={() => setSurvol(i)}
                      onBlur={() => setSurvol(null)}
                      className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none ${survol === i ? "bg-subtle/70" : ""} rounded-t-[6px] focus-visible:ring-2 focus-visible:ring-ink`}
                    >
                      <div className="flex w-[62%] max-w-[24px] flex-col justify-end gap-[2px]" style={{ height: `${(total / haut) * 100}%` }}>
                        {m.attente > 0 && <span className="w-full rounded-t-[4px]" style={{ flexGrow: m.attente, background: GRIS_ATTENTE, minHeight: 2 }} />}
                        {m.signe > 0 && <span className={`w-full bg-brand ${m.attente > 0 ? "" : "rounded-t-[4px]"}`} style={{ flexGrow: m.signe, minHeight: 2 }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Les mois */}
          <div className="ml-[52px] mt-2 flex">
            {serie.map((m, i) => (
              // Sur téléphone, un mois sur deux : douze libellés ne tiennent pas dans 300 px.
              <span
                key={m.cle}
                className={`min-w-0 flex-1 truncate text-center text-[11px] ${m.cle === courant ? "font-bold text-ink" : "text-ink-soft"} ${i % 2 && m.cle !== courant ? "invisible sm:visible" : ""}`}
              >
                {moisCourt(m.cle)}
              </span>
            ))}
          </div>
          {s && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 w-[200px] rounded-[14px] border border-line bg-card px-3.5 py-3 text-[12.5px] shadow-[0_18px_40px_-20px_rgba(27,26,24,0.45)]"
              style={{ left: `clamp(0px, calc(52px + ${((survol! + 0.5) / serie.length) * 100}% - 100px), calc(100% - 200px))` } as CSSProperties}
            >
              <div className="font-semibold capitalize">{moisLong(s.cle)}</div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-soft">
                  <span className="h-[3px] w-3 rounded-full bg-brand" /> Signé
                </span>
                <span className="font-semibold tabular-nums">{euro(s.signe)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-soft">
                  <span className="h-[3px] w-3 rounded-full" style={{ background: GRIS_ATTENTE }} /> En attente
                </span>
                <span className="font-semibold tabular-nums">{euro(s.attente)}</span>
              </div>
              <div className="mt-1.5 border-t border-line pt-1.5 text-ink-soft">
                {s.n} mobilité{s.n > 1 ? "s" : ""} · montants HT
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Barres horizontales d'une seule série ─────────────────────────── */

export function BarresSimples({ lignes, format = euro }: { lignes: { label: string; valeur: number; note?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...lignes.map((l) => l.valeur));
  return (
    <ul className="space-y-4">
      {lignes.map((l) => (
        <li key={l.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="truncate font-semibold">{l.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-bold">{format(l.valeur)}</span>
              {l.note && <span className="text-ink-soft"> · {l.note}</span>}
            </span>
          </div>
          <div className="relative mt-2 h-[14px]">
            <span className="absolute inset-y-0 my-auto h-px w-full bg-line" />
            {l.valeur > 0 && <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand" style={{ width: `${Math.max(2, (l.valeur / max) * 100)}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
