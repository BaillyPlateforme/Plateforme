"use client";

import { useMemo, useState } from "react";
import { CATALOG, LOGEMENT_HINTS } from "./catalog";
import { Field, TextInput, Toggle, PrimaryButton, GhostButton } from "./ui";

type VolumeMode = "explicit" | "list" | "ai";

type ListItem = { label: string; quantite: number; volume_unitaire_m3: number };
type AnalyzedPhoto = {
  storage_path: string;
  piece: string;
  objets: { label: string; quantite: number; volume_m3: number }[];
  volume_m3: number;
  previewUrl?: string; // aperçu local (non envoyé, dépouillé par le schéma serveur)
};

type Formule = "eco" | "standard" | "luxe";
type Services = {
  emballage: boolean;
  demontage: boolean;
  montage: boolean;
  monte_meuble: boolean;
  garde_meuble: boolean;
};
type Address = {
  adresse: string;
  code_postal: string;
  ville: string;
  etage: string;
  ascenseur: boolean;
  type_logement: string;
};

type FormState = {
  client: { nom: string; email: string; tel: string };
  depart: Address;
  arrivee: Address;
  date_souhaitee: string;
  flexibilite: string;
  formule: Formule;
  services: Services;
  volumeMode: VolumeMode;
  explicitVolume: string;
  items: ListItem[];
  photos: AnalyzedPhoto[];
};

const STEPS = ["Coordonnées", "Départ", "Arrivée", "Planning", "Prestation", "Volume", "Récapitulatif"] as const;

const emptyAddress: Address = {
  adresse: "",
  code_postal: "",
  ville: "",
  etage: "",
  ascenseur: false,
  type_logement: "",
};

const initial: FormState = {
  client: { nom: "", email: "", tel: "" },
  depart: { ...emptyAddress },
  arrivee: { ...emptyAddress },
  date_souhaitee: "",
  flexibilite: "",
  formule: "standard",
  services: {
    emballage: false,
    demontage: false,
    montage: false,
    monte_meuble: false,
    garde_meuble: false,
  },
  volumeMode: "explicit",
  explicitVolume: "",
  items: [],
  photos: [],
};

const TYPES_LOGEMENT = ["Studio", "T1", "T2", "T3", "T4", "T5+", "Maison", "Local"];

// Jeu de données d'exemple pour un devis ultra-rapide.
const DEMO: FormState = {
  client: { nom: "Camille Durand", email: "camille.durand@email.fr", tel: "06 12 34 56 78" },
  depart: {
    adresse: "24 rue des Lilas",
    code_postal: "69003",
    ville: "Lyon",
    etage: "3",
    ascenseur: false,
    type_logement: "T3",
  },
  arrivee: {
    adresse: "8 avenue Jean Jaurès",
    code_postal: "31000",
    ville: "Toulouse",
    etage: "1",
    ascenseur: true,
    type_logement: "T3",
  },
  date_souhaitee: "",
  flexibilite: "± 1 semaine",
  formule: "standard",
  services: {
    emballage: true,
    demontage: true,
    montage: true,
    monte_meuble: false,
    garde_meuble: false,
  },
  volumeMode: "explicit",
  explicitVolume: "30",
  items: [],
  photos: [],
};

export default function DemandeForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalVolume = useMemo(() => computeVolume(form), [form]);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function fillDemo() {
    setForm(DEMO);
    setStep(STEPS.length - 1); // saute au récapitulatif
  }

  const canNext = validateStep(step, form);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
      setDone(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <SuccessScreen id={done} volume={totalVolume} />;

  return (
    <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-0 px-5 md:grid-cols-[300px_1fr] md:gap-12 md:px-8">
      {/* Rail latéral */}
      <aside className="hidden py-14 md:block">
        <div className="sticky top-14">
          <div className="mb-1 font-serif text-2xl font-semibold tracking-tight">
            Bailly
          </div>
          <div className="mb-6 text-sm text-ink-soft">Déménagement sur mesure</div>

          <button
            type="button"
            onClick={fillDemo}
            className="mb-8 flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-3 py-2 text-sm font-medium transition hover:border-ink"
          >
            ⚡ Devis express
          </button>

          <ol className="space-y-1">
            {STEPS.map((label, i) => {
              const state = i === step ? "active" : i < step ? "done" : "todo";
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                      state === "active"
                        ? "bg-accent-soft/60 font-medium text-ink"
                        : state === "done"
                          ? "text-ink hover:bg-accent-soft/30"
                          : "text-ink-soft/60"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                        state === "active"
                          ? "bg-accent text-white"
                          : state === "done"
                            ? "bg-good/15 text-good"
                            : "border border-line-strong text-ink-soft/60"
                      }`}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </span>
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-10 rounded-xl border border-line bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-ink-soft">
              Volume estimé
            </div>
            <div className="mt-1 font-serif text-3xl">
              {totalVolume != null ? `${totalVolume}` : "—"}
              <span className="ml-1 text-lg text-ink-soft">m³</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenu de l'étape */}
      <main className="flex flex-col py-10 md:py-14">
        {/* Progression mobile */}
        <div className="mb-8 md:hidden">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-serif text-xl">Bailly</span>
            <button
              type="button"
              onClick={fillDemo}
              className="rounded-lg border border-line-strong bg-card px-3 py-1.5 text-xs font-medium"
            >
              ⚡ Devis express
            </button>
          </div>
          <div className="mb-2 text-right text-xs text-ink-soft">
            Étape {step + 1}/{STEPS.length}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div key={step} className="animate-step-in flex-1">
          <StepHeader index={step} />
          <div className="mt-8 max-w-xl">
            {step === 0 && <ClientStep form={form} patch={patch} />}
            {step === 1 && (
              <AddressStep which="depart" form={form} patch={patch} />
            )}
            {step === 2 && (
              <AddressStep which="arrivee" form={form} patch={patch} />
            )}
            {step === 3 && <PlanningStep form={form} patch={patch} />}
            {step === 4 && <PrestationStep form={form} patch={patch} />}
            {step === 5 && <VolumeStep form={form} patch={patch} />}
            {step === 6 && <RecapStep form={form} volume={totalVolume} />}
          </div>
        </div>

        {error && (
          <div className="mt-6 max-w-xl rounded-lg border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex max-w-xl items-center justify-between border-t border-line pt-6">
          <GhostButton
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Retour
          </GhostButton>
          {step < STEPS.length - 1 ? (
            <PrimaryButton
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
            >
              Continuer →
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={submit} disabled={submitting}>
              {submitting ? "Envoi…" : "Envoyer ma demande"}
            </PrimaryButton>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- En-tête d'étape ---------- */

const HEADERS: { title: string; sub: string }[] = [
  { title: "Faisons connaissance", sub: "Vos coordonnées pour vous recontacter." },
  { title: "D'où partez-vous ?", sub: "L'adresse et l'accès du logement de départ." },
  { title: "Où allez-vous ?", sub: "L'adresse et l'accès du logement d'arrivée." },
  { title: "Quand souhaitez-vous partir ?", sub: "Une date, même approximative, nous aide." },
  { title: "Quelle prestation ?", sub: "Choisissez votre formule et vos options." },
  { title: "Quel volume à déménager ?", sub: "Trois façons de l'estimer — à vous de choisir." },
  { title: "Un dernier coup d'œil", sub: "Vérifiez vos informations avant l'envoi." },
];

function StepHeader({ index }: { index: number }) {
  const h = HEADERS[index];
  return (
    <div>
      <div className="text-sm font-medium uppercase tracking-wide text-accent">
        Étape {index + 1}
      </div>
      <h1 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">
        {h.title}
      </h1>
      <p className="mt-2 text-ink-soft">{h.sub}</p>
    </div>
  );
}

/* ---------- Étapes ---------- */

function ClientStep({ form, patch }: StepProps) {
  const c = form.client;
  return (
    <div className="space-y-5">
      <Field label="Nom complet">
        <TextInput
          value={c.nom}
          onChange={(e) => patch({ client: { ...c, nom: e.target.value } })}
          placeholder="Jean Dupont"
        />
      </Field>
      <Field label="Email">
        <TextInput
          type="email"
          value={c.email}
          onChange={(e) => patch({ client: { ...c, email: e.target.value } })}
          placeholder="jean.dupont@email.fr"
        />
      </Field>
      <Field label="Téléphone" hint="facultatif">
        <TextInput
          value={c.tel}
          onChange={(e) => patch({ client: { ...c, tel: e.target.value } })}
          placeholder="06 12 34 56 78"
        />
      </Field>
    </div>
  );
}

function AddressStep({
  which,
  form,
  patch,
}: StepProps & { which: "depart" | "arrivee" }) {
  const a = form[which];
  const set = (p: Partial<Address>) => patch({ [which]: { ...a, ...p } } as Partial<FormState>);
  return (
    <div className="space-y-5">
      <Field label="Type de logement">
        <div className="flex flex-wrap gap-2">
          {TYPES_LOGEMENT.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ type_logement: t })}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                a.type_logement === t
                  ? "border-accent bg-accent-soft/60 text-accent-dark"
                  : "border-line bg-card hover:border-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Adresse">
        <TextInput
          value={a.adresse}
          onChange={(e) => set({ adresse: e.target.value })}
          placeholder="12 rue de la République"
        />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-4">
        <Field label="Code postal">
          <TextInput
            value={a.code_postal}
            onChange={(e) => set({ code_postal: e.target.value })}
            placeholder="75011"
          />
        </Field>
        <Field label="Ville">
          <TextInput
            value={a.ville}
            onChange={(e) => set({ ville: e.target.value })}
            placeholder="Paris"
          />
        </Field>
      </div>
      <div className="flex items-end justify-between gap-4">
        <Field label="Étage" hint="0 = rez-de-chaussée" className="w-32">
          <TextInput
            type="number"
            min={0}
            value={a.etage}
            onChange={(e) => set({ etage: e.target.value })}
            placeholder="3"
          />
        </Field>
        <div className="pb-2.5">
          <Toggle
            checked={a.ascenseur}
            onChange={(v) => set({ ascenseur: v })}
            label="Ascenseur"
          />
        </div>
      </div>
    </div>
  );
}

function PlanningStep({ form, patch }: StepProps) {
  return (
    <div className="space-y-5">
      <Field label="Date souhaitée" hint="facultatif">
        <TextInput
          type="date"
          value={form.date_souhaitee}
          onChange={(e) => patch({ date_souhaitee: e.target.value })}
        />
      </Field>
      <Field label="Flexibilité" hint="facultatif">
        <TextInput
          value={form.flexibilite}
          onChange={(e) => patch({ flexibilite: e.target.value })}
          placeholder="± 1 semaine, plutôt en semaine…"
        />
      </Field>
    </div>
  );
}

/* ---------- Étape Prestation ---------- */

const FORMULES: { key: Formule; titre: string; desc: string }[] = [
  { key: "eco", titre: "Éco", desc: "Vous emballez, on transporte." },
  { key: "standard", titre: "Standard", desc: "Emballage fragile + transport." },
  { key: "luxe", titre: "Confort", desc: "Tout pris en charge, clé en main." },
];

const SERVICES: { key: keyof Services; label: string }[] = [
  { key: "emballage", label: "Emballage complet" },
  { key: "demontage", label: "Démontage des meubles" },
  { key: "montage", label: "Remontage à l'arrivée" },
  { key: "monte_meuble", label: "Monte-meuble" },
  { key: "garde_meuble", label: "Garde-meuble temporaire" },
];

function PrestationStep({ form, patch }: StepProps) {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 text-sm font-medium">Formule</div>
        <div className="grid grid-cols-3 gap-2">
          {FORMULES.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => patch({ formule: f.key })}
              className={`rounded-xl border px-3 py-4 text-left transition ${
                form.formule === f.key
                  ? "border-accent bg-accent-soft/50 shadow-sm"
                  : "border-line bg-card hover:border-line-strong"
              }`}
            >
              <div className="font-serif text-lg leading-tight">{f.titre}</div>
              <div className="mt-1 text-xs text-ink-soft">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 text-sm font-medium">Options</div>
        <div className="space-y-2">
          {SERVICES.map((s) => {
            const on = form.services[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => patch({ services: { ...form.services, [s.key]: !on } })}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                  on ? "border-accent bg-accent-soft/40" : "border-line bg-card hover:border-line-strong"
                }`}
              >
                <span>{s.label}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                    on ? "border-accent bg-accent text-white" : "border-line-strong"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Étape Volume (3 modes) ---------- */

function VolumeStep({ form, patch }: StepProps) {
  const mode = form.volumeMode;
  return (
    <div>
      <div className="mb-6 grid grid-cols-3 gap-2">
        {(
          [
            ["explicit", "Je connais", "mon volume"],
            ["list", "Je liste", "mes meubles"],
            ["ai", "J'envoie", "des photos"],
          ] as const
        ).map(([m, a, b]) => (
          <button
            key={m}
            type="button"
            onClick={() => patch({ volumeMode: m })}
            className={`rounded-xl border px-3 py-4 text-left transition ${
              mode === m
                ? "border-accent bg-accent-soft/50 shadow-sm"
                : "border-line bg-card hover:border-line-strong"
            }`}
          >
            <div className="font-serif text-lg leading-tight">{a}</div>
            <div className="text-sm text-ink-soft">{b}</div>
          </button>
        ))}
      </div>

      {mode === "explicit" && <ExplicitMode form={form} patch={patch} />}
      {mode === "list" && <ListMode form={form} patch={patch} />}
      {mode === "ai" && <AiMode form={form} patch={patch} />}
    </div>
  );
}

function ExplicitMode({ form, patch }: StepProps) {
  return (
    <div className="space-y-5">
      <Field label="Volume estimé" hint="en m³">
        <TextInput
          type="number"
          min={0}
          step="0.5"
          value={form.explicitVolume}
          onChange={(e) => patch({ explicitVolume: e.target.value })}
          placeholder="25"
        />
      </Field>
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-ink-soft">
          Repères par logement
        </div>
        <div className="flex flex-wrap gap-2">
          {LOGEMENT_HINTS.map((h) => (
            <button
              key={h.label}
              type="button"
              onClick={() => patch({ explicitVolume: String(h.volume) })}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent"
            >
              {h.label} · ~{h.volume} m³
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListMode({ form, patch }: StepProps) {
  const items = form.items;
  const total = items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0);

  function addFromCatalog(label: string) {
    const preset = CATALOG.find((c) => c.label === label);
    if (!preset) return;
    const existing = items.findIndex((it) => it.label === label);
    if (existing >= 0) {
      const copy = [...items];
      copy[existing] = { ...copy[existing], quantite: copy[existing].quantite + 1 };
      patch({ items: copy });
    } else {
      patch({
        items: [...items, { label, quantite: 1, volume_unitaire_m3: preset.volume }],
      });
    }
  }
  function setQty(i: number, q: number) {
    if (q <= 0) return patch({ items: items.filter((_, idx) => idx !== i) });
    const copy = [...items];
    copy[i] = { ...copy[i], quantite: q };
    patch({ items: copy });
  }

  const groupes = [...new Set(CATALOG.map((c) => c.groupe))];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-ink-soft">
          Ajouter un objet
        </div>
        <div className="space-y-3">
          {groupes.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-sm font-medium text-ink-soft">{g}</div>
              <div className="flex flex-wrap gap-1.5">
                {CATALOG.filter((c) => c.groupe === g).map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => addFromCatalog(c.label)}
                    className="rounded-full border border-line bg-card px-2.5 py-1 text-xs transition hover:border-accent hover:text-accent"
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <div className="rounded-xl border border-line bg-card">
          {items.map((it, i) => (
            <div
              key={it.label}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">{it.label}</div>
                <div className="text-xs text-ink-soft">
                  {it.volume_unitaire_m3} m³/u
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQty(i, it.quantite - 1)}
                  className="h-7 w-7 rounded-md border border-line text-ink-soft hover:border-accent hover:text-accent"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm tabular-nums">
                  {it.quantite}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(i, it.quantite + 1)}
                  className="h-7 w-7 rounded-md border border-line text-ink-soft hover:border-accent hover:text-accent"
                >
                  +
                </button>
              </div>
              <div className="w-16 text-right text-sm tabular-nums text-ink">
                {(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{total.toFixed(1)} m³</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AiMode({ form, patch }: StepProps) {
  const [previews, setPreviews] = useState<{ url: string; file: File }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews((p) => [...p, ...files.map((f) => ({ url: URL.createObjectURL(f), file: f }))]);
    setErr(null);
  }
  function removePreview(i: number) {
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  }

  async function analyze() {
    if (previews.length === 0) return;
    setAnalyzing(true);
    setErr(null);
    try {
      const fd = new FormData();
      previews.forEach((p) => fd.append("photos", p.file));
      const res = await fetch("/api/analyze-volume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analyse impossible");
      const enriched: AnalyzedPhoto[] = data.photos.map((p: AnalyzedPhoto, i: number) => ({
        ...p,
        previewUrl: previews[i]?.url,
      }));
      patch({ photos: [...form.photos, ...enriched] });
      setPreviews([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAnalyzing(false);
    }
  }

  // Édition d'une photo analysée
  function updatePhoto(idx: number, next: AnalyzedPhoto) {
    next.volume_m3 = round2(next.objets.reduce((s, o) => s + o.volume_m3, 0));
    patch({ photos: form.photos.map((p, i) => (i === idx ? next : p)) });
  }
  function removePhoto(idx: number) {
    patch({ photos: form.photos.filter((_, i) => i !== idx) });
  }

  const total = round2(form.photos.reduce((s, p) => s + p.volume_m3, 0));

  return (
    <div className="space-y-5">
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-line-strong bg-card px-6 py-10 text-center transition hover:border-ink">
        <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        <div className="font-serif text-lg">Déposez vos photos</div>
        <div className="mt-1 text-sm text-ink-soft">
          Une photo par pièce, idéalement large. JPG/PNG.
        </div>
      </label>

      {previews.length > 0 && (
        <div>
          <div className="grid grid-cols-4 gap-2">
            {previews.map((p, i) => (
              <div key={p.url} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePreview(i)}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-ink/70 text-xs text-white opacity-0 transition group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <PrimaryButton onClick={analyze} disabled={analyzing} className="mt-3 w-full">
            {analyzing
              ? "Analyse en cours…"
              : `Analyser ${previews.length} photo${previews.length > 1 ? "s" : ""}`}
          </PrimaryButton>
        </div>
      )}

      {err && <div className="text-sm text-accent-dark">{err}</div>}

      {/* Résultats éditables : image à gauche, détail modifiable à droite */}
      {form.photos.map((p, i) => (
        <PhotoResultCard
          key={i}
          photo={p}
          onChange={(next) => updatePhoto(i, next)}
          onRemove={() => removePhoto(i)}
        />
      ))}

      {form.photos.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-subtle px-4 py-3 font-medium">
          <span>Volume total estimé</span>
          <span className="tabular-nums">{total.toFixed(1)} m³</span>
        </div>
      )}
    </div>
  );
}

// Carte résultat photo : aperçu + édition des objets détectés.
function PhotoResultCard({
  photo,
  onChange,
  onRemove,
}: {
  photo: AnalyzedPhoto;
  onChange: (p: AnalyzedPhoto) => void;
  onRemove: () => void;
}) {
  const setObjet = (idx: number, field: "label" | "quantite" | "volume_m3", value: string) => {
    const objets = photo.objets.map((o, i) =>
      i === idx
        ? {
            ...o,
            [field]: field === "label" ? value : Number(value) || 0,
          }
        : o,
    );
    onChange({ ...photo, objets });
  };
  const removeObjet = (idx: number) =>
    onChange({ ...photo, objets: photo.objets.filter((_, i) => i !== idx) });
  const addObjet = () =>
    onChange({ ...photo, objets: [...photo.objets, { label: "", quantite: 1, volume_m3: 0 }] });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid md:grid-cols-[200px_1fr]">
        {/* Image */}
        <div className="relative aspect-square md:aspect-auto">
          {photo.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.previewUrl} alt={photo.piece} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-subtle text-sm text-ink-soft">
              Photo envoyée
            </div>
          )}
        </div>

        {/* Détail éditable */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              value={photo.piece}
              onChange={(e) => onChange({ ...photo, piece: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-medium outline-none transition hover:border-line focus:border-ink"
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
                  className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-ink"
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

          <button
            type="button"
            onClick={addObjet}
            className="mt-2 text-sm text-ink-soft transition hover:text-ink"
          >
            + Ajouter un objet
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Récapitulatif ---------- */

function RecapStep({ form, volume }: { form: FormState; volume: number | null }) {
  const rows: [string, string][] = [
    ["Client", `${form.client.nom} · ${form.client.email}${form.client.tel ? " · " + form.client.tel : ""}`],
    ["Départ", `${form.depart.adresse}, ${form.depart.code_postal} ${form.depart.ville} — étage ${form.depart.etage || "0"}${form.depart.ascenseur ? ", ascenseur" : ""}`],
    ["Arrivée", `${form.arrivee.adresse}, ${form.arrivee.code_postal} ${form.arrivee.ville} — étage ${form.arrivee.etage || "0"}${form.arrivee.ascenseur ? ", ascenseur" : ""}`],
    ["Date", form.date_souhaitee || "à définir"],
    ["Formule", form.formule],
    [
      "Options",
      Object.entries(form.services)
        .filter(([, v]) => v)
        .map(([k]) => k.replace("_", "-"))
        .join(", ") || "aucune",
    ],
    ["Volume", volume != null ? `${volume} m³ (${labelMode(form.volumeMode)})` : "non renseigné"],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[110px_1fr] gap-4 border-b border-line px-4 py-3 text-sm last:border-0">
          <span className="text-ink-soft">{k}</span>
          <span className="text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function SuccessScreen({ id, volume }: { id: string; volume: number | null }) {
  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="animate-fade-up">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-2xl text-good">
          ✓
        </div>
        <h1 className="font-serif text-4xl">Demande envoyée</h1>
        <p className="mt-3 text-ink-soft">
          Merci ! Notre équipe analyse votre demande
          {volume != null ? ` (~${volume} m³)` : ""} et revient vers vous très vite.
        </p>
        <div className="mt-6 inline-block rounded-lg border border-line bg-card px-4 py-2 text-sm text-ink-soft">
          Référence : <span className="font-mono text-ink">{id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

type StepProps = { form: FormState; patch: (p: Partial<FormState>) => void };

function labelMode(m: VolumeMode) {
  return m === "explicit" ? "déclaré" : m === "list" ? "liste" : "photos IA";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeVolume(form: FormState): number | null {
  if (form.volumeMode === "explicit") {
    const v = parseFloat(form.explicitVolume);
    return isNaN(v) ? null : Math.round(v * 100) / 100;
  }
  if (form.volumeMode === "list") {
    if (form.items.length === 0) return null;
    return Math.round(form.items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0) * 100) / 100;
  }
  if (form.photos.length === 0) return null;
  return Math.round(form.photos.reduce((s, p) => s + p.volume_m3, 0) * 100) / 100;
}

function validateStep(step: number, form: FormState): boolean {
  switch (step) {
    case 0:
      return form.client.nom.trim().length > 0 && /.+@.+\..+/.test(form.client.email);
    case 1:
      return form.depart.ville.trim().length > 0;
    case 2:
      return form.arrivee.ville.trim().length > 0;
    case 5:
      return computeVolume(form) != null;
    default:
      return true;
  }
}

function buildPayload(form: FormState) {
  const toAddr = (a: Address) => ({
    adresse: a.adresse || undefined,
    code_postal: a.code_postal || undefined,
    ville: a.ville || undefined,
    etage: a.etage ? parseInt(a.etage, 10) : undefined,
    ascenseur: a.ascenseur,
    type_logement: a.type_logement || undefined,
  });

  let volume;
  if (form.volumeMode === "explicit") {
    volume = { method: "explicit" as const, volume_m3: parseFloat(form.explicitVolume) };
  } else if (form.volumeMode === "list") {
    volume = { method: "list" as const, items: form.items };
  } else if (form.photos.length > 0) {
    volume = { method: "ai" as const, photos: form.photos };
  }

  return {
    client: {
      nom: form.client.nom,
      email: form.client.email,
      tel: form.client.tel || undefined,
    },
    depart: toAddr(form.depart),
    arrivee: toAddr(form.arrivee),
    date_souhaitee: form.date_souhaitee || undefined,
    flexibilite: form.flexibilite || undefined,
    formule: form.formule,
    services: form.services,
    volume,
  };
}
