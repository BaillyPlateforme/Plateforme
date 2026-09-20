"use client";

import { useEffect, useMemo, useState } from "react";
import { simuler, type Simulation, type SimulationInput } from "@/lib/pricing/engine";
import { FORMULES, SUPPLEMENTS, type Formule } from "@/lib/pricing/grille";

/**
 * Campagne de test du moteur.
 *
 * On tire des chantiers au hasard dans des bornes qu'on choisit, on les
 * chiffre avec la grille, et on regarde ce qui sort. Un cas douteux se
 * signale d'un clic et se retrouve en haut de page, avec sa note — c'est là
 * qu'on décide si c'est la grille qu'il faut revoir.
 */

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const nb = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const CLE_SIGNALES = "bailly.campagne.signales";

/** Générateur reproductible : une même graine redonne exactement le même tirage. */
function alea(graine: number) {
  let a = graine >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bornes = {
  volumeMin: number;
  volumeMax: number;
  distanceMin: number;
  distanceMax: number;
  supplements: boolean;
};

type Cas = { entree: SimulationInput; sim: Simulation };

function tirer(graine: number, nombre: number, b: Bornes): Cas[] {
  const r = alea(graine);
  const entre = (min: number, max: number) => Math.round(min + r() * (max - min));

  return Array.from({ length: nombre }, () => {
    const volume = entre(b.volumeMin, b.volumeMax);
    const formule = FORMULES[Math.floor(r() * FORMULES.length)].key as Formule;

    const entree: SimulationInput = {
      formule,
      volume_m3: volume,
      distance_km: entre(b.distanceMin, b.distanceMax),
      voyage_special: b.supplements && r() < 0.25,
      portage_depart_m: b.supplements && r() < 0.3 ? entre(20, 80) : 0,
      portage_arrivee_m: b.supplements && r() < 0.2 ? entre(20, 60) : 0,
      transbordement: b.supplements && r() < 0.15,
      monte_meubles: b.supplements && r() < 0.35 ? (r() < 0.25 ? 2 : 1) : 0,
      piano_droit: b.supplements && r() < 0.08 ? 1 : 0,
      charges_lourdes: b.supplements && r() < 0.12 ? entre(1, 2) : 0,
      valeur_declaree: b.supplements && r() < 0.4 ? entre(10, 80) * 1000 : 0,
    };

    return { entree, sim: simuler(entree) };
  });
}

/** Ce qu'on retient d'un cas signalé : de quoi le rejouer et le comprendre. */
type Signale = {
  id: string;
  graine: number;
  rang: number;
  entree: SimulationInput;
  ttc: number;
  note: string;
  quand: string;
};

export default function CampagnePage() {
  const [graine, setGraine] = useState(1);
  const [nombre, setNombre] = useState(5);
  const [bornes, setBornes] = useState<Bornes>({
    volumeMin: 8,
    volumeMax: 60,
    distanceMin: 20,
    distanceMax: 600,
    supplements: true,
  });
  const [ouverts, setOuverts] = useState<Set<number>>(new Set());
  const [signales, setSignales] = useState<Signale[]>([]);

  // Les cas signalés survivent au rechargement : une campagne se relit à froid.
  // La lecture est différée d'un tour : le premier rendu doit être le même
  // côté serveur et côté navigateur, où seul ce dernier a le stockage local.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const brut = localStorage.getItem(CLE_SIGNALES);
        if (brut) setSignales(JSON.parse(brut) as Signale[]);
      } catch {
        /* stockage indisponible : on continue sans mémoire */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const memoriser = (liste: Signale[]) => {
    setSignales(liste);
    try {
      localStorage.setItem(CLE_SIGNALES, JSON.stringify(liste));
    } catch {
      /* idem */
    }
  };

  const cas = useMemo(() => tirer(graine, nombre, bornes), [graine, nombre, bornes]);

  const moyenne = cas.length ? cas.reduce((s, c) => s + c.sim.ttc, 0) / cas.length : 0;
  const alertes = cas.filter((c) => c.sim.alertes.length > 0).length;

  const idDe = (rang: number) => `${graine}-${rang}`;
  const estSignale = (rang: number) => signales.some((s) => s.id === idDe(rang));

  const basculer = (rang: number, c: Cas) => {
    const id = idDe(rang);
    if (estSignale(rang)) {
      memoriser(signales.filter((s) => s.id !== id));
      return;
    }
    memoriser([
      {
        id,
        graine,
        rang,
        entree: c.entree,
        ttc: c.sim.ttc,
        note: "",
        quand: new Date().toISOString(),
      },
      ...signales,
    ]);
  };

  return (
    <div className="px-6 py-7 md:px-10">
      {/* ── Réglages du tirage ── */}
      <div className="mb-6 rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-end gap-5">
          <Champ label="Devis à tirer" aide="jusqu'à 10">
            <input
              type="range"
              min={1}
              max={10}
              value={nombre}
              onChange={(e) => setNombre(Number(e.target.value))}
              className="w-40 accent-[var(--color-accent)]"
            />
            <span className="ml-3 font-serif text-xl tnum">{nombre}</span>
          </Champ>

          <Champ label="Volume" aide="m³">
            <Paire
              min={bornes.volumeMin}
              max={bornes.volumeMax}
              onMin={(v) => setBornes({ ...bornes, volumeMin: Math.min(v, bornes.volumeMax) })}
              onMax={(v) => setBornes({ ...bornes, volumeMax: Math.max(v, bornes.volumeMin) })}
            />
          </Champ>

          <Champ label="Distance" aide="km">
            <Paire
              min={bornes.distanceMin}
              max={bornes.distanceMax}
              pas={10}
              onMin={(v) => setBornes({ ...bornes, distanceMin: Math.min(v, bornes.distanceMax) })}
              onMax={(v) => setBornes({ ...bornes, distanceMax: Math.max(v, bornes.distanceMin) })}
            />
          </Champ>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bornes.supplements}
              onChange={(e) => setBornes({ ...bornes, supplements: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            Tirer aussi des suppléments
          </label>

          <button
            onClick={() => {
              setGraine((g) => g + 1);
              setOuverts(new Set());
            }}
            className="ml-auto rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            Relancer le tirage
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line pt-3 text-[12.5px] text-ink-soft">
          <span>
            Tirage n° <span className="font-medium text-ink tnum">{graine}</span> — reproductible
          </span>
          <span>
            Moyenne : <span className="font-medium text-ink tnum">{eur(moyenne)}</span> TTC
          </span>
          <span>
            {alertes === 0
              ? "aucune alerte du moteur"
              : `${alertes} cas ${alertes > 1 ? "portent" : "porte"} une alerte`}
          </span>
        </div>
      </div>

      {/* ── Cas signalés ── */}
      {signales.length > 0 && (
        <section className="mb-6 rounded-2xl border border-warn/30 bg-warn/5 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-lg">
              Résultats signalés <span className="text-ink-soft tnum">({signales.length})</span>
            </h2>
            <button
              onClick={() => memoriser([])}
              className="text-[12.5px] text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Tout effacer
            </button>
          </div>
          <div className="space-y-2">
            {signales.map((s) => (
              <div key={s.id} className="rounded-xl border border-line bg-card p-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <span className="font-medium">{eur(s.ttc)} TTC</span>
                  <span className="text-ink-soft">
                    {s.entree.volume_m3} m³ · {s.entree.distance_km} km ·{" "}
                    {FORMULES.find((f) => f.key === s.entree.formule)?.label}
                  </span>
                  <span className="text-[11.5px] text-ink-soft">
                    tirage {s.graine}, cas {s.rang + 1}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {s.graine !== graine && (
                      <button
                        onClick={() => {
                          setGraine(s.graine);
                          setOuverts(new Set([s.rang]));
                        }}
                        className="rounded-lg border border-line-strong px-2.5 py-1 text-[11.5px] transition hover:border-ink"
                      >
                        Revoir ce tirage
                      </button>
                    )}
                    <button
                      onClick={() => memoriser(signales.filter((x) => x.id !== s.id))}
                      className="rounded-lg px-2 py-1 text-[11.5px] text-ink-soft transition hover:text-ink"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
                <input
                  value={s.note}
                  onChange={(e) =>
                    memoriser(signales.map((x) => (x.id === s.id ? { ...x, note: e.target.value } : x)))
                  }
                  placeholder="Ce qui pose question…"
                  className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-[12.5px] outline-none transition focus:border-accent"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Les cas tirés ── */}
      <div className="space-y-3">
        {cas.map((c, i) => {
          const ouvert = ouverts.has(i);
          const marque = estSignale(i);
          return (
            <article
              key={i}
              className={`rounded-2xl border bg-card transition ${
                marque ? "border-warn/50" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
                <span className="w-7 shrink-0 text-center text-[12.5px] text-ink-soft tnum">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-medium text-accent-dark">
                  {FORMULES.find((f) => f.key === c.entree.formule)?.label}
                </span>

                <span className="text-[13.5px]">
                  <span className="font-medium tnum">{c.entree.volume_m3} m³</span>
                  <span className="mx-2 text-ink-soft">·</span>
                  <span className="font-medium tnum">{c.entree.distance_km} km</span>
                </span>

                <span className="text-[12px] text-ink-soft">
                  {nb(c.sim.tarif_m3)} €/m³ — {c.sim.tranche_volume}, {c.sim.tranche_distance}
                </span>

                {resume(c.entree).map((t) => (
                  <span key={t} className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-soft">
                    {t}
                  </span>
                ))}

                {c.sim.alertes.length > 0 && (
                  <span
                    className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn"
                    title={c.sim.alertes.join("\n")}
                  >
                    {c.sim.alertes.length} alerte{c.sim.alertes.length > 1 ? "s" : ""}
                  </span>
                )}

                <span className="ml-auto flex items-center gap-3">
                  <span className="text-right">
                    <span className="block font-serif text-[22px] leading-none tnum">
                      {eur(c.sim.ttc)}
                    </span>
                    <span className="block text-[11px] text-ink-soft tnum">
                      {eur(c.sim.ht)} HT
                    </span>
                  </span>

                  <button
                    onClick={() => basculer(i, c)}
                    title={marque ? "Ne plus signaler" : "Signaler ce résultat"}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                      marque ? "bg-warn/15 text-warn" : "text-ink-soft hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    <IconDrapeau plein={marque} />
                  </button>

                  <button
                    onClick={() =>
                      setOuverts((o) => {
                        const n = new Set(o);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className="rounded-xl border border-line-strong px-3 py-2 text-[12.5px] transition hover:border-ink"
                  >
                    {ouvert ? "Masquer" : "Détail"}
                  </button>
                </span>
              </div>

              {ouvert && (
                <div className="border-t border-line px-4 py-4">
                  <div className="divide-y divide-line">
                    {c.sim.lines.map((l, j) => (
                      <div key={j} className="flex items-baseline justify-between gap-6 py-2">
                        <div>
                          <div className="text-[13px]">{l.label}</div>
                          {l.detail && (
                            <div className="text-[11.5px] text-ink-soft">{l.detail}</div>
                          )}
                        </div>
                        <div className="shrink-0 text-[13px] tnum">{eur(l.amount)}</div>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between gap-6 py-2 text-[13px]">
                      <span className="text-ink-soft">
                        Transport {eur(c.sim.transport)} · suppléments {eur(c.sim.supplements)} ·
                        TVA {eur(c.sim.tva)}
                      </span>
                      <span className="font-medium tnum">{eur(c.sim.ttc)} TTC</span>
                    </div>
                  </div>

                  {c.sim.alertes.length > 0 && (
                    <ul className="mt-3 space-y-1.5 rounded-xl border border-warn/30 bg-warn/5 p-3 text-[12.5px]">
                      {c.sim.alertes.map((a) => (
                        <li key={a} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ul className="mt-2 text-[11.5px] text-ink-soft">
                    {c.sim.mentions.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** Les suppléments tirés, en étiquettes courtes. */
function resume(e: SimulationInput): string[] {
  const t: string[] = [];
  if (e.voyage_special) t.push(`voyage spécial +${Math.round(SUPPLEMENTS.voyageSpecialPct * 100)} %`);
  if (e.portage_depart_m) t.push(`portage départ ${e.portage_depart_m} m`);
  if (e.portage_arrivee_m) t.push(`portage arrivée ${e.portage_arrivee_m} m`);
  if (e.transbordement) t.push("transbordement");
  if (e.monte_meubles) t.push(`monte-meubles ×${e.monte_meubles}`);
  if (e.piano_droit) t.push("piano droit");
  if (e.charges_lourdes) t.push(`charge lourde ×${e.charges_lourdes}`);
  if (e.valeur_declaree) t.push(`garantie ${(e.valeur_declaree / 1000).toFixed(0)} k€`);
  return t;
}

function Champ({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-ink-soft">
        {label}
        {aide && <span className="ml-1.5 text-[11px]">{aide}</span>}
      </span>
      <span className="flex items-center">{children}</span>
    </label>
  );
}

function Paire({
  min,
  max,
  pas = 1,
  onMin,
  onMax,
}: {
  min: number;
  max: number;
  pas?: number;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
}) {
  const style =
    "w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right text-sm tnum outline-none transition focus:border-accent";
  return (
    <span className="flex items-center gap-2">
      <input type="number" step={pas} min={0} value={min} onChange={(e) => onMin(Number(e.target.value))} className={style} />
      <span className="text-ink-soft">→</span>
      <input type="number" step={pas} min={0} value={max} onChange={(e) => onMax(Number(e.target.value))} className={style} />
    </span>
  );
}

function IconDrapeau({ plein }: { plein: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill={plein ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" fill="none" />
    </svg>
  );
}
