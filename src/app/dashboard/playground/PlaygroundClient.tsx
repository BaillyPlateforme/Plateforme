"use client";

import { useMemo, useState } from "react";
import type { PricingGridRow, RequestRow } from "@/lib/types";
import { estimateQuote } from "@/lib/quote";

type Objet = { label: string; quantite: number; volume_m3: number };
type Photo = {
  storage_path: string;
  piece: string;
  objets: Objet[];
  volume_m3: number;
  previewUrl?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const SERVICE_KEYS: { key: keyof RequestRow["services"]; label: string }[] = [
  { key: "emballage", label: "Emballage" },
  { key: "demontage", label: "Démontage" },
  { key: "montage", label: "Montage" },
  { key: "monte_meuble", label: "Monte-meuble" },
  { key: "garde_meuble", label: "Garde-meuble" },
];

type LibraryPhoto = { path: string; url: string };

export default function PlaygroundClient({
  grids,
  library,
}: {
  grids: PricingGridRow[];
  library: LibraryPhoto[];
}) {
  const [previews, setPreviews] = useState<{ url: string; file: File }[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function analyzeSelection() {
    const paths = library.filter((p) => selected.has(p.path));
    if (paths.length === 0) return;
    setAnalyzing(true);
    setErr(null);
    try {
      const res = await fetch("/api/analyze-volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: paths.map((p) => p.path) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analyse impossible");
      setPhotos((prev) => [...prev, ...data.photos]);
      setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAnalyzing(false);
    }
  }

  // Paramètres du chantier fictif
  const [gridId, setGridId] = useState(grids.find((g) => g.is_default)?.id ?? grids[0]?.id);
  const [distance, setDistance] = useState("250");
  const [departEtage, setDepartEtage] = useState("2");
  const [departAsc, setDepartAsc] = useState(false);
  const [arriveeEtage, setArriveeEtage] = useState("0");
  const [arriveeAsc, setArriveeAsc] = useState(true);
  const [services, setServices] = useState<Record<string, boolean>>({ emballage: true });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews((p) => [...p, ...files.map((f) => ({ url: URL.createObjectURL(f), file: f }))]);
    setErr(null);
  }

  async function analyze() {
    if (previews.length === 0) return;
    setAnalyzing(true);
    setErr(null);
    try {
      const fd = new FormData();
      previews.forEach((p) => fd.append("photos", p.file));
      const res = await fetch("/api/analyze-volume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analyse impossible");
      const enriched: Photo[] = data.photos.map((p: Photo, i: number) => ({
        ...p,
        previewUrl: previews[i]?.url,
      }));
      setPhotos((prev) => [...prev, ...enriched]);
      setPreviews([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAnalyzing(false);
    }
  }

  function updatePhoto(idx: number, next: Photo) {
    next.volume_m3 = round2(next.objets.reduce((s, o) => s + o.volume_m3, 0));
    setPhotos((prev) => prev.map((p, i) => (i === idx ? next : p)));
  }

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
        Aucune grille active. Créez-en une dans « Grilles tarifaires ».
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Colonne gauche : photos */}
      <div className="space-y-5">
        {/* Galerie : base de ~30 photos, sélectionnables */}
        {library.length > 0 && (
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                Base de photos · {library.length}
              </h3>
              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-ink-soft transition hover:text-ink"
                  >
                    Désélectionner
                  </button>
                )}
                <button
                  onClick={analyzeSelection}
                  disabled={selected.size === 0 || analyzing}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-dark disabled:opacity-40"
                >
                  {analyzing ? "Analyse…" : `Analyser la sélection (${selected.size})`}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {library.map((p) => {
                const on = selected.has(p.path);
                return (
                  <button
                    key={p.path}
                    onClick={() => toggleSelect(p.path)}
                    className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                      on ? "border-ink" : "border-transparent hover:border-line-strong"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    <span
                      className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs transition ${
                        on ? "bg-ink text-white" : "bg-white/70 text-transparent group-hover:text-ink-soft"
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="block cursor-pointer rounded-xl border-2 border-dashed border-line-strong bg-card px-6 py-6 text-center transition hover:border-ink">
          <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
          <div className="text-sm font-medium">…ou importez vos propres photos</div>
        </label>

        {previews.length > 0 && (
          <div>
            <div className="grid grid-cols-6 gap-2">
              {previews.map((p) => (
                <div key={p.url} className="aspect-square overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
            <button
              onClick={analyze}
              disabled={analyzing}
              className="mt-3 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
            >
              {analyzing ? "Analyse en cours…" : `Analyser ${previews.length} photo(s)`}
            </button>
          </div>
        )}

        {err && <div className="text-sm text-accent-dark">{err}</div>}

        {photos.map((p, i) => (
          <PhotoCard key={i} photo={p} onChange={(next) => updatePhoto(i, next)} onRemove={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} />
        ))}
      </div>

      {/* Colonne droite : paramètres + devis */}
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Chantier</h3>
            <span className="font-serif text-2xl">{totalVolume.toFixed(1)} m³</span>
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-sm text-ink-soft">Grille</span>
            <select
              value={gridId}
              onChange={(e) => setGridId(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
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
                      on ? "border-ink bg-accent-soft" : "border-line text-ink-soft hover:border-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Devis */}
        <div className="rounded-xl border border-line bg-card p-5">
          <h3 className="mb-4 text-xs font-medium uppercase tracking-wide text-ink-soft">Devis estimé</h3>
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

function PhotoCard({ photo, onChange, onRemove }: { photo: Photo; onChange: (p: Photo) => void; onRemove: () => void }) {
  const setObjet = (idx: number, field: keyof Objet, value: string) => {
    const objets = photo.objets.map((o, i) =>
      i === idx ? { ...o, [field]: field === "label" ? value : Number(value) || 0 } : o,
    );
    onChange({ ...photo, objets });
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid md:grid-cols-[160px_1fr]">
        <div className="aspect-square md:aspect-auto">
          {photo.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.previewUrl} alt={photo.piece} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-subtle text-xs text-ink-soft">Photo</div>
          )}
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              value={photo.piece}
              onChange={(e) => onChange({ ...photo, piece: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-transparent px-1 py-0.5 font-medium outline-none hover:border-line focus:border-ink"
            />
            <span className="rounded-full bg-subtle px-2 py-0.5 text-sm tabular-nums">{photo.volume_m3.toFixed(1)} m³</span>
            <button onClick={onRemove} className="text-ink-soft transition hover:text-accent">✕</button>
          </div>
          <div className="space-y-1.5">
            {photo.objets.map((o, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  value={o.label}
                  onChange={(e) => setObjet(idx, "label", e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-ink"
                />
                <input
                  type="number"
                  min={1}
                  value={o.quantite}
                  onChange={(e) => setObjet(idx, "quantite", e.target.value)}
                  className="w-12 rounded-md border border-line bg-paper px-1 py-1 text-sm outline-none focus:border-ink"
                />
                <input
                  type="number"
                  step="0.1"
                  value={o.volume_m3}
                  onChange={(e) => setObjet(idx, "volume_m3", e.target.value)}
                  className="w-16 rounded-md border border-line bg-paper px-2 py-1 text-right text-sm outline-none focus:border-ink"
                />
                <button
                  onClick={() => onChange({ ...photo, objets: photo.objets.filter((_, i) => i !== idx) })}
                  className="text-ink-soft transition hover:text-accent"
                >
                  −
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => onChange({ ...photo, objets: [...photo.objets, { label: "", quantite: 1, volume_m3: 0 }] })}
            className="mt-2 text-sm text-ink-soft transition hover:text-ink"
          >
            + Ajouter un objet
          </button>
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
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
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
