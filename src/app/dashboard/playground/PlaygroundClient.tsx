"use client";

import { useMemo, useState } from "react";
import { simuler } from "@/lib/pricing/engine";
import { FORMULES, type Formule } from "@/lib/pricing/grille";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import type { AnalyzedPhoto } from "@/components/PhotoAnalysisCard";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function PlaygroundClient({ library }: { library: LibraryPhoto[] }) {
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);

  const [formule, setFormule] = useState<Formule>("standard");
  const [distance, setDistance] = useState("250");
  const [monteMeubles, setMonteMeubles] = useState(false);

  const totalVolume = round2(photos.reduce((s, p) => s + p.volume_m3, 0));

  const quote = useMemo(() => {
    if (photos.length === 0) return null;
    return simuler({
      formule,
      volume_m3: totalVolume,
      distance_km: Number(distance) || 0,
      monte_meubles: monteMeubles ? 1 : 0,
    });
  }, [photos.length, totalVolume, distance, formule, monteMeubles]);

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
            <span className="mb-1 block text-sm text-ink-soft">Formule</span>
            <select
              value={formule}
              onChange={(e) => setFormule(e.target.value as Formule)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {FORMULES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <NumRow label="Distance (km)" value={distance} onChange={setDistance} />
          <div className="mt-2 text-sm">
            <Check label="Monte-meubles" checked={monteMeubles} onChange={setMonteMeubles} />
          </div>
          <p className="mt-3 text-[11.5px] text-ink-soft">
            Emballage, démontage et remontage sont compris dans la formule — voir le contenu des
            formules dans le simulateur.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5">
          <h3 className="eyebrow mb-4 text-ink-soft">Devis estimé</h3>
          {quote ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line/70">
                {quote.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2 text-ink-soft">
                      {l.label}
                      {l.detail && <span className="block text-[11px]">{l.detail}</span>}
                    </td>
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
