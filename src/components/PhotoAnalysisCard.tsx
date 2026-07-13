"use client";

import { useEffect, useMemo, useState } from "react";
import { CATALOG } from "@/lib/catalog";

// Carte d'analyse photo — composant partagé (formulaire + Playground).
export type AnalyzedObjet = { label: string; quantite: number; volume_m3: number };
export type AnalyzedPhotoBase = {
  piece: string;
  objets: AnalyzedObjet[];
  volume_m3: number;
  previewUrl?: string;
};
export type AnalyzedPhoto = AnalyzedPhotoBase & { storage_path?: string };

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
  const [adding, setAdding] = useState(false);

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
  const addObjet = (o: AnalyzedObjet) => {
    emit({ objets: [...photo.objets, o] });
    setAdding(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="grid md:grid-cols-[300px_1fr] md:items-start">
        {photo.previewUrl ? (
          <a
            href={photo.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="group relative block aspect-[4/3] overflow-hidden bg-subtle"
            title="Agrandir la photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt={photo.piece}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
            <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2.5 py-1 text-xs text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
              Agrandir ↗
            </span>
          </a>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-subtle text-sm text-ink-soft">
            Photo
          </div>
        )}

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

          {adding ? (
            <AddObjetPicker onAdd={addObjet} onCancel={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2 text-sm text-ink-soft transition hover:text-ink"
            >
              + Ajouter un objet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Ajout d'objet : catalogue complet filtrable OU saisie libre.
function AddObjetPicker({
  onAdd,
  onCancel,
}: {
  onAdd: (o: AnalyzedObjet) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? CATALOG.filter((c) => c.label.toLowerCase().includes(needle))
      : CATALOG;
    return list.slice(0, 40);
  }, [q]);

  return (
    <div className="mt-2 rounded-lg border border-line bg-paper p-2">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un meuble ou saisir librement…"
          className="min-w-0 flex-1 rounded-md border border-line bg-card px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-sm text-ink-soft transition hover:text-ink"
        >
          Annuler
        </button>
      </div>

      {q.trim() && (
        <button
          type="button"
          onClick={() => onAdd({ label: q.trim(), quantite: 1, volume_m3: 0 })}
          className="mb-2 w-full rounded-md bg-accent px-3 py-1.5 text-left text-sm font-medium text-white transition hover:bg-accent-dark"
        >
          + Ajouter « {q.trim()} » <span className="opacity-70">(champ libre)</span>
        </button>
      )}

      <div className="max-h-44 overflow-y-auto">
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onAdd({ label: c.label, quantite: 1, volume_m3: c.volume })}
              className="rounded-full border border-line bg-card px-2.5 py-1 text-xs transition hover:border-accent hover:text-accent"
            >
              {c.label} · {c.volume} m³
            </button>
          ))}
          {filtered.length === 0 && (
            <span className="px-1 py-1 text-xs text-ink-soft">
              Aucun meuble au catalogue — utilisez la saisie libre ci-dessus.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Zone de dépôt d'upload.
export function PhotoDropzone({
  onPick,
  title = "Importer vos propres photos",
  subtitle = "Une photo par pièce, idéalement large. JPG/PNG.",
}: {
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-line-strong bg-card px-6 py-7 text-center transition hover:border-accent">
      <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      <div className="font-serif text-lg">{title}</div>
      <div className="mt-1 text-sm text-ink-soft">{subtitle}</div>
    </label>
  );
}

// Section de chargement pendant l'analyse — explique ce qui se passe.
const LOADER_STEPS = [
  "Préparation des photos…",
  "Envoi sécurisé au moteur d'analyse…",
  "Détection du mobilier, pièce par pièce…",
  "Estimation des volumes de déménagement…",
  "Compilation des résultats…",
];

export function AnalysisLoader({ count }: { count: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % LOADER_STEPS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
        <div className="font-serif text-lg">
          Analyse de {count} photo{count > 1 ? "s" : ""} en cours
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-soft">{LOADER_STEPS[step]}</p>
      <div className="mt-4 space-y-1.5">
        {LOADER_STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full ${
                i < step ? "bg-accent text-white" : i === step ? "border border-accent text-accent" : "border border-line text-transparent"
              }`}
            >
              {i < step ? "✓" : "•"}
            </span>
            <span className={i <= step ? "text-ink" : "text-ink-soft/60"}>{s}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        Cela prend généralement 15 à 40 secondes selon le nombre de photos.
      </p>
    </div>
  );
}

// Échec d'analyse : explique pourquoi + compte à rebours avant nouvelle tentative.
export function AnalysisError({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const saturated = /quota|429|resource_exhausted|too many|rate/i.test(reason);
  const [left, setLeft] = useState(10);

  useEffect(() => {
    setLeft(10);
    const id = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [reason]);

  return (
    <div className="rounded-2xl border border-warn/40 bg-warn/5 p-5">
      <div className="flex items-center gap-2 font-medium text-warn">
        <span>⚠</span> Analyse impossible
      </div>
      <p className="mt-1.5 text-sm text-ink">
        {saturated
          ? "Le moteur d'analyse est temporairement saturé (trop de demandes simultanées)."
          : "Une erreur est survenue pendant l'analyse."}
      </p>
      <p className="mt-1 break-words text-xs text-ink-soft">{reason}</p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          disabled={left > 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {left > 0 ? `Patientez ${left}s…` : "Réessayer"}
        </button>
        {left > 0 && (
          <span className="text-xs text-ink-soft">Nouvelle tentative possible dans {left} seconde{left > 1 ? "s" : ""}.</span>
        )}
      </div>
    </div>
  );
}
