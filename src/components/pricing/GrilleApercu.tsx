"use client";

import Link from "next/link";
import { useState } from "react";
import GrilleTable from "./GrilleTable";
import PrestationsTable from "./PrestationsTable";
import { FORMULES, SUPPLEMENTS, TVA_DEFAUT, type Formule } from "@/lib/pricing/grille";

const SUPPLEMENTS_LISTE: { label: string; base: string; prix: string }[] = [
  {
    label: "Voyage spécial",
    base: "date imposée par le client",
    prix: `+${Math.round(SUPPLEMENTS.voyageSpecialPct * 100)} % du transport`,
  },
  {
    label: "Portage",
    base: `au-delà de ${SUPPLEMENTS.portage.seuilMetres} m, par tranche de ${SUPPLEMENTS.portage.trancheMetres} m`,
    prix: `${SUPPLEMENTS.portage.prixParM3} € / m³`,
  },
  {
    label: "Transbordement",
    base: `camion porteur inaccessible · seuil ${SUPPLEMENTS.transbordement.seuilM3} m³`,
    prix: `${SUPPLEMENTS.transbordement.demiJournee} € la demi-journée, ${SUPPLEMENTS.transbordement.journee} € la journée`,
  },
  {
    label: "Monte-meubles avec opérateur",
    base: `absence d'ascenseur ou escalier complexe · seuil ${SUPPLEMENTS.monteMeubles.seuilM3} m³`,
    prix: `${SUPPLEMENTS.monteMeubles.demiJournee} € la demi-journée, ${SUPPLEMENTS.monteMeubles.journee} € la journée`,
  },
  { label: "Piano droit", base: "hors réaccordage, rez-de-chaussée", prix: `${SUPPLEMENTS.pianoDroit} €` },
  {
    label: "Charge lourde",
    base: "80 à 150 kg : aquarium, frigo américain, coffre-fort",
    prix: `${SUPPLEMENTS.chargeLourde} €`,
  },
  {
    label: "Garantie nationale",
    base: `valeur déclarée · franchise ${SUPPLEMENTS.assurance.franchise} €`,
    prix: `${(SUPPLEMENTS.assurance.taux * 100).toFixed(1).replace(".", ",")} % de la valeur`,
  },
  { label: "Frais de stationnement", base: "formalités de stationnement", prix: "sur justificatif" },
];

/** Vue en lecture de la grille : ce que le moteur applique, sans rien pouvoir casser. */
export default function GrilleApercu() {
  const [formule, setFormule] = useState<Formule>("standard");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {FORMULES.map((f) => (
              <button
                key={f.key}
                onClick={() => setFormule(f.key)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  formule === f.key
                    ? "bg-accent-soft font-medium text-accent-dark"
                    : "text-ink-soft hover:bg-subtle hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Link
            href="/dashboard/simulateur"
            className="rounded-lg border border-line-strong bg-card px-3 py-1.5 text-sm transition hover:border-ink"
          >
            Ouvrir le simulateur
          </Link>
        </div>
        <GrilleTable formule={formule} />
      </div>

      <div className="rounded-2xl border border-line bg-card p-5">
        <h4 className="eyebrow mb-4 text-ink-soft">Suppléments</h4>
        <div className="divide-y divide-line">
          {SUPPLEMENTS_LISTE.map((s) => (
            <div key={s.label} className="flex items-baseline justify-between gap-6 py-2.5">
              <div>
                <div className="text-sm">{s.label}</div>
                <div className="text-[11.5px] text-ink-soft">{s.base}</div>
              </div>
              <div className="shrink-0 text-sm tnum">{s.prix}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] text-ink-soft">
          Tous les montants sont hors taxes. TVA appliquée par défaut : {TVA_DEFAUT} %.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5">
        <h4 className="eyebrow mb-4 text-ink-soft">Contenu des formules</h4>
        <PrestationsTable highlight={formule} />
      </div>
    </div>
  );
}
