"use client";

import { useEffect, useState } from "react";
import TrajetMap from "@/components/TrajetMap";

/* ---------- Résultat instantané : génération puis devis complet (PDF + montant) ---------- */

type DevisData = {
  id: string; reference: string; montant_ht: number; montant_tva: number; montant_ttc: number;
  lignes: { label: string; amount: number }[]; valid_until: string | null;
  ville_depart: string | null; ville_arrivee: string | null; volume_m3: number | null;
};
const euro = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export function InstantResult({ requestId, volume, count = 1, onNewQuote, onVariant }: { requestId: string; volume: number | null; count?: number; onNewQuote?: () => void; onVariant?: () => void }) {
  const DURATION = 21000; // ≥ 20 s de génération visible
  const STEPS = [
    "Analyse de votre projet…",
    "Calcul du volume et de la distance…",
    "Application de la grille tarifaire…",
    "Prise en compte des accès et prestations…",
    "Optimisation de votre estimation…",
    "Édition de votre devis…",
  ];
  const [progress, setProgress] = useState(2);
  const [msg, setMsg] = useState(0);
  const [ready, setReady] = useState(false);
  const [devis, setDevis] = useState<DevisData | null>(null);

  useEffect(() => {
    // Récupère le devis généré (avec quelques tentatives si la qualification finit à peine).
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 6 && !cancelled; i++) {
        try {
          const r = await fetch(`/api/requests/${requestId}/devis`);
          if (r.ok) { const d = await r.json(); if (!cancelled) setDevis(d); break; }
        } catch { /* retry */ }
        await new Promise((res) => setTimeout(res, 1500));
      }
    })();
    return () => { cancelled = true; };
  }, [requestId]);

  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      setProgress(Math.min(98, Math.round(t * 98)));
      setMsg(Math.min(STEPS.length - 1, Math.floor(t * STEPS.length)));
    }, 250);
    const done = setTimeout(() => {
      clearInterval(iv);
      setProgress(100);
      setTimeout(() => setReady(true), 500);
    }, DURATION);
    return () => { clearInterval(iv); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <Shell>
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-2xl">📄</div>
          <h1 className="font-serif text-3xl">{count > 1 ? "Génération de vos devis…" : "Génération de votre devis…"}</h1>
          <p className="mt-2 h-5 text-sm text-ink-soft transition-all">{STEPS[msg]}</p>
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-accent transition-all duration-200 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-6 text-xs text-ink-soft">Cela prend une vingtaine de secondes — merci de patienter.</p>
        </div>
      </Shell>
    );
  }

  // Plusieurs demandes (via le comparateur) : confirmation sans détailler chaque prix.
  if (count > 1) {
    return (
      <Shell>
        <div className="w-full max-w-md animate-fade-up text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-2xl text-good">✓</div>
          <h1 className="font-serif text-4xl">Vos {count} devis sont prêts</h1>
          <p className="mt-3 text-ink-soft">Nous vous adressons un devis pour chaque scénario par e-mail.</p>
          {onNewQuote && (
            <button onClick={onNewQuote} className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark">Faire une nouvelle demande</button>
          )}
        </div>
      </Shell>
    );
  }

  // Devis unique : on affiche le montant, le résumé et le PDF complet.
  return (
    <div className="min-h-screen bg-paper px-5 py-12 md:px-8">
      <div className="mx-auto max-w-3xl animate-fade-up">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-good/15 text-2xl text-good">✓</div>
          <div className="eyebrow text-accent">Votre proposition</div>
          <h1 className="mt-2 font-serif text-4xl">Votre devis est prêt</h1>
          <p className="mt-2 text-sm text-ink-soft">Estimation établie selon les informations transmises.</p>
        </div>

        {devis ? (
          <>
            <div className="mt-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm text-ink-soft">{devis.ville_depart ?? "?"} → {devis.ville_arrivee ?? "?"}{devis.volume_m3 != null ? ` · ~${devis.volume_m3} m³` : ""}</div>
                  <div className="mt-0.5 text-xs text-ink-soft">Devis {devis.reference}{devis.valid_until ? ` · valable jusqu'au ${new Date(devis.valid_until).toLocaleDateString("fr-FR")}` : ""}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-ink-soft">Total estimé</div>
                  <div className="font-serif text-4xl text-accent">{euro(devis.montant_ttc)} <span className="text-base text-ink-soft">TTC</span></div>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line/70">
                  {(devis.lignes ?? []).map((l, i) => (
                    <tr key={i}><td className="py-2 text-ink-soft">{l.label}</td><td className="py-2 text-right tabular-nums">{l.amount.toFixed(2)} €</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line"><td className="py-2 text-ink-soft">Total HT</td><td className="py-2 text-right tabular-nums">{devis.montant_ht.toFixed(2)} €</td></tr>
                  <tr><td className="py-1 text-ink-soft">TVA</td><td className="py-1 text-right tabular-nums">{devis.montant_tva.toFixed(2)} €</td></tr>
                </tfoot>
              </table>
            </div>

            {/* Carte du trajet */}
            {(devis.ville_depart || devis.ville_arrivee) && (
              <div className="mt-6">
                <TrajetMap departVille={devis.ville_depart} arriveeVille={devis.ville_arrivee} height={280} />
              </div>
            )}

            {/* PDF complet */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <span className="font-serif text-lg">Votre devis</span>
                <a href={`/api/devis/${devis.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark">⬇ Télécharger le PDF</a>
              </div>
              <iframe src={`/api/devis/${devis.id}/pdf`} title="Devis" className="h-[640px] w-full" />
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-line bg-card p-8 text-center text-sm text-ink-soft">
            Votre devis est en cours de finalisation — un conseiller vous l&apos;adresse par e-mail très vite.
          </div>
        )}

        {(onVariant || onNewQuote) && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {onVariant && (
              <button onClick={onVariant} className="rounded-lg border border-line-strong px-5 py-2.5 text-sm font-medium transition hover:bg-subtle">
                Demander une variante
              </button>
            )}
            {onNewQuote && (
              <button onClick={onNewQuote} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark">
                Demander un nouveau devis
              </button>
            )}
          </div>
        )}
      </div>
    </div>
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

type Variant = {
  volume: string; distance: string;
  departEtage: string; departAsc: boolean; departType: string;
  arriveeEtage: string; arriveeAsc: boolean; arriveeType: string;
  emballage: boolean; demontage: boolean; montage: boolean; monteMeuble: boolean; gardeMeuble: boolean;
  formule: "" | "eco" | "standard" | "luxe";
  include: boolean;
};

const blank = (v?: Partial<Variant>): Variant => ({
  volume: "", distance: "",
  departEtage: "0", departAsc: false, departType: "",
  arriveeEtage: "0", arriveeAsc: false, arriveeType: "",
  emballage: false, demontage: false, montage: false, monteMeuble: false, gardeMeuble: false,
  formule: "", include: true, ...v,
});

const LOGE = ["", "Studio", "T1", "T2", "T3", "T4", "T5+", "Maison"];

export function Comparateur({
  base,
  initial,
  simple = false,
  onClose,
  onDone,
}: {
  base: CompareBase;
  initial?: Partial<Variant>;
  simple?: boolean;
  onClose: () => void;
  onDone: (count: number, firstId: string) => void;
}) {
  const [cols, setCols] = useState<Variant[]>([blank(initial), blank(initial)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const included = cols.filter((c) => c.include);
  const missingBase = !base.nom || !base.email || !base.departVille || !base.arriveeVille;
  const canSubmit = !missingBase && included.length > 0 && included.every((c) => Number(c.volume) > 0);

  const patch = (i: number, p: Partial<Variant>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const addCol = () => setCols((cs) => (cs.length < 3 ? [...cs, blank(cs[cs.length - 1])] : cs));
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
            depart: { ville: base.departVille || undefined, code_postal: base.departCP || undefined, etage: Number(c.departEtage) || 0, ascenseur: c.departAsc, type_logement: c.departType || undefined },
            arrivee: { ville: base.arriveeVille || undefined, etage: Number(c.arriveeEtage) || 0, ascenseur: c.arriveeAsc, type_logement: c.arriveeType || undefined },
            date_souhaitee: base.date || undefined,
            distance_km: Number(c.distance) || undefined,
            formule: c.formule || undefined,
            volume: { method: "explicit", volume_m3: Number(c.volume) || 0 },
            services: { emballage: c.emballage, demontage: c.demontage, montage: c.montage, monte_meuble: c.monteMeuble, garde_meuble: c.gardeMeuble },
            type_client: "particulier",
            details: { variante: i } as unknown as Record<string, unknown>,
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
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm md:p-8">
      <div className={`w-full ${simple ? "max-w-3xl" : "max-w-6xl"} rounded-2xl border border-line bg-paper p-6 shadow-[var(--shadow-md)]`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">Comparer plusieurs scénarios</h2>
            <p className="text-sm text-ink-soft">
              Trajet : <span className="font-medium text-ink">{base.departVille || "?"} → {base.arriveeVille || "?"}</span>. Faites varier tous les paramètres — chaque variante ajoutée devient une demande, et vous recevrez un devis pour chacune par e-mail.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:text-ink">Fermer ✕</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {cols.map((c, i) => (
            <div key={i} className={`rounded-2xl border-2 bg-card p-4 transition ${c.include ? "border-accent" : "border-line"}`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">{i === 0 ? "Votre demande" : `Variante ${i}`}</span>
                {cols.length > 2 && i > 0 && <button onClick={() => removeCol(i)} className="text-xs text-ink-soft hover:text-ink">retirer</button>}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <NumF label="Volume (m³) *" value={c.volume} onChange={(v) => patch(i, { volume: v })} />
                  <NumF label="Distance (km)" value={c.distance} onChange={(v) => patch(i, { distance: v })} />
                </div>

                {!simple && (
                  <>
                    <Group title="Départ">
                      <div className="grid grid-cols-2 gap-2">
                        <NumF label="Étage" value={c.departEtage} onChange={(v) => patch(i, { departEtage: v })} />
                        <SelF label="Logement" value={c.departType} options={LOGE} onChange={(v) => patch(i, { departType: v })} />
                      </div>
                      <Toggle label="Ascenseur" checked={c.departAsc} onChange={(v) => patch(i, { departAsc: v })} />
                    </Group>

                    <Group title="Arrivée">
                      <div className="grid grid-cols-2 gap-2">
                        <NumF label="Étage" value={c.arriveeEtage} onChange={(v) => patch(i, { arriveeEtage: v })} />
                        <SelF label="Logement" value={c.arriveeType} options={LOGE} onChange={(v) => patch(i, { arriveeType: v })} />
                      </div>
                      <Toggle label="Ascenseur" checked={c.arriveeAsc} onChange={(v) => patch(i, { arriveeAsc: v })} />
                    </Group>

                    <Group title="Prestations">
                      <Toggle label="Emballage" checked={c.emballage} onChange={(v) => patch(i, { emballage: v })} />
                      <Toggle label="Démontage" checked={c.demontage} onChange={(v) => patch(i, { demontage: v })} />
                      <Toggle label="Remontage" checked={c.montage} onChange={(v) => patch(i, { montage: v })} />
                      <Toggle label="Monte-meuble" checked={c.monteMeuble} onChange={(v) => patch(i, { monteMeuble: v })} />
                      <Toggle label="Garde-meuble" checked={c.gardeMeuble} onChange={(v) => patch(i, { gardeMeuble: v })} />
                    </Group>

                    <SelF label="Formule" value={c.formule} options={["", "eco", "standard", "luxe"]} labels={{ "": "— au choix —", eco: "Éco", standard: "Standard", luxe: "Confort" }} onChange={(v) => patch(i, { formule: v as Variant["formule"] })} />
                  </>
                )}
              </div>

              <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                <input type="checkbox" checked={c.include} onChange={(e) => patch(i, { include: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
                <span className="font-medium">Ajouter à ma demande</span>
              </label>
            </div>
          ))}
          {cols.length < 3 && (
            <button onClick={addCol} className={`flex ${simple ? "min-h-[140px]" : "min-h-[300px]"} items-center justify-center rounded-2xl border-2 border-dashed border-line text-sm text-ink-soft transition hover:border-accent hover:text-accent`}>
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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-paper/50 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SelF({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-soft">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent">
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? (o === "" ? "—" : o)}</option>)}
      </select>
    </label>
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
