"use client";

import { Fragment } from "react";
import { FORMULES, PRESTATIONS, type Acteur, type Formule } from "@/lib/pricing/grille";

const TON: Record<string, string> = {
  Bailly: "bg-accent-soft text-accent-dark",
  Client: "bg-subtle text-ink-soft",
};

function Cell({ acteur, actif }: { acteur: Acteur; actif: boolean }) {
  if (!acteur) return <td className="px-3 py-1.5" />;
  return (
    <td className="px-3 py-1.5 text-center">
      <span
        className={`inline-flex min-w-16 justify-center rounded-md px-2 py-0.5 text-[11.5px] font-medium ${TON[acteur] ?? ""} ${
          actif ? "ring-1 ring-accent/30" : ""
        }`}
      >
        {acteur}
      </span>
    </td>
  );
}

/** Qui fait quoi dans chaque formule — la matrice du fichier « Catégories prestations ». */
export default function PrestationsTable({ highlight }: { highlight?: Formule | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <th className="px-3 py-2 text-left font-medium text-ink-soft">Prestation</th>
            {FORMULES.map((f) => (
              <th
                key={f.key}
                className={`px-3 py-2 text-center font-medium ${
                  highlight === f.key ? "text-accent-dark" : "text-ink-soft"
                }`}
              >
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PRESTATIONS.map((cat) => (
            <Fragment key={cat.categorie}>
              <tr className="bg-subtle/60">
                <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  {cat.categorie}
                </td>
              </tr>
              {cat.lignes.map((l) => (
                <tr key={`${cat.categorie}-${l.label}`} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink">{l.label}</td>
                  <Cell acteur={l.eco} actif={highlight === "eco"} />
                  <Cell acteur={l.standard} actif={highlight === "standard"} />
                  <Cell acteur={l.luxe} actif={highlight === "luxe"} />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
