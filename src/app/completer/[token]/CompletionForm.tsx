"use client";

import { useState } from "react";
import { CATALOG, LOGEMENT_HINTS } from "@/lib/catalog";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import type { AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import { completeRequest } from "@/lib/actions/completion";

type Mode = "explicit" | "list" | "ai";

export default function CompletionForm({
  token, library, client, manque, villes,
}: {
  token: string;
  library: LibraryPhoto[];
  client: string | null;
  manque: { volume: boolean; depart: boolean; arrivee: boolean };
  villes: { depart: string | null; arrivee: string | null };
}) {
  const [departVille, setDepartVille] = useState(villes.depart ?? "");
  const [departCP, setDepartCP] = useState("");
  const [arriveeVille, setArriveeVille] = useState(villes.arrivee ?? "");
  const [arriveeCP, setArriveeCP] = useState("");
  const [mode, setMode] = useState<Mode>("explicit");
  const [explicitVolume, setExplicitVolume] = useState("");
  const [items, setItems] = useState<{ label: string; quantite: number; volume_unitaire_m3: number }[]>([]);
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volume =
    mode === "explicit" ? (isNaN(parseFloat(explicitVolume)) ? null : Math.round(parseFloat(explicitVolume) * 100) / 100)
    : mode === "list" ? (items.length ? Math.round(items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0) * 100) / 100 : null)
    : (photos.length ? Math.round(photos.reduce((s, p) => s + p.volume_m3, 0) * 100) / 100 : null);

  const needVolume = manque.volume;
  const canSubmit =
    (!needVolume || volume != null) &&
    (!manque.depart || departVille.trim()) &&
    (!manque.arrivee || arriveeVille.trim());

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await completeRequest(token, {
        volume_m3: volume,
        volume_method: volume != null ? mode : null,
        photos: mode === "ai" ? (photos as never) : undefined,
        items: mode === "list" ? items : undefined,
        depart: manque.depart ? { ville: departVille, code_postal: departCP } : undefined,
        arrivee: manque.arrivee ? { ville: arriveeVille, code_postal: arriveeCP } : undefined,
      });
      if (!r.ok) throw new Error(r.error ?? "Erreur");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <div className="animate-fade-up">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-2xl text-good">✓</div>
          <h1 className="font-serif text-4xl">Merci !</h1>
          <p className="mt-3 text-ink-soft">Votre demande est complétée{volume != null ? ` (~${volume} m³)` : ""}. Nos experts reviennent vers vous très vite.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-12 md:px-8">
      <div className="font-serif text-3xl font-semibold">Bailly</div>
      <div className="eyebrow mt-1 text-ink-soft">Déménagement</div>
      <h1 className="mt-6 font-serif text-4xl leading-tight">
        {client ? `${client}, complétez votre demande` : "Complétez votre demande"}
      </h1>
      <p className="mt-2 text-ink-soft">Il ne manque que quelques informations pour finaliser votre estimation.</p>

      <div className="mt-8 space-y-8">
        {(manque.depart || manque.arrivee) && (
          <section>
            <h2 className="mb-3 font-serif text-xl">Adresses</h2>
            <div className="space-y-4">
              {manque.depart && (
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <Input label="CP départ" value={departCP} onChange={setDepartCP} placeholder="69003" />
                  <Input label="Ville de départ *" value={departVille} onChange={setDepartVille} placeholder="Lyon" />
                </div>
              )}
              {manque.arrivee && (
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <Input label="CP arrivée" value={arriveeCP} onChange={setArriveeCP} placeholder="31000" />
                  <Input label="Ville d'arrivée *" value={arriveeVille} onChange={setArriveeVille} placeholder="Toulouse" />
                </div>
              )}
            </div>
          </section>
        )}

        {needVolume && (
          <section>
            <h2 className="mb-3 font-serif text-xl">Votre volume à déménager</h2>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {([["explicit", "Je connais", "mon volume"], ["list", "Je liste", "mes meubles"], ["ai", "J'envoie", "des photos"]] as const).map(([m, a, b]) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${mode === m ? "border-accent bg-accent-soft/50" : "border-line bg-card hover:border-line-strong"}`}>
                  <div className="font-serif text-base leading-tight">{a}</div>
                  <div className="text-xs text-ink-soft">{b}</div>
                </button>
              ))}
            </div>

            {mode === "explicit" && (
              <div className="space-y-3">
                <input type="number" min={0} step="0.5" value={explicitVolume} onChange={(e) => setExplicitVolume(e.target.value)} placeholder="Volume estimé en m³"
                  className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-accent" />
                <div className="flex flex-wrap gap-2">
                  {LOGEMENT_HINTS.map((h) => (
                    <button key={h.label} type="button" onClick={() => setExplicitVolume(String(h.volume))}
                      className="rounded-full border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent">{h.label} · ~{h.volume} m³</button>
                  ))}
                </div>
              </div>
            )}
            {mode === "list" && <ListPicker items={items} setItems={setItems} />}
            {mode === "ai" && <PhotoAnalyzer library={library} photos={photos} onChange={setPhotos} />}
          </section>
        )}
      </div>

      {error && <div className="mt-6 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">{error}</div>}

      <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
        <span className="text-sm text-ink-soft">{volume != null ? `Volume : ${volume} m³` : needVolume ? "Renseignez le volume" : ""}</span>
        <button onClick={submit} disabled={!canSubmit || submitting}
          className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? "Envoi…" : "Valider ma demande"}
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-accent" />
    </label>
  );
}

function ListPicker({ items, setItems }: { items: { label: string; quantite: number; volume_unitaire_m3: number }[]; setItems: (v: typeof items) => void }) {
  const total = items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0);
  const groupes = [...new Set(CATALOG.map((c) => c.groupe))];
  const add = (label: string) => {
    const p = CATALOG.find((c) => c.label === label); if (!p) return;
    const i = items.findIndex((it) => it.label === label);
    if (i >= 0) { const cp = [...items]; cp[i] = { ...cp[i], quantite: cp[i].quantite + 1 }; setItems(cp); }
    else setItems([...items, { label, quantite: 1, volume_unitaire_m3: p.volume }]);
  };
  const setQty = (i: number, q: number) => { if (q <= 0) return setItems(items.filter((_, idx) => idx !== i)); const cp = [...items]; cp[i] = { ...cp[i], quantite: q }; setItems(cp); };
  return (
    <div className="space-y-4">
      {groupes.map((g) => (
        <div key={g}>
          <div className="mb-1.5 text-sm font-medium text-ink-soft">{g}</div>
          <div className="flex flex-wrap gap-1.5">
            {CATALOG.filter((c) => c.groupe === g).map((c) => (
              <button key={c.label} type="button" onClick={() => add(c.label)} className="rounded-full border border-line bg-card px-2.5 py-1 text-xs transition hover:border-accent hover:text-accent">+ {c.label}</button>
            ))}
          </div>
        </div>
      ))}
      {items.length > 0 && (
        <div className="rounded-xl border border-line bg-card">
          {items.map((it, i) => (
            <div key={it.label} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-0">
              <span className="flex-1 truncate text-sm">{it.label}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setQty(i, it.quantite - 1)} className="h-6 w-6 rounded-md border border-line text-ink-soft">−</button>
                <span className="w-6 text-center text-sm tabular-nums">{it.quantite}</span>
                <button type="button" onClick={() => setQty(i, it.quantite + 1)} className="h-6 w-6 rounded-md border border-line text-ink-soft">+</button>
              </div>
              <span className="w-16 text-right text-sm tabular-nums">{(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 font-medium"><span>Total</span><span className="tabular-nums">{total.toFixed(1)} m³</span></div>
        </div>
      )}
    </div>
  );
}
