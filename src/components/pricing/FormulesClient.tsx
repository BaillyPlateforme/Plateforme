"use client";

import { Fragment } from "react";
import { FORMULES, PRESTATIONS } from "@/lib/pricing/grille";

/**
 * Les trois formules côte à côte, sur une page — la demande du client.
 *
 * Le tableau est celui de l'onglet « prestations » de sa grille : une ligne
 * par geste du déménagement, une colonne par formule, et une coche quand
 * Bailly s'en charge. Ce qui n'est pas coché reste au client : c'est dit une
 * fois en bas, plutôt que répété quarante fois dans les cases.
 */
export default function FormulesClient() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="grid grid-cols-[1.6fr_repeat(3,minmax(0,1fr))] border-b border-line bg-subtle/60">
        <div className="px-4 py-3 text-[12px] font-medium text-ink-soft">Ce que nous prenons en charge</div>
        {FORMULES.map((f) => (
          <div key={f.key} className="border-l border-line px-3 py-3 text-center">
            <div className="text-[13.5px] font-semibold uppercase tracking-wide">{f.label}</div>
            <div className="mt-1 text-[11px] leading-snug text-ink-soft">{f.description}</div>
          </div>
        ))}
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {PRESTATIONS.map((cat) => (
          <Fragment key={cat.categorie}>
            <div className="bg-paper px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {cat.categorie}
            </div>
            {cat.lignes.map((l) => (
              <div
                key={`${cat.categorie}-${l.label}`}
                className="grid grid-cols-[1.6fr_repeat(3,minmax(0,1fr))] border-t border-line/70"
              >
                <div className="px-4 py-2 text-[13px]">{l.label}</div>
                {[l.eco, l.standard, l.luxe].map((acteur, i) => (
                  <div key={i} className="flex items-center justify-center border-l border-line/70 py-2">
                    {acteur === "Bailly" ? (
                      <span className="text-accent" aria-label="pris en charge par Bailly">
                        <Coche />
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-soft" aria-label="à votre charge">
                        —
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </Fragment>
        ))}
      </div>

      <p className="border-t border-line px-4 py-3 text-[12px] text-ink-soft">
        <span className="text-accent">✓</span> pris en charge par Bailly · <span>—</span> reste à votre
        charge. Le prix dépend ensuite du volume et de la distance.
      </p>
    </div>
  );
}

function Coche() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
