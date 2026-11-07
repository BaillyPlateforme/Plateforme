"use client";

import { CATALOG, REPERE_LOGEMENT } from "@/lib/catalog";
import { volumePhotos, type AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import { Choice, Field, Icone, Pill, TextInput, type NomIcone } from "./ui";

/*
 * Le volume à déménager, et ses façons de l'estimer : le saisir, lister ses
 * meubles, envoyer des photos, ou décrire son logement. Partagé par le
 * formulaire de devis et la page de complétion.
 */

export type VolumeMode = "explicit" | "list" | "ai" | "logement";
export type ListItem = { label: string; quantite: number; volume_unitaire_m3: number };

type Ameublement = (typeof REPERE_LOGEMENT.ameublement)[number]["key"];

/** Le logement décrit par le client, pour en déduire un volume. */
export type Repere = {
  type: string;
  surface: string;
  ameublement: Ameublement;
  /** Les annexes à vider : cave, garage… */
  annexes: string[];
};

export const REPERE_VIDE: Repere = { type: "", surface: "", ameublement: "normal", annexes: [] };

const arrondi = (n: number) => Math.round(n * 100) / 100;
const fr = (n: number) => String(arrondi(n)).replace(".", ",");

/**
 * Le calcul du repère, ligne par ligne — le même pour le chiffre retenu et
 * pour le détail montré au client.
 *
 * La surface prime sur le type : elle dit plus précisément ce qu'il y a à
 * déménager. Sans elle, c'est le volume courant du type de logement.
 */
export function detailRepere(r: Repere): { lignes: [string, string][]; volume: number } | null {
  const surface = parseFloat(r.surface);
  const type = REPERE_LOGEMENT.types.find((t) => t.label === r.type);
  const lignes: [string, string][] = [];
  let base: number;
  if (surface > 0) {
    base = surface * REPERE_LOGEMENT.m3ParM2;
    lignes.push([`${fr(surface)} m² × ${fr(REPERE_LOGEMENT.m3ParM2)} m³`, `${fr(base)} m³`]);
  } else if (type) {
    base = type.volume;
    lignes.push([`${type.label}, volume courant`, `${fr(base)} m³`]);
  } else return null;

  const meuble = REPERE_LOGEMENT.ameublement.find((a) => a.key === r.ameublement) ?? REPERE_LOGEMENT.ameublement[1];
  if (meuble.coef !== 1) lignes.push([meuble.label, `× ${fr(meuble.coef)}`]);
  let volume = base * meuble.coef;

  for (const annexe of REPERE_LOGEMENT.annexes) {
    if (!r.annexes.includes(annexe.key)) continue;
    volume += annexe.volume;
    lignes.push([annexe.label, `+ ${fr(annexe.volume)} m³`]);
  }
  // Au mètre cube près : un repère n'a pas de décimales à promettre.
  return { lignes, volume: Math.round(volume) };
}

/** Le logement, dit en une ligne — pour le récapitulatif et pour l'équipe. */
export function repereLisible(r: Repere): string {
  const meuble = REPERE_LOGEMENT.ameublement.find((a) => a.key === r.ameublement);
  const annexes = REPERE_LOGEMENT.annexes.filter((a) => r.annexes.includes(a.key)).map((a) => a.label.toLowerCase());
  return [r.type, parseFloat(r.surface) > 0 ? `${fr(parseFloat(r.surface))} m²` : "", meuble?.label.toLowerCase() ?? "", ...annexes]
    .filter(Boolean)
    .join(" · ");
}

/** Le volume retenu selon la méthode choisie, ou rien tant qu'il n'est pas connu. */
export function volumeDe(
  mode: VolumeMode,
  saisi: string,
  items: ListItem[],
  photos: AnalyzedPhoto[],
  repere: Repere = REPERE_VIDE,
): number | null {
  if (mode === "explicit") {
    const v = parseFloat(saisi);
    return isNaN(v) ? null : arrondi(v);
  }
  if (mode === "list") {
    if (items.length === 0) return null;
    return arrondi(items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0));
  }
  if (mode === "logement") return detailRepere(repere)?.volume ?? null;
  return photos.length === 0 ? null : volumePhotos(photos);
}

export const MODES_VOLUME: { key: VolumeMode; icone: NomIcone; titre: string; texte: string }[] = [
  { key: "explicit", icone: "carton", titre: "Je connais mon volume", texte: "Vous saisissez le nombre de mètres cubes." },
  { key: "list", icone: "liste", titre: "Je liste mes meubles", texte: "Meuble par meuble, le volume se calcule." },
  { key: "ai", icone: "photo", titre: "J'envoie des photos", texte: "L'analyse de vos photos estime le volume." },
  { key: "logement", icone: "maison", titre: "Je décris mon logement", texte: "Type, surface, ameublement : le volume s'en déduit." },
];

/** Le volume saisi à la main. */
export function SaisieVolume({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  return (
    <Field label="Volume estimé">
      <div className="sm:max-w-[260px]">
        <TextInput type="number" min={0} step="0.5" unite="m³" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder="25" />
      </div>
    </Field>
  );
}

/**
 * Le volume déduit du logement.
 *
 * C'était une rangée de pastilles sous la saisie directe : un clic, un chiffre
 * rond. C'est désormais une façon d'estimer à part entière, pour qui ne
 * connaît pas ses mètres cubes — quatre questions, et le calcul montré ligne
 * par ligne, pour que le client voie d'où vient le chiffre.
 */
export function RepereLogement({
  valeur,
  onChange,
  sansVolume = false,
  simple = false,
}: {
  valeur: Repere;
  onChange: (r: Repere) => void;
  /** Un espace pro peut taire les mètres cubes : la description suffit alors. */
  sansVolume?: boolean;
  /**
   * Le devis express ne demande que le type de logement : il doit tenir en
   * deux minutes. La surface, l'ameublement et les annexes restent au devis
   * complet.
   */
  simple?: boolean;
}) {
  const set = (p: Partial<Repere>) => onChange({ ...valeur, ...p });
  // En version simple, seul le type compte — quoi que l'état contienne d'autre.
  const detail = detailRepere(simple ? { ...REPERE_VIDE, type: valeur.type } : valeur);
  const meuble = REPERE_LOGEMENT.ameublement.find((a) => a.key === valeur.ameublement);
  const basculer = (cle: string) =>
    set({ annexes: valeur.annexes.includes(cle) ? valeur.annexes.filter((a) => a !== cle) : [...valeur.annexes, cle] });

  return (
    <div className="space-y-6">
      <Field groupe label="Votre type de logement">
        <div className="flex flex-wrap gap-2">
          {REPERE_LOGEMENT.types.map((t) => (
            <Pill key={t.label} active={valeur.type === t.label} onClick={() => set({ type: valeur.type === t.label ? "" : t.label })}>
              {t.label}
              {simple && !sansVolume && <span className="ml-1.5 opacity-60">~{t.volume} m³</span>}
            </Pill>
          ))}
        </div>
      </Field>

      {!simple && (
        <>
          <Field label="Surface habitable" hint="si vous la connaissez : l'estimation est plus précise">
            <div className="sm:max-w-[260px]">
              <TextInput type="number" min={0} unite="m²" value={valeur.surface} onChange={(e) => set({ surface: e.target.value })} placeholder="65" />
            </div>
          </Field>

          <Field groupe label="Votre logement est…">
            <Choice
              plein
              options={REPERE_LOGEMENT.ameublement.map((a) => [a.key, a.label] as [string, string])}
              value={valeur.ameublement}
              onChange={(v) => set({ ameublement: v as Ameublement })}
            />
            {meuble && <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">{meuble.aide}</p>}
          </Field>

          <Field groupe label="Des annexes à vider ?" hint="plusieurs choix possibles">
            <div className="flex flex-wrap gap-2">
              {REPERE_LOGEMENT.annexes.map((a) => (
                <Pill key={a.key} active={valeur.annexes.includes(a.key)} onClick={() => basculer(a.key)}>
                  {a.label}
                </Pill>
              ))}
            </div>
          </Field>
        </>
      )}

      {/* ── Le résultat, et d'où il vient ── */}
      {!detail ? (
        <p className="flex gap-2.5 rounded-[18px] border border-dashed border-line-strong px-4 py-3.5 text-[13.5px] leading-snug text-ink-soft">
          <Icone nom="info" taille={16} className="mt-px shrink-0" />
          {simple ? "Choisissez votre type de logement" : "Indiquez votre type de logement ou sa surface"} :{" "}
          {sansVolume ? "nos équipes en déduisent le volume." : "le volume s'affiche aussitôt."}
        </p>
      ) : sansVolume ? (
        <p className="flex gap-2.5 rounded-[18px] bg-brand-soft px-4 py-3.5 text-[13.5px] leading-snug text-brand-ink">
          <Icone nom="check" taille={16} trait={2.6} className="mt-px shrink-0" />
          C&apos;est noté : nos équipes déduisent le volume de cette description.
        </p>
      ) : (
        <div className="animate-step-in overflow-hidden rounded-[20px] border border-line">
          {/* Un seul choix, un seul chiffre : il n'y a pas de calcul à détailler. */}
          {!simple && detail.lignes.map(([quoi, combien]) => (
            <div key={quoi} className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 text-[13.5px]">
              <span className="text-ink-mid">{quoi}</span>
              <span className="tnum font-medium">{combien}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 bg-subtle px-4 py-3.5">
            <span className="text-[14px] font-semibold">Volume estimé</span>
            <span className="font-serif text-[22px] tnum">≈ {detail.volume} m³</span>
          </div>
          <p className="px-4 py-3 text-[12.5px] leading-snug text-ink-soft">
            Un repère, établi sur les ratios habituels de la profession. Notre conseiller l&apos;affine avec vous
            avant le devis définitif.
          </p>
        </div>
      )}
    </div>
  );
}

/** Le volume construit meuble par meuble, à partir du catalogue. */
export function ListeMeubles({
  items,
  onChange,
  sansVolume = false,
}: {
  items: ListItem[];
  onChange: (items: ListItem[]) => void;
  /** Un espace pro peut taire les mètres cubes : on compte alors les meubles. */
  sansVolume?: boolean;
}) {
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
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1b1a18] px-1 text-[10px] font-bold text-brand-clair">{n}</span>
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
                {!sansVolume && <div className="text-[12px] text-ink-soft">{it.volume_unitaire_m3} m³ l&apos;unité</div>}
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setQty(i, it.quantite - 1)} aria-label={`Retirer un ${it.label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">−</button>
                <span className="w-7 text-center text-[14px] font-semibold tnum">{it.quantite}</span>
                <button type="button" onClick={() => setQty(i, it.quantite + 1)} aria-label={`Ajouter un ${it.label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">+</button>
              </div>
              {!sansVolume && <div className="w-16 text-right text-[13.5px] tnum">{(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³</div>}
            </div>
          ))}
          <div className="flex items-center justify-between bg-subtle px-4 py-3.5">
            <span className="text-[14px] font-semibold">{sansVolume ? "Meubles listés" : "Total"}</span>
            <span className="font-serif text-[20px] tnum">
              {sansVolume ? items.reduce((s, it) => s + it.quantite, 0) : `${total.toFixed(1)} m³`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
