"use client";

import { useMemo, useState } from "react";
import type { PricingGridRow, RequestRow } from "@/lib/types";
import { estimateQuote } from "@/lib/quote";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import type { AnalyzedPhoto } from "@/components/PhotoAnalysisCard";

const round2 = (n: number) => Math.round(n * 100) / 100;

const SERVICE_KEYS: { key: keyof RequestRow["services"]; label: string }[] = [
  { key: "emballage", label: "Emballage" },
  { key: "demontage", label: "Démontage" },
  { key: "montage", label: "Montage" },
  { key: "monte_meuble", label: "Monte-meuble" },
  { key: "garde_meuble", label: "Garde-meuble" },
];

export default function PlaygroundClient({
  grids,
  library,
}: {
  grids: PricingGridRow[];
  library: LibraryPhoto[];
}) {
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);

  const [gridId, setGridId] = useState(grids.find((g) => g.is_default)?.id ?? grids[0]?.id);
  const [distance, setDistance] = useState("250");
  const [departEtage, setDepartEtage] = useState("2");
  const [departAsc, setDepartAsc] = useState(false);
  const [arriveeEtage, setArriveeEtage] = useState("0");
  const [arriveeAsc, setArriveeAsc] = useState(true);
  const [services, setServices] = useState<Record<string, boolean>>({ emballage: true });

  const totalVolume = round2(photos.reduce((s, p) => s + p.volume_m3, 0));
  const grid = grids.find((g) => g.id === gridId);

  const quote = useMemo(() => {
    if (!grid || photos.length === 0) return null;
    const fakeRequest = {
      volume_m3: totalVolume,
      distance_km: Number(distance) || 0,
      services: Object.fromEntries(Object.entries(services).filter(([, v]) => v)),
      depart_etage: Number(departEtage) || 0,
      depart_ascenseur: departAsc,
      arrivee_etage: Number(arriveeEtage) || 0,
      arrivee_ascenseur: arriveeAsc,
    } as unknown as RequestRow;
    return estimateQuote(fakeRequest, grid);
  }, [grid, photos.length, totalVolume, distance, services, departEtage, departAsc, arriveeEtage, arriveeAsc]);

  if (grids.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">
        Aucune grille active. Créez-en une dans « Configuration ».
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Bloc photo partagé (identique au formulaire) */}
      <PhotoAnalyzer library={library} photos={photos} onChange={setPhotos} showTotal={false} />

      {/* Paramètres + devis */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="eyebrow text-ink-soft">Chantier</h3>
            <span className="font-serif text-2xl">{totalVolume.toFixed(1)} m³</span>
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-sm text-ink-soft">Grille</span>
            <select
              value={gridId}
              onChange={(e) => setGridId(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {grids.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <NumRow label="Distance (km)" value={distance} onChange={setDistance} />
          <div className="grid grid-cols-2 gap-3">
            <NumRow label="Étage départ" value={departEtage} onChange={setDepartEtage} />
            <NumRow label="Étage arrivée" value={arriveeEtage} onChange={setArriveeEtage} />
          </div>
          <div className="mt-2 flex gap-4 text-sm">
            <Check label="Asc. départ" checked={departAsc} onChange={setDepartAsc} />
            <Check label="Asc. arrivée" checked={arriveeAsc} onChange={setArriveeAsc} />
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-sm text-ink-soft">Options</span>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_KEYS.map((s) => {
                const on = services[s.key as string];
                return (
                  <button
                    key={s.key as string}
                    onClick={() => setServices((prev) => ({ ...prev, [s.key as string]: !on }))}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      on ? "border-accent bg-accent-soft" : "border-line text-ink-soft hover:border-accent"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5">
          <h3 className="eyebrow mb-4 text-ink-soft">Devis estimé</h3>
          {quote ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line/70">
                {quote.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2 text-ink-soft">{l.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{l.amount.toFixed(0)} €</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="py-1.5 text-ink-soft">HT</td>
                  <td className="py-1.5 text-right tabular-nums">{quote.ht.toFixed(0)} €</td>
                </tr>
                <tr>
                  <td className="py-1 text-ink-soft">TVA</td>
                  <td className="py-1 text-right tabular-nums">{quote.tva.toFixed(0)} €</td>
                </tr>
                <tr>
                  <td className="pt-2 font-serif text-lg">TTC</td>
                  <td className="pt-2 text-right font-serif text-lg tabular-nums">{quote.ttc.toFixed(0)} €</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="text-sm text-ink-soft">Analysez des photos pour générer un devis.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function NumRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-sm text-ink-soft">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}
