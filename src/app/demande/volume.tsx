"use client";

import { CATALOG, LOGEMENT_HINTS } from "@/lib/catalog";
import { volumePhotos, type AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import { Field, Icone, Pill, TextInput, type NomIcone } from "./ui";

/*
 * Le volume à déménager, et ses trois façons de l'estimer. Partagé par le
 * formulaire de devis et la page de complétion.
 */

export type VolumeMode = "explicit" | "list" | "ai";
export type ListItem = { label: string; quantite: number; volume_unitaire_m3: number };

/** Le volume retenu selon la méthode choisie, ou rien tant qu'il n'est pas connu. */
export function volumeDe(mode: VolumeMode, saisi: string, items: ListItem[], photos: AnalyzedPhoto[]): number | null {
  if (mode === "explicit") {
    const v = parseFloat(saisi);
    return isNaN(v) ? null : Math.round(v * 100) / 100;
  }
  if (mode === "list") {
    if (items.length === 0) return null;
    return Math.round(items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0) * 100) / 100;
  }
  return photos.length === 0 ? null : volumePhotos(photos);
}

export const MODES_VOLUME: { key: VolumeMode; icone: NomIcone; titre: string; texte: string }[] = [
  { key: "explicit", icone: "carton", titre: "Je connais mon volume", texte: "Vous saisissez le nombre de mètres cubes." },
  { key: "list", icone: "liste", titre: "Je liste mes meubles", texte: "Meuble par meuble, le volume se calcule." },
  { key: "ai", icone: "photo", titre: "J'envoie des photos", texte: "L'analyse de vos photos estime le volume." },
];


/** Le volume saisi à la main, avec des repères par type de logement. */
export function SaisieVolume({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-5">
      <Field label="Volume estimé">
        <div className="sm:max-w-[260px]">
          <TextInput type="number" min={0} step="0.5" unite="m³" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder="25" />
        </div>
      </Field>
      <Field groupe label="Repères par logement" hint="un clic remplit le champ">
        <div className="flex flex-wrap gap-2">
          {LOGEMENT_HINTS.map((h) => (
            <Pill key={h.label} active={valeur === String(h.volume)} onClick={() => onChange(String(h.volume))}>
              {h.label}
              <span className="ml-1.5 opacity-60">~{h.volume} m³</span>
            </Pill>
          ))}
        </div>
      </Field>
    </div>
  );
}

/** Le volume construit meuble par meuble, à partir du catalogue. */
export function ListeMeubles({ items, onChange }: { items: ListItem[]; onChange: (items: ListItem[]) => void }) {
  const total = items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0);
  function addFromCatalog(label: string) {
    const preset = CATALOG.find((c) => c.label === label); if (!preset) return;
    const existing = items.findIndex((it) => it.label === label);
    if (existing >= 0) { const copy = [...items]; copy[existing] = { ...copy[existing], quantite: copy[existing].quantite + 1 }; onChange(copy); }
    else onChange([...items, { label, quantite: 1, volume_unitaire_m3: preset.volume }]);
  }
  function setQty(i: number, q: number) { if (q <= 0) return onChange(items.filter((_, idx) => idx !== i)); const copy = [...items]; copy[i] = { ...copy[i], quantite: q }; onChange(copy); }
  const groupes = [...new Set(CATALOG.map((c) => c.groupe))];
  const quantite = (label: string) => items.find((it) => it.label === label)?.quantite ?? 0;
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {groupes.map((g) => (
          <div key={g}>
            <div className="eyebrow mb-2 text-ink-soft">{g}</div>
            <div className="flex flex-wrap gap-1.5">
              {CATALOG.filter((c) => c.groupe === g).map((c) => {
                const n = quantite(c.label);
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => addFromCatalog(c.label)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition duration-200 active:scale-95 ${
                      n > 0
                        ? "border-ink bg-brand-soft text-ink"
                        : "border-line-strong bg-card text-ink-mid hover:border-ink hover:text-ink"
                    }`}
                  >
                    {n > 0 ? (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1b1a18] px-1 text-[10px] font-bold text-brand">{n}</span>
                    ) : (
                      <Icone nom="plus" taille={12} trait={2.6} />
                    )}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div className="animate-step-in overflow-hidden rounded-[20px] border border-line">
          {items.map((it, i) => (
            <div key={it.label} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{it.label}</div>
                <div className="text-[12px] text-ink-soft">{it.volume_unitaire_m3} m³ l&apos;unité</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setQty(i, it.quantite - 1)} aria-label={`Retirer un ${it.label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">−</button>
                <span className="w-7 text-center text-[14px] font-semibold tnum">{it.quantite}</span>
                <button type="button" onClick={() => setQty(i, it.quantite + 1)} aria-label={`Ajouter un ${it.label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">+</button>
              </div>
              <div className="w-16 text-right text-[13.5px] tnum">{(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³</div>
            </div>
          ))}
          <div className="flex items-center justify-between bg-subtle px-4 py-3.5">
            <span className="text-[14px] font-semibold">Total</span>
            <span className="font-serif text-[20px] tnum">{total.toFixed(1)} m³</span>
          </div>
        </div>
      )}
    </div>
  );
}
