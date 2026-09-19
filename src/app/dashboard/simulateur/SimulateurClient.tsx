"use client";

import { useMemo, useState } from "react";
import GrilleTable from "@/components/pricing/GrilleTable";
import PrestationsTable from "@/components/pricing/PrestationsTable";
import { simuler, type SimulationInput } from "@/lib/pricing/engine";
import { FORMULES, SUPPLEMENTS, TVA_DEFAUT } from "@/lib/pricing/grille";

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const nb = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const CAS_TYPES: { label: string; input: Partial<SimulationInput> }[] = [
  { label: "T2 Paris → Nantes", input: { volume_m3: 22, distance_km: 385, formule: "standard" } },
  { label: "Studio, même ville", input: { volume_m3: 8, distance_km: 15, formule: "eco" } },
  { label: "Maison 120 m², longue distance", input: { volume_m3: 55, distance_km: 720, formule: "standard" } },
  {
    label: "Premium avec monte-meubles",
    input: { volume_m3: 35, distance_km: 120, formule: "luxe", monte_meubles: 1, valeur_declaree: 60000 },
  },
];

export default function SimulateurClient() {
  const [input, setInput] = useState<SimulationInput>({
    formule: "standard",
    volume_m3: 22,
    distance_km: 385,
    voyage_special: false,
    portage_depart_m: 0,
    portage_arrivee_m: 0,
    transbordement: false,
    monte_meubles: 0,
    piano_droit: 0,
    charges_lourdes: 0,
    valeur_declaree: 0,
    tva: TVA_DEFAUT,
  });
  const [ongletGrille, setOngletGrille] = useState<"grille" | "prestations">("grille");

  const set = (patch: Partial<SimulationInput>) => setInput((i) => ({ ...i, ...patch }));

  const sim = useMemo(() => simuler(input), [input]);

  // Le même chantier dans les trois formules : sert à arbitrer avec le client.
  const comparatif = useMemo(
    () => FORMULES.map((f) => ({ ...f, sim: simuler({ ...input, formule: f.key }) })),
    [input],
  );

  return (
    <div className="space-y-6">
      {/* Cas types : pour vérifier le moteur en un clic */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 text-ink-soft">Cas types</span>
        {CAS_TYPES.map((c) => (
          <button
            key={c.label}
            onClick={() => set({ ...c.input })}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-xs text-ink-soft transition hover:border-accent hover:text-accent-dark"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_1fr]">
        {/* ---------------- Paramètres ---------------- */}
        <div className="space-y-4">
          <Card title="Chantier">
            <div className="mb-4 grid grid-cols-3 gap-2">
              {FORMULES.map((f) => (
                <button
                  key={f.key}
                  onClick={() => set({ formule: f.key })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    input.formule === f.key
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-paper hover:border-line-strong"
                  }`}
                >
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="mt-0.5 text-[11px] text-ink-soft">
                    ×{f.key === "standard" ? "1" : f.key === "eco" ? "0,92" : "1,15"}
                  </div>
                </button>
              ))}
            </div>

            <Slider
              label="Volume"
              unit="m³"
              value={input.volume_m3}
              min={1}
              max={120}
              step={1}
              onChange={(v) => set({ volume_m3: v })}
            />
            <Slider
              label="Distance"
              unit="km"
              value={input.distance_km}
              min={0}
              max={1300}
              step={5}
              onChange={(v) => set({ distance_km: v })}
            />
          </Card>

          <Card title="Suppléments">
            <Toggle
              label="Voyage spécial"
              hint={`date imposée · +${Math.round(SUPPLEMENTS.voyageSpecialPct * 100)} %`}
              value={!!input.voyage_special}
              onChange={(v) => set({ voyage_special: v })}
            />
            <Toggle
              label="Transbordement"
              hint={`${SUPPLEMENTS.transbordement.demiJournee} € ou ${SUPPLEMENTS.transbordement.journee} € au-delà de ${SUPPLEMENTS.transbordement.seuilM3} m³`}
              value={!!input.transbordement}
              onChange={(v) => set({ transbordement: v })}
            />
            <Num
              label="Portage au départ"
              unit="m"
              hint={`gratuit jusqu'à ${SUPPLEMENTS.portage.seuilMetres} m`}
              value={input.portage_depart_m ?? 0}
              onChange={(v) => set({ portage_depart_m: v })}
            />
            <Num
              label="Portage à l'arrivée"
              unit="m"
              value={input.portage_arrivee_m ?? 0}
              onChange={(v) => set({ portage_arrivee_m: v })}
            />
            <Num
              label="Monte-meubles"
              unit="×"
              hint={`${SUPPLEMENTS.monteMeubles.demiJournee} € la demi-journée`}
              value={input.monte_meubles ?? 0}
              onChange={(v) => set({ monte_meubles: v })}
            />
            <Num
              label="Piano droit"
              unit="×"
              hint={`${SUPPLEMENTS.pianoDroit} €`}
              value={input.piano_droit ?? 0}
              onChange={(v) => set({ piano_droit: v })}
            />
            <Num
              label="Charges lourdes"
              unit="×"
              hint={`${SUPPLEMENTS.chargeLourde} € · 80 à 150 kg`}
              value={input.charges_lourdes ?? 0}
              onChange={(v) => set({ charges_lourdes: v })}
            />
            <Num
              label="Valeur déclarée"
              unit="€"
              step={1000}
              hint={`garantie ${(SUPPLEMENTS.assurance.taux * 100).toFixed(1).replace(".", ",")} %`}
              value={input.valeur_declaree ?? 0}
              onChange={(v) => set({ valeur_declaree: v })}
            />
            <Num
              label="TVA"
              unit="%"
              value={input.tva ?? TVA_DEFAUT}
              onChange={(v) => set({ tva: v })}
            />
          </Card>
        </div>

        {/* ---------------- Résultat ---------------- */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-card p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="eyebrow text-ink-soft">Total TTC</div>
                <div className="font-serif text-[44px] leading-none tnum">{eur(sim.ttc)}</div>
                <div className="mt-1.5 text-sm text-ink-soft tnum">
                  {eur(sim.ht)} HT · TVA {eur(sim.tva)}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-paper px-4 py-3 text-[12.5px] text-ink-soft">
                <div className="tnum">
                  <span className="font-medium text-ink">{nb(sim.tarif_m3)} €/m³</span> appliqué
                </div>
                <div className="mt-0.5">
                  {sim.tranche_volume} · {sim.tranche_distance}
                </div>
                {sim.coefficient !== 1 && (
                  <div className="mt-0.5 tnum">
                    {nb(sim.tarif_m3_standard)} € standard × {nb(sim.coefficient)}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 divide-y divide-line border-t border-line">
              {sim.lines.map((l, i) => (
                <div key={i} className="flex items-baseline justify-between gap-6 py-2.5">
                  <div>
                    <div className="text-sm">{l.label}</div>
                    {l.detail && <div className="text-[11.5px] text-ink-soft">{l.detail}</div>}
                  </div>
                  <div className="shrink-0 text-sm tnum">{eur(l.amount)}</div>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
                <span className="text-ink-soft">
                  Transport {eur(sim.transport)} · suppléments {eur(sim.supplements)}
                </span>
                <span className="font-medium tnum">{eur(sim.ht)} HT</span>
              </div>
            </div>

            {sim.alertes.length > 0 && (
              <ul className="mt-4 space-y-1.5 rounded-xl border border-warn/30 bg-warn/5 p-3.5 text-[12.5px] text-ink">
                {sim.alertes.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                    {a}
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-3 space-y-1 text-[11.5px] text-ink-soft">
              {sim.mentions.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>

          {/* Comparatif des trois formules */}
          <div className="grid gap-3 sm:grid-cols-3">
            {comparatif.map((c) => {
              const actif = c.key === input.formule;
              const ecart = c.sim.ttc - sim.ttc;
              return (
                <button
                  key={c.key}
                  onClick={() => set({ formule: c.key })}
                  className={`rounded-2xl border p-4 text-left transition ${
                    actif ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-line-strong"
                  }`}
                >
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="mt-1 font-serif text-2xl tnum">{eur(c.sim.ttc)}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-soft tnum">
                    {ecart === 0 ? "formule retenue" : `${ecart > 0 ? "+" : ""}${eur(ecart)}`}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-snug text-ink-soft">{c.description}</p>
                </button>
              );
            })}
          </div>

          {/* Lecture de la grille */}
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="mb-4 flex gap-1 border-b border-line">
              {(
                [
                  ["grille", "Grille appliquée"],
                  ["prestations", "Contenu des formules"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setOngletGrille(key)}
                  className={`relative px-3 py-2 text-sm transition ${
                    ongletGrille === key ? "font-medium text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {label}
                  {ongletGrille === key && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
                  )}
                </button>
              ))}
            </div>
            {ongletGrille === "grille" ? (
              <GrilleTable
                formule={input.formule}
                highlight={{ volume: sim.index_volume, distance: sim.index_distance }}
              />
            ) : (
              <PrestationsTable highlight={input.formule} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- petits composants ---------------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <h3 className="eyebrow mb-4 text-ink-soft">{title}</h3>
      {children}
    </div>
  );
}

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className="tnum text-sm font-medium">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}

function Num({
  label,
  unit,
  hint,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  unit: string;
  hint?: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2.5 flex items-center justify-between gap-3 last:mb-0">
      <span className="min-w-0">
        <span className="block text-sm leading-tight">{label}</span>
        {hint && <span className="block text-[11px] leading-tight text-ink-soft">{hint}</span>}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-24 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right text-sm tnum outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <span className="w-4 text-[11.5px] text-ink-soft">{unit}</span>
      </span>
    </label>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="mb-3 flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm leading-tight">{label}</span>
        {hint && <span className="block text-[11px] leading-tight text-ink-soft">{hint}</span>}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-accent" : "bg-line-strong"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
            value ? "left-4.5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
