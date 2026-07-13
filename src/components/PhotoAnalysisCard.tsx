"use client";

// Carte d'analyse photo — composant UNIQUE partagé par le formulaire et le
// Playground, pour un rendu et une édition strictement identiques.
// L'image s'affiche à côté du détail éditable (pièce + objets détectés).

export type AnalyzedObjet = { label: string; quantite: number; volume_m3: number };
export type AnalyzedPhotoBase = {
  piece: string;
  objets: AnalyzedObjet[];
  volume_m3: number;
  previewUrl?: string;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const sumVolume = (objets: AnalyzedObjet[]) =>
  round2(objets.reduce((s, o) => s + o.volume_m3, 0));

export function PhotoAnalysisCard<T extends AnalyzedPhotoBase>({
  photo,
  onChange,
  onRemove,
}: {
  photo: T;
  onChange: (p: T) => void;
  onRemove: () => void;
}) {
  const emit = (patch: Partial<AnalyzedPhotoBase>) => {
    const next = { ...photo, ...patch } as T;
    next.volume_m3 = sumVolume(next.objets);
    onChange(next);
  };

  const setObjet = (idx: number, field: keyof AnalyzedObjet, value: string) => {
    const objets = photo.objets.map((o, i) =>
      i === idx ? { ...o, [field]: field === "label" ? value : Number(value) || 0 } : o,
    );
    emit({ objets });
  };
  const removeObjet = (idx: number) => emit({ objets: photo.objets.filter((_, i) => i !== idx) });
  const addObjet = () => emit({ objets: [...photo.objets, { label: "", quantite: 1, volume_m3: 0 }] });

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="grid md:grid-cols-[200px_1fr]">
        {/* Image */}
        <div className="relative aspect-square md:aspect-auto">
          {photo.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.previewUrl} alt={photo.piece} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-subtle text-sm text-ink-soft">
              Photo
            </div>
          )}
        </div>

        {/* Détail éditable */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              value={photo.piece}
              onChange={(e) => onChange({ ...photo, piece: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-medium outline-none transition hover:border-line focus:border-accent"
            />
            <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-sm font-medium tabular-nums">
              {photo.volume_m3.toFixed(1)} m³
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-ink-soft transition hover:text-accent"
              title="Retirer la photo"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1.5">
            {photo.objets.map((o, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  value={o.label}
                  onChange={(e) => setObjet(idx, "label", e.target.value)}
                  placeholder="Objet"
                  className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-accent"
                />
                <div className="flex items-center rounded-md border border-line bg-paper">
                  <span className="pl-2 text-xs text-ink-soft">×</span>
                  <input
                    type="number"
                    min={1}
                    value={o.quantite}
                    onChange={(e) => setObjet(idx, "quantite", e.target.value)}
                    className="w-12 bg-transparent px-1 py-1 text-sm outline-none"
                  />
                </div>
                <div className="flex items-center rounded-md border border-line bg-paper">
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={o.volume_m3}
                    onChange={(e) => setObjet(idx, "volume_m3", e.target.value)}
                    className="w-16 bg-transparent px-2 py-1 text-right text-sm outline-none"
                  />
                  <span className="pr-2 text-xs text-ink-soft">m³</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeObjet(idx)}
                  className="rounded-md px-1.5 py-1 text-sm text-ink-soft transition hover:text-accent"
                >
                  −
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addObjet}
            className="mt-2 text-sm text-ink-soft transition hover:text-ink"
          >
            + Ajouter un objet
          </button>
        </div>
      </div>
    </div>
  );
}

// Zone de dépôt d'upload — identique dans les deux contextes.
export function PhotoDropzone({
  onPick,
  title = "Déposez vos photos",
  subtitle = "Une photo par pièce, idéalement large. JPG/PNG.",
}: {
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-line-strong bg-card px-6 py-8 text-center transition hover:border-accent">
      <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      <div className="font-serif text-xl">{title}</div>
      <div className="mt-1 text-sm text-ink-soft">{subtitle}</div>
    </label>
  );
}
