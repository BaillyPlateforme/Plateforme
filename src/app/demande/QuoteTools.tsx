"use client";

import { useEffect, useState } from "react";

/* ---------- Résultat instantané : génération puis confirmation (sans prix) ---------- */

export function InstantResult({ reference, volume, count = 1 }: { reference: string; volume: number | null; count?: number }) {
  const [progress, setProgress] = useState(8);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setProgress((p) => Math.min(96, p + 8)), 130);
    const t = setTimeout(() => {
      clearInterval(iv);
      setProgress(100);
      setTimeout(() => setReady(true), 350);
    }, 1500);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, []);

  if (!ready) {
    return (
      <Shell>
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-2xl">📄</div>
          <h1 className="font-serif text-3xl">{count > 1 ? "Génération de vos devis…" : "Génération de votre devis…"}</h1>
          <p className="mt-2 text-sm text-ink-soft">Nous préparons votre déménagement{volume != null ? ` (~${volume} m³)` : ""}.</p>
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
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-2xl text-good">✓</div>
        <h1 className="font-serif text-4xl">{count > 1 ? `Vos ${count} devis sont prêts` : "Votre devis est prêt"}</h1>
        <p className="mt-3 text-ink-soft">
          {count > 1
            ? "Nos experts finalisent vos propositions et vous les adressent par e-mail très vite."
            : "Nos experts finalisent votre proposition et vous l'adressent par e-mail très vite."}
        </p>
        <div className="mt-6 inline-block rounded-lg border border-line bg-card px-4 py-2 text-sm text-ink-soft">
          Référence : <span className="font-mono text-ink">{reference.slice(0, 8)}</span>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">{children}</div>;
}

/* ---------- Comparateur de scénarios (sans prix) ---------- */

export type CompareBase = {
  nom: string;
  email: string;
  tel: string;
  departVille: string;
  departCP: string;
  arriveeVille: string;
  date: string;
};

type Variant = { volume: string; distance: string; etage: string; ascenseur: boolean; emballage: boolean; monteMeuble: boolean; include: boolean };

const blank = (v?: Partial<Variant>): Variant => ({ volume: "", distance: "", etage: "0", ascenseur: false, emballage: false, monteMeuble: false, include: true, ...v });

export function Comparateur({
  base,
  initialVolume,
  onClose,
  onDone,
}: {
  base: CompareBase;
  initialVolume: string;
  onClose: () => void;
  onDone: (count: number, firstId: string) => void;
}) {
  const [cols, setCols] = useState<Variant[]>([blank({ volume: initialVolume }), blank({ volume: initialVolume })]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const included = cols.filter((c) => c.include);
  const missingBase = !base.nom || !base.email || !base.departVille || !base.arriveeVille;
  const canSubmit = !missingBase && included.length > 0 && included.every((c) => Number(c.volume) > 0);

  const patch = (i: number, p: Partial<Variant>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const addCol = () => setCols((cs) => (cs.length < 3 ? [...cs, blank({ volume: cs[cs.length - 1].volume })] : cs));
  const removeCol = (i: number) => setCols((cs) => (cs.length > 2 ? cs.filter((_, j) => j !== i) : cs));

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!c.include) continue;
        const res = await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client: { nom: base.nom, email: base.email, tel: base.tel || undefined },
            depart: { ville: base.departVille || undefined, code_postal: base.departCP || undefined, etage: Number(c.etage) || 0, ascenseur: c.ascenseur },
            arrivee: { ville: base.arriveeVille || undefined },
            date_souhaitee: base.date || undefined,
            distance_km: Number(c.distance) || undefined,
            volume: { method: "explicit", volume_m3: Number(c.volume) || 0 },
            services: { emballage: c.emballage, monte_meuble: c.monteMeuble },
            type_client: "particulier",
            details: { express: true, variante: i } as unknown as Record<string, unknown>,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
        ids.push(data.id);
      }
      onDone(ids.length, ids[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm md:p-10">
      <div className="w-full max-w-5xl rounded-2xl border border-line bg-paper p-6 shadow-[var(--shadow-md)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">Comparer plusieurs scénarios</h2>
            <p className="text-sm text-ink-soft">Créez des variantes de votre déménagement — chaque variante ajoutée devient une demande et vous recevrez un devis pour chacune par e-mail.</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:text-ink">Fermer ✕</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cols.map((c, i) => (
            <div key={i} className={`rounded-2xl border-2 bg-card p-4 transition ${c.include ? "border-accent" : "border-line"}`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">{i === 0 ? "Votre demande" : `Variante ${i}`}</span>
                {cols.length > 2 && i > 0 && (
                  <button onClick={() => removeCol(i)} className="text-xs text-ink-soft hover:text-ink">retirer</button>
                )}
              </div>
              <div className="space-y-2.5">
                <NumF label="Volume (m³) *" value={c.volume} onChange={(v) => patch(i, { volume: v })} />
                <NumF label="Distance (km)" value={c.distance} onChange={(v) => patch(i, { distance: v })} />
                <NumF label="Étage départ" value={c.etage} onChange={(v) => patch(i, { etage: v })} />
                <Toggle label="Ascenseur départ" checked={c.ascenseur} onChange={(v) => patch(i, { ascenseur: v })} />
                <Toggle label="Emballage" checked={c.emballage} onChange={(v) => patch(i, { emballage: v })} />
                <Toggle label="Monte-meuble" checked={c.monteMeuble} onChange={(v) => patch(i, { monteMeuble: v })} />
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                <input type="checkbox" checked={c.include} onChange={(e) => patch(i, { include: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
                <span className="font-medium">Ajouter à ma demande</span>
              </label>
            </div>
          ))}
          {cols.length < 3 && (
            <button onClick={addCol} className="flex min-h-[220px] items-center justify-center rounded-2xl border-2 border-dashed border-line text-sm text-ink-soft transition hover:border-accent hover:text-accent">
              + Ajouter une variante
            </button>
          )}
        </div>

        {error && <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">{error}</div>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <span className="text-sm text-ink-soft">
            {missingBase
              ? "Renseignez d'abord nom, e-mail, ville de départ et d'arrivée dans le formulaire."
              : `${included.length} demande${included.length > 1 ? "s" : ""} — ${included.length} devis à recevoir`}
          </span>
          <button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Envoi…" : included.length > 1 ? `Envoyer mes ${included.length} demandes` : "Envoyer ma demande"}
          </button>
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
