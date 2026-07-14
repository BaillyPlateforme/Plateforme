"use client";

import { useState } from "react";
import { CATALOG, LOGEMENT_HINTS } from "@/lib/catalog";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import type { AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import { completeRequest } from "@/lib/actions/completion";

type Mode = "explicit" | "list" | "ai";

type Addr = {
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  etage: number | null;
  ascenseur: boolean | null;
};

type Data = {
  client_nom: string | null;
  client_email: string | null;
  client_tel: string | null;
  date_souhaitee: string | null;
  volume_m3: number | null;
  depart: Addr;
  arrivee: Addr;
};

type AddrState = { adresse: string; code_postal: string; ville: string; etage: string; ascenseur: boolean };

function toState(a: Addr): AddrState {
  return {
    adresse: a.adresse ?? "",
    code_postal: a.code_postal ?? "",
    ville: a.ville ?? "",
    etage: a.etage != null ? String(a.etage) : "",
    ascenseur: !!a.ascenseur,
  };
}

export default function CompletionForm({
  token,
  library,
  data,
}: {
  token: string;
  library: LibraryPhoto[];
  data: Data;
}) {
  const manque = {
    volume: data.volume_m3 == null,
    depart: !data.depart.ville,
    arrivee: !data.arrivee.ville,
  };

  // Contact
  const [nom, setNom] = useState(data.client_nom ?? "");
  const [tel, setTel] = useState(data.client_tel ?? "");
  const [date, setDate] = useState(data.date_souhaitee ?? "");

  // Adresses (objets éditables)
  const [depart, setDepart] = useState<AddrState>(toState(data.depart));
  const [arrivee, setArrivee] = useState<AddrState>(toState(data.arrivee));
  const patchDepart = (p: Partial<AddrState>) => setDepart((s) => ({ ...s, ...p }));
  const patchArrivee = (p: Partial<AddrState>) => setArrivee((s) => ({ ...s, ...p }));

  // Volume
  const [mode, setMode] = useState<Mode>("explicit");
  const [explicitVolume, setExplicitVolume] = useState("");
  const [items, setItems] = useState<{ label: string; quantite: number; volume_unitaire_m3: number }[]>([]);
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volume =
    mode === "explicit"
      ? isNaN(parseFloat(explicitVolume)) ? null : Math.round(parseFloat(explicitVolume) * 100) / 100
      : mode === "list"
        ? items.length ? Math.round(items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0) * 100) / 100 : null
        : photos.length ? Math.round(photos.reduce((s, p) => s + p.volume_m3, 0) * 100) / 100 : null;

  const canSubmit =
    (!manque.volume || volume != null) &&
    (!manque.depart || depart.ville.trim()) &&
    (!manque.arrivee || arrivee.ville.trim());

  const addrPayload = (a: AddrState) => ({
    ville: a.ville || undefined,
    adresse: a.adresse || undefined,
    code_postal: a.code_postal || undefined,
    etage: a.etage === "" ? null : Number(a.etage),
    ascenseur: a.ascenseur,
  });

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await completeRequest(token, {
        volume_m3: volume,
        volume_method: volume != null && manque.volume ? mode : null,
        photos: mode === "ai" && manque.volume ? (photos as never) : undefined,
        items: mode === "list" && manque.volume ? items : undefined,
        client: { nom, tel },
        depart: addrPayload(depart),
        arrivee: addrPayload(arrivee),
        date_souhaitee: date,
      });
      if (!r.ok) throw new Error(r.error ?? "Erreur");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
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

  const nbManque = Number(manque.volume) + Number(manque.depart) + Number(manque.arrivee);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-12 md:px-8">
      <div className="font-serif text-3xl font-semibold">Bailly</div>
      <div className="eyebrow mt-1 text-ink-soft">Déménagement</div>
      <h1 className="mt-6 font-serif text-4xl leading-tight">
        {data.client_nom ? `${data.client_nom}, complétez votre demande` : "Complétez votre demande"}
      </h1>
      <p className="mt-2 text-ink-soft">Vérifiez vos informations et renseignez ce qu&apos;il manque pour finaliser votre estimation.</p>

      {/* ===== À COMPLÉTER — mis en avant, en haut ===== */}
      {nbManque > 0 && (
        <section className="mt-8 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-amber-900">À compléter</span>
            {manque.volume && <MissingChip label="Volume à déménager" />}
            {manque.depart && <MissingChip label="Adresse de départ" />}
            {manque.arrivee && <MissingChip label="Adresse d'arrivée" />}
          </div>

          <div className="space-y-6">
            {manque.depart && (
              <AddressFields title="Adresse de départ" v={depart} on={patchDepart} requireVille />
            )}
            {manque.arrivee && (
              <AddressFields title="Adresse d'arrivée" v={arrivee} on={patchArrivee} requireVille />
            )}
            {manque.volume && (
              <div>
                <h3 className="mb-3 font-serif text-lg">Votre volume à déménager</h3>
                <VolumePicker
                  mode={mode}
                  setMode={setMode}
                  explicitVolume={explicitVolume}
                  setExplicitVolume={setExplicitVolume}
                  items={items}
                  setItems={setItems}
                  photos={photos}
                  setPhotos={setPhotos}
                  library={library}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== VOS INFORMATIONS — récapitulatif éditable ===== */}
      <section className="mt-8">
        <h2 className="mb-1 font-serif text-2xl">Vos informations</h2>
        <p className="mb-4 text-sm text-ink-soft">Déjà renseignées — modifiez-les si besoin.</p>

        <div className="space-y-6 rounded-2xl border border-line bg-card p-5">
          {/* Contact */}
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Contact</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nom" value={nom} onChange={setNom} />
              <Input label="Téléphone" value={tel} onChange={setTel} placeholder="06 12 34 56 78" />
              {data.client_email && (
                <div className="sm:col-span-2 text-sm text-ink-soft">
                  Email : <span className="text-ink">{data.client_email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Adresses déjà connues */}
          {!manque.depart && <AddressFields title="Adresse de départ" v={depart} on={patchDepart} />}
          {!manque.arrivee && <AddressFields title="Adresse d'arrivée" v={arrivee} on={patchArrivee} />}

          {/* Date */}
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Date souhaitée</h3>
            <input
              type="date"
              value={date ? date.slice(0, 10) : ""}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-accent sm:w-64"
            />
          </div>

          {/* Volume déjà connu */}
          {!manque.volume && (
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Volume</h3>
              <p className="text-sm text-ink">~{data.volume_m3} m³ <span className="text-ink-soft">(déjà estimé)</span></p>
            </div>
          )}
        </div>
      </section>

      {error && <div className="mt-6 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">{error}</div>}

      <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
        <span className="text-sm text-ink-soft">
          {manque.volume ? (volume != null ? `Volume : ${volume} m³` : "Renseignez le volume") : ""}
        </span>
        <button
          onClick={submit}
          disabled={!canSubmit || submitting}
          className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Envoi…" : "Valider ma demande"}
        </button>
      </div>
    </div>
  );
}

function MissingChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-white/70 px-3 py-1 text-xs font-medium text-amber-800">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {label}
    </span>
  );
}

function AddressFields({
  title,
  v,
  on,
  requireVille,
}: {
  title: string;
  v: AddrState;
  on: (p: Partial<AddrState>) => void;
  requireVille?: boolean;
}) {
  return (
    <div>
      <h3 className="mb-3 font-serif text-lg">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-4">
          <Input label="Adresse" value={v.adresse} onChange={(x) => on({ adresse: x })} placeholder="12 rue…" />
        </div>
        <div className="sm:col-span-2">
          <Input label="Code postal" value={v.code_postal} onChange={(x) => on({ code_postal: x })} placeholder="69003" />
        </div>
        <div className="sm:col-span-4">
          <Input label={requireVille ? "Ville *" : "Ville"} value={v.ville} onChange={(x) => on({ ville: x })} placeholder="Lyon" highlight={requireVille} />
        </div>
        <div className="sm:col-span-2">
          <Input label="Étage" value={v.etage} onChange={(x) => on({ etage: x.replace(/[^\d]/g, "") })} placeholder="0" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-6">
          <input type="checkbox" checked={v.ascenseur} onChange={(e) => on({ ascenseur: e.target.checked })} className="accent-[var(--color-accent)]" />
          Ascenseur
        </label>
      </div>
    </div>
  );
}

function VolumePicker({
  mode, setMode, explicitVolume, setExplicitVolume, items, setItems, photos, setPhotos, library,
}: {
  mode: Mode; setMode: (m: Mode) => void;
  explicitVolume: string; setExplicitVolume: (v: string) => void;
  items: { label: string; quantite: number; volume_unitaire_m3: number }[];
  setItems: (v: { label: string; quantite: number; volume_unitaire_m3: number }[]) => void;
  photos: AnalyzedPhoto[]; setPhotos: (v: AnalyzedPhoto[]) => void;
  library: LibraryPhoto[];
}) {
  return (
    <div>
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
    </div>
  );
}

function Input({ label, value, onChange, placeholder, highlight }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; highlight?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full rounded-lg border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-accent ${highlight && !value ? "border-amber-400 bg-amber-50/40" : "border-line"}`} />
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
