"use client";

import { useRef, useState } from "react";
import {
  PhotoAnalysisCard,
  PhotoDropzone,
  AnalysisLoader,
  AnalysisError,
  sumVolume,
  volumePhotos,
  compteDoublons,
  type AnalyzedPhoto,
} from "./PhotoAnalysisCard";

export type LibraryPhoto = { path: string; url: string };

// Bloc photo complet et UNIQUE, partagé par le formulaire et le Playground :
// galerie de la base sélectionnable + import + analyse IA + résultats éditables.
export default function PhotoAnalyzer({
  library,
  photos,
  onChange,
  showTotal = true,
}: {
  library: LibraryPhoto[];
  photos: AnalyzedPhoto[];
  onChange: (photos: AnalyzedPhoto[]) => void;
  showTotal?: boolean;
}) {
  const [previews, setPreviews] = useState<{ url: string; file: File }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const lastRun = useRef<null | (() => void)>(null);

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews((p) => [...p, ...files.map((f) => ({ url: URL.createObjectURL(f), file: f }))]);
    setError(null);
    e.target.value = "";
  }

  // Compteur "photo X/N" simulé pendant l'appel groupé (une seule passe, en parallèle côté serveur).
  function startProgress(total: number) {
    setProgress({ current: 1, total });
    const step = Math.max(1200, Math.round(18000 / total));
    const iv = setInterval(() => setProgress((pr) => ({ ...pr, current: Math.min(pr.total, pr.current + 1) })), step);
    return iv;
  }

  async function analyzeSelection() {
    const chosen = library.filter((p) => selected.has(p.path));
    if (chosen.length === 0) return;
    lastRun.current = analyzeSelection;
    setAnalyzing(true);
    setError(null);
    const iv = startProgress(chosen.length);
    try {
      const res = await fetch("/api/analyze-volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: chosen.map((p) => p.path) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analyse impossible");
      onChange([...photos, ...(data.photos as AnalyzedPhoto[])]);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      clearInterval(iv);
      setAnalyzing(false);
    }
  }

  async function analyzeUpload() {
    if (previews.length === 0) return;
    lastRun.current = analyzeUpload;
    setAnalyzing(true);
    setError(null);
    const iv = startProgress(previews.length);
    try {
      const fd = new FormData();
      previews.forEach((p) => fd.append("photos", p.file));
      const res = await fetch("/api/analyze-volume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analyse impossible");
      const enriched: AnalyzedPhoto[] = (data.photos as AnalyzedPhoto[]).map((p, i) => ({
        ...p,
        previewUrl: previews[i]?.url ?? p.previewUrl,
      }));
      onChange([...photos, ...enriched]);
      setPreviews([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      clearInterval(iv);
      setAnalyzing(false);
    }
  }

  function updatePhoto(idx: number, next: AnalyzedPhoto) {
    next.volume_m3 = sumVolume(next.objets);
    onChange(photos.map((p, i) => (i === idx ? next : p)));
  }
  function removePhoto(idx: number) {
    onChange(photos.filter((_, i) => i !== idx));
  }

  // Chaque photo porte déjà son volume net : le mobilier vu sur une autre
  // photo de la même pièce en a été retiré.
  const total = volumePhotos(photos);

  /**
   * Défait un regroupement. Le modèle a pu se tromper — deux chambres qui se
   * ressemblent, par exemple : toutes les lignes écartées du groupe
   * recomptent, et les photos redeviennent indépendantes.
   */
  function separerGroupe(groupe: string) {
    onChange(
      photos.map((p) => {
        if (p.groupe !== groupe) return p;
        const objets = p.objets.map((o) => ({ ...o, doublon: undefined }));
        return {
          ...p,
          objets,
          volume_m3: sumVolume(objets),
          groupe: undefined,
          doublon_de: undefined,
          doublon_raison: undefined,
        };
      }),
    );
  }

  return (
    <div className="space-y-5">
      {/* Galerie de la base — sélectionnable */}
      {library.length > 0 && (
        <div className="rounded-[18px] bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="eyebrow text-ink-soft">Base de photos · {library.length}</h3>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-ink-soft transition hover:text-ink"
                >
                  Désélectionner
                </button>
              )}
              <button
                type="button"
                onClick={analyzeSelection}
                disabled={selected.size === 0 || analyzing}
                className="rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-dark disabled:opacity-40"
              >
                Analyser la sélection ({selected.size})
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {library.map((p) => {
              const on = selected.has(p.path);
              return (
                <button
                  type="button"
                  key={p.path}
                  onClick={() => toggleSelect(p.path)}
                  className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                    on ? "border-accent" : "border-transparent hover:border-line-strong"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  <span
                    className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs transition ${
                      on ? "bg-accent text-white" : "bg-white/70 text-transparent group-hover:text-ink-soft"
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

      {/* Import */}
      <PhotoDropzone onPick={onPick} />
      {previews.length > 0 && (
        <div>
          <div className="grid grid-cols-6 gap-2">
            {previews.map((p, i) => (
              <div key={p.url} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPreviews((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-ink/70 text-xs text-white opacity-0 transition group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={analyzeUpload}
            disabled={analyzing}
            className="mt-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            Analyser {previews.length} photo{previews.length > 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Chargement / erreur */}
      {analyzing && <AnalysisLoader count={progress.total} current={progress.current} total={progress.total} />}
      {error && !analyzing && (
        <AnalysisError reason={error} onRetry={() => lastRun.current?.()} />
      )}

      {/* Résultats éditables */}
      {photos.map((p, i) => (
        <div key={i} className="space-y-1.5">
          {p.groupe && (
            <Bandeau
              photo={p}
              rang={photos.findIndex((q) => q.storage_path === p.doublon_de) + 1}
              premiere={p.storage_path === p.doublon_de}
              onSeparer={() => p.groupe && separerGroupe(p.groupe)}
            />
          )}
          <PhotoAnalysisCard
            photo={p}
            onChange={(next) => updatePhoto(i, next)}
            onRemove={() => removePhoto(i)}
          />
        </div>
      ))}

      {showTotal && photos.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-line bg-subtle px-4 py-3 font-medium">
          <span>Volume total estimé</span>
          <span className="tabular-nums">{total.toFixed(1)} m³</span>
        </div>
      )}
    </div>
  );
}

/**
 * Le bandeau du dédoublonnage : il dit à quelle pièce la photo appartient, ce
 * qui a été reconnu, et combien de meubles ne sont pas recomptés. Le client
 * doit pouvoir comprendre pourquoi son volume n'est pas la somme de ses photos.
 */
function Bandeau({
  photo,
  rang,
  premiere,
  onSeparer,
}: {
  photo: AnalyzedPhoto;
  rang: number;
  premiere: boolean;
  onSeparer: () => void;
}) {
  const n = compteDoublons(photo.objets);
  return (
    <div className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-[12.5px] text-brand-ink">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">
          {premiere
            ? `Même pièce que les photos suivantes`
            : `Même pièce que la photo ${rang || "précédente"}`}
          {n > 0
            ? ` — ${n} meuble${n > 1 ? "s" : ""} déjà compté${n > 1 ? "s" : ""} ailleurs, non recompté${n > 1 ? "s" : ""}`
            : " — rien de commun à écarter ici"}
        </span>
        <button
          type="button"
          onClick={onSeparer}
          className="ml-auto shrink-0 font-medium underline underline-offset-2 transition hover:no-underline"
        >
          Tout recompter
        </button>
      </div>
      {photo.doublon_raison && (
        <p className="mt-1 leading-snug opacity-75">{photo.doublon_raison}</p>
      )}
    </div>
  );
}
