"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type EstimateInput = {
  volume_m3?: number;
  distance_km?: number;
  depart_etage?: number;
  depart_ascenseur?: boolean;
  services?: { emballage?: boolean; monte_meuble?: boolean };
};

export type Quote = { lines: { label: string; amount: number }[]; ht: number; tva: number; ttc: number };

async function fetchQuote(input: EstimateInput): Promise<Quote | null> {
  try {
    const r = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/* ---------- Résultat instantané : barre de génération puis devis ---------- */

export function InstantResult({ input, reference, volume }: { input: EstimateInput; reference: string; volume: number | null }) {
  const [progress, setProgress] = useState(6);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [ready, setReady] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const iv = setInterval(() => setProgress((p) => Math.min(92, p + 7)), 110);
    const done = (q: Quote | null) => {
      clearInterval(iv);
      setQuote(q);
      setProgress(100);
      setTimeout(() => setReady(true), 450);
    };
    fetchQuote(input).then(done).catch(() => done(null));
    return () => clearInterval(iv);
  }, [input]);

  if (!ready) {
    return (
      <Shell>
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-2xl">📄</div>
          <h1 className="font-serif text-3xl">Génération de votre devis…</h1>
          <p className="mt-2 text-sm text-ink-soft">Nous chiffrons votre déménagement{volume != null ? ` (~${volume} m³)` : ""}.</p>
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-accent transition-all duration-200 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-xs tabular-nums text-ink-soft">{progress}%</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-lg animate-fade-up">
        <div className="text-center">
          <div className="eyebrow text-accent">Votre proposition</div>
          <h1 className="mt-2 font-serif text-4xl">Devis estimatif</h1>
          <p className="mt-2 text-sm text-ink-soft">Établi automatiquement selon les informations transmises.</p>
        </div>

        {quote ? (
          <div className="mt-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line/70">
                {quote.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 text-ink-soft">{l.label}</td>
                    <td className="py-2 text-right tabular-nums">{l.amount.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-soft">Total estimé</span>
              <span className="font-serif text-3xl text-accent">{eur(quote.ttc)} <span className="text-base text-ink-soft">TTC</span></span>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-line bg-card p-6 text-center text-sm text-ink-soft">
            Votre demande est bien enregistrée. Un conseiller vous adresse votre devis détaillé très vite.
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-subtle/60 px-4 py-3 text-sm">
          <span className="text-ink-soft">Un conseiller vous recontacte pour finaliser.</span>
          <span className="text-ink-soft">Réf. <span className="font-mono text-ink">{reference.slice(0, 8)}</span></span>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">{children}</div>;
}

/* ---------- Comparateur de scénarios ---------- */

type Variant = { volume: string; distance: string; etage: string; ascenseur: boolean; emballage: boolean; monteMeuble: boolean };

const blank = (v?: Partial<Variant>): Variant => ({ volume: "", distance: "", etage: "0", ascenseur: false, emballage: false, monteMeuble: false, ...v });

export function Comparateur({ initial, onClose }: { initial: Partial<Variant>; onClose: () => void }) {
  const [cols, setCols] = useState<Variant[]>([blank(initial), blank(initial)]);
  const [quotes, setQuotes] = useState<(Quote | null)[]>([]);

  const inputs = useMemo(
    () =>
      cols.map((c) => ({
        volume_m3: Number(c.volume) || 0,
        distance_km: Number(c.distance) || 0,
        depart_etage: Number(c.etage) || 0,
        depart_ascenseur: c.ascenseur,
        services: { emballage: c.emballage, monte_meuble: c.monteMeuble },
      })),
    [cols],
  );

  useEffect(() => {
    const t = setTimeout(async () => {
      setQuotes(await Promise.all(inputs.map(fetchQuote)));
    }, 350);
    return () => clearTimeout(t);
  }, [inputs]);

  const ttcs = quotes.map((q) => q?.ttc ?? Infinity);
  const cheapest = ttcs.length ? ttcs.indexOf(Math.min(...ttcs)) : -1;

  const patch = (i: number, p: Partial<Variant>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const addCol = () => setCols((cs) => (cs.length < 3 ? [...cs, blank(cs[cs.length - 1])] : cs));
  const removeCol = (i: number) => setCols((cs) => (cs.length > 2 ? cs.filter((_, j) => j !== i) : cs));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm md:p-10">
      <div className="w-full max-w-5xl rounded-2xl border border-line bg-paper p-6 shadow-[var(--shadow-md)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl">Comparer des scénarios</h2>
            <p className="text-sm text-ink-soft">Faites varier les paramètres — l&apos;estimation se met à jour en direct.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:text-ink">Fermer ✕</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cols.map((c, i) => {
            const q = quotes[i];
            const best = i === cheapest && q != null;
            return (
              <div key={i} className={`rounded-2xl border-2 bg-card p-4 transition ${best ? "border-accent" : "border-line"}`}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{i === 0 ? "Votre demande" : `Variante ${i}`}</span>
                  {cols.length > 2 && i > 0 && (
                    <button onClick={() => removeCol(i)} className="text-xs text-ink-soft hover:text-ink">retirer</button>
                  )}
                </div>
                <div className="space-y-2.5">
                  <NumF label="Volume (m³)" value={c.volume} onChange={(v) => patch(i, { volume: v })} />
                  <NumF label="Distance (km)" value={c.distance} onChange={(v) => patch(i, { distance: v })} />
                  <NumF label="Étage départ" value={c.etage} onChange={(v) => patch(i, { etage: v })} />
                  <Toggle label="Ascenseur départ" checked={c.ascenseur} onChange={(v) => patch(i, { ascenseur: v })} />
                  <Toggle label="Emballage" checked={c.emballage} onChange={(v) => patch(i, { emballage: v })} />
                  <Toggle label="Monte-meuble" checked={c.monteMeuble} onChange={(v) => patch(i, { monteMeuble: v })} />
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-line pt-3">
                  <span className="text-xs text-ink-soft">Total TTC</span>
                  <span className="font-serif text-2xl text-accent">{q ? eur(q.ttc) : "—"}</span>
                </div>
                {best && <div className="mt-2 rounded-full bg-accent-soft px-2 py-0.5 text-center text-[11px] font-medium text-accent">Le plus avantageux</div>}
              </div>
            );
          })}
          {cols.length < 3 && (
            <button onClick={addCol} className="flex min-h-[180px] items-center justify-center rounded-2xl border-2 border-dashed border-line text-sm text-ink-soft transition hover:border-accent hover:text-accent">
              + Ajouter une variante
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NumF({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-soft">{label}</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-accent" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-sm">
      <span className="text-ink-soft">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
    </label>
  );
}
