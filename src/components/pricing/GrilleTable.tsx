"use client";

import {
  COEFFICIENTS,
  TARIFS_STANDARD,
  TRANCHES_DISTANCE,
  TRANCHES_VOLUME,
  type Formule,
} from "@/lib/pricing/grille";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/**
 * La matrice de la grille pour une formule, avec la cellule utilisée par
 * la simulation mise en évidence. C'est l'écran qui permet de vérifier,
 * d'un coup d'œil, que le moteur lit la bonne case.
 */
export default function GrilleTable({
  formule,
  highlight,
}: {
  formule: Formule;
  highlight?: { volume: number; distance: number } | null;
}) {
  const coef = COEFFICIENTS[formule];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-ink-soft">
              Distance ＼ Volume
            </th>
            {TRANCHES_VOLUME.map((t, i) => (
              <th
                key={t.label}
                className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                  highlight?.volume === i ? "text-accent-dark" : "text-ink-soft"
                }`}
              >
                {t.max === null ? "> 100" : `${t.min}–${t.max}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TARIFS_STANDARD.map((row, d) => (
            <tr key={TRANCHES_DISTANCE[d].label} className="border-t border-line">
              <th
                className={`sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 text-left font-normal ${
                  highlight?.distance === d ? "text-accent-dark" : "text-ink-soft"
                }`}
              >
                {TRANCHES_DISTANCE[d].label}
              </th>
              {row.map((v, iv) => {
                const actif = highlight?.distance === d && highlight?.volume === iv;
                return (
                  <td
                    key={iv}
                    className={`px-3 py-1.5 text-right tabular-nums transition ${
                      actif
                        ? "rounded-md bg-accent font-semibold text-white"
                        : highlight && (highlight.distance === d || highlight.volume === iv)
                          ? "bg-accent-soft/60 text-ink"
                          : "text-ink"
                    }`}
                  >
                    {nf.format(Math.round(v * coef * 100) / 100)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11.5px] text-ink-soft">
        Prix au m³, en euros HT.
        {coef !== 1 && ` Formule appliquée à ${nf.format(coef)} × le tarif standard.`}
      </p>
    </div>
  );
}
