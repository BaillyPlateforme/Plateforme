"use client";

import { useMemo, useState } from "react";
import { CATALOG, LOGEMENT_HINTS } from "@/lib/catalog";
import { Field, TextInput, Toggle } from "./ui";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import type { AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import ModeSwitch from "@/components/ModeSwitch";

/* ============================ Types ============================ */

type Formule = "eco" | "standard" | "luxe";
type Presta = "moi" | "bailly";
type VolumeMode = "explicit" | "list" | "ai";
type ListItem = { label: string; quantite: number; volume_unitaire_m3: number };

type Address = {
  type_logement: string;
  adresse: string;
  code_postal: string;
  ville: string;
  etage: string;
  ascenseur: boolean;
  surface: string;
  stationnement: boolean;
  acces_difficile: boolean;
};

type FormState = {
  type_client: "particulier" | "entreprise";
  prenom: string;
  nom: string;
  email: string;
  tel: string;
  societe: string;
  mutation_pro: boolean;
  depart: Address;
  arrivee: Address;
  prestations: { emballageFragile: Presta; emballageNonFragile: Presta; demontage: Presta; transportSeul: Presta };
  formule: Formule;
  volumeMode: VolumeMode;
  explicitVolume: string;
  items: ListItem[];
  photos: AnalyzedPhoto[];
  date_souhaitee: string;
  flexibilite: string;
  valeur_mobilier: string;
  assurance: "standard" | "luxe";
  articles_lourds: boolean;
  commentaire: string;
};

/* ============================ Constantes ============================ */

const STEPS = ["Vous", "Départ", "Arrivée", "Prestations", "Volume", "Détails", "Récapitulatif"] as const;

const HEADERS: { eyebrow: string; title: string; sub: string }[] = [
  { eyebrow: "Faisons connaissance", title: "Parlez-nous de vous", sub: "Pour vous accompagner et vous recontacter." },
  { eyebrow: "Point de départ", title: "D'où partez-vous ?", sub: "L'adresse et les conditions d'accès actuelles." },
  { eyebrow: "Destination", title: "Où allez-vous ?", sub: "L'adresse et les conditions d'accès à l'arrivée." },
  { eyebrow: "Prestations", title: "Que devons-nous prendre en charge ?", sub: "Vous choisissez, nous nous occupons du reste." },
  { eyebrow: "Volume", title: "Quel volume à déménager ?", sub: "Trois façons de l'estimer — dont l'analyse par photo." },
  { eyebrow: "Derniers détails", title: "Affinons votre projet", sub: "Date, valeur, assurance et précisions." },
  { eyebrow: "Presque terminé", title: "Vérifiez et envoyez", sub: "Un dernier coup d'œil avant l'envoi à nos experts." },
];

const TYPES_LOGEMENT = ["Studio", "T1", "T2", "T3", "T4", "T5+", "Maison", "Local"];

const FORMULES: { key: Formule; titre: string; desc: string }[] = [
  { key: "eco", titre: "Éco", desc: "Vous emballez, on transporte." },
  { key: "standard", titre: "Standard", desc: "Fragile emballé + transport." },
  { key: "luxe", titre: "Confort", desc: "Tout pris en charge, clé en main." },
];

const PRESTATIONS: { key: keyof FormState["prestations"]; label: string; hint: string }[] = [
  { key: "emballageFragile", label: "Emballage des objets fragiles", hint: "Vaisselle, verrerie, décorations…" },
  { key: "emballageNonFragile", label: "Emballage non fragile", hint: "Livres, linge, vêtements…" },
  { key: "demontage", label: "Démontage / remontage du mobilier", hint: "Lits, armoires, meubles en kit…" },
  { key: "transportSeul", label: "Transport des meubles uniquement", hint: "Vous gérez tout le reste." },
];

const VALEURS = ["< 10 000 €", "10 000 – 30 000 €", "30 000 – 60 000 €", "> 60 000 €"];

const emptyAddress: Address = {
  type_logement: "", adresse: "", code_postal: "", ville: "", etage: "",
  ascenseur: false, surface: "", stationnement: false, acces_difficile: false,
};

const initial: FormState = {
  type_client: "particulier", prenom: "", nom: "", email: "", tel: "", societe: "", mutation_pro: false,
  depart: { ...emptyAddress }, arrivee: { ...emptyAddress },
  prestations: { emballageFragile: "bailly", emballageNonFragile: "moi", demontage: "bailly", transportSeul: "moi" },
  formule: "standard",
  volumeMode: "explicit", explicitVolume: "", items: [], photos: [],
  date_souhaitee: "", flexibilite: "", valeur_mobilier: "", assurance: "standard", articles_lourds: false, commentaire: "",
};

const DEMO: FormState = {
  ...initial,
  prenom: "Camille", nom: "Durand", email: "camille.durand@email.fr", tel: "06 12 34 56 78",
  depart: { ...emptyAddress, type_logement: "T3", adresse: "24 rue des Lilas", code_postal: "69003", ville: "Lyon", etage: "3", surface: "65" },
  arrivee: { ...emptyAddress, type_logement: "T3", adresse: "8 avenue Jean Jaurès", code_postal: "31000", ville: "Toulouse", etage: "1", ascenseur: true, surface: "70" },
  formule: "standard", volumeMode: "explicit", explicitVolume: "30",
  date_souhaitee: "", flexibilite: "± 1 semaine", valeur_mobilier: "10 000 – 30 000 €", assurance: "standard",
};

/* ============================ Composant principal ============================ */

export default function DemandeForm({ library }: { library: LibraryPhoto[] }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalVolume = useMemo(() => computeVolume(form), [form]);
  const heroUrl = library[0]?.url;

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }
  function fillDemo() {
    setForm(DEMO);
    setStep(STEPS.length - 1);
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

  if (done) return <SuccessScreen id={done} volume={totalVolume} heroUrl={heroUrl} />;

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      <ModeSwitch current="form" />
      <div className="min-h-screen bg-paper md:grid md:grid-cols-[minmax(360px,440px)_1fr]">
        {/* ---------- Panneau visuel ---------- */}
        <aside className="relative hidden overflow-hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col md:justify-between bg-ink text-paper">
          {heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/60 to-ink/90" />

          <div className="relative z-10 p-10">
            <div className="font-serif text-3xl font-semibold">Bailly</div>
            <div className="eyebrow mt-1 text-paper/60">Déménagement</div>
            <p className="mt-8 max-w-xs font-serif text-2xl leading-snug text-paper/95">
              Une question, un projet ? Nous vous accompagnons à chaque étape.
            </p>
          </div>

          <div className="relative z-10 px-10">
            <ol className="space-y-1">
              {STEPS.map((label, i) => {
                const state = i === step ? "active" : i < step ? "done" : "todo";
                return (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => i < step && setStep(i)}
                      disabled={i > step}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                        state === "active" ? "bg-paper/10 font-medium text-paper" : state === "done" ? "text-paper/80 hover:bg-paper/5" : "text-paper/40"
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                        state === "active" ? "bg-paper text-ink" : state === "done" ? "bg-paper/20 text-paper" : "border border-paper/25 text-paper/40"
                      }`}>
                        {state === "done" ? "✓" : i + 1}
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="relative z-10 p-10">
            <div className="flex items-end justify-between border-t border-paper/15 pt-6">
              <p className="max-w-[14rem] text-sm text-paper/70">
                Échangez avec nos experts pour un accompagnement sur mesure.
              </p>
              <div className="text-right">
                <div className="eyebrow text-paper/50">Volume estimé</div>
                <div className="font-serif text-3xl">
                  {totalVolume ?? "—"}
                  <span className="ml-1 text-base text-paper/60">m³</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ---------- Contenu ---------- */}
        <main className="flex min-h-screen flex-col">
          {/* barre de progression fine */}
          <div className="sticky top-0 z-20 h-1 w-full bg-line">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10 md:px-12 md:py-16">
            {/* header mobile + express */}
            <div className="mb-8 flex items-start justify-between">
              <div>
                <div className="eyebrow text-accent">
                  Étape {step + 1} / {STEPS.length} · {HEADERS[step].eyebrow}
                </div>
                <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{HEADERS[step].title}</h1>
                <p className="mt-2 text-ink-soft">{HEADERS[step].sub}</p>
              </div>
              <button
                type="button"
                onClick={fillDemo}
                className="ml-4 hidden shrink-0 rounded-full border border-line-strong bg-card px-3.5 py-2 text-xs font-medium transition hover:border-ink sm:block"
              >
                ⚡ Devis express
              </button>
            </div>

            <div key={step} className="animate-step-in flex-1">
              {step === 0 && <VousStep form={form} patch={patch} />}
              {step === 1 && <AddressStep which="depart" form={form} patch={patch} />}
              {step === 2 && <AddressStep which="arrivee" form={form} patch={patch} />}
              {step === 3 && <PrestationsStep form={form} patch={patch} />}
              {step === 4 && <VolumeStep form={form} patch={patch} library={library} />}
              {step === 5 && <DetailsStep form={form} patch={patch} />}
              {step === 6 && <RecapStep form={form} volume={totalVolume} />}
            </div>

            {error && (
              <div className="mt-6 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">
                {error}
              </div>
            )}

            <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || submitting}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:text-ink disabled:opacity-40"
              >
                ← Retour
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNext}
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Enregistrer et continuer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
                >
                  {submitting ? "Envoi…" : "Envoyer ma demande"}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

/* ============================ Étapes ============================ */

type StepProps = { form: FormState; patch: (p: Partial<FormState>) => void };

function VousStep({ form, patch }: StepProps) {
  return (
    <div className="space-y-6">
      <Segmented
        options={[["particulier", "Particulier"], ["entreprise", "Entreprise"]]}
        value={form.type_client}
        onChange={(v) => patch({ type_client: v as FormState["type_client"] })}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Prénom">
          <TextInput value={form.prenom} onChange={(e) => patch({ prenom: e.target.value })} placeholder="Camille" />
        </Field>
        <Field label="Nom">
          <TextInput value={form.nom} onChange={(e) => patch({ nom: e.target.value })} placeholder="Durand" />
        </Field>
      </div>
      <Field label="Email">
        <TextInput type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="camille.durand@email.fr" />
      </Field>
      <Field label="Téléphone" hint="pour être rappelé(e)">
        <TextInput value={form.tel} onChange={(e) => patch({ tel: e.target.value })} placeholder="06 12 34 56 78" />
      </Field>
      {form.type_client === "entreprise" && (
        <Field label="Société">
          <TextInput value={form.societe} onChange={(e) => patch({ societe: e.target.value })} placeholder="Nom de la société" />
        </Field>
      )}
      <div className="pt-1">
        <Toggle checked={form.mutation_pro} onChange={(v) => patch({ mutation_pro: v })} label="Déménagement dans le cadre d'une mutation professionnelle" />
      </div>
    </div>
  );
}

function AddressStep({ which, form, patch }: StepProps & { which: "depart" | "arrivee" }) {
  const a = form[which];
  const set = (p: Partial<Address>) => patch({ [which]: { ...a, ...p } } as Partial<FormState>);
  return (
    <div className="space-y-6">
      <Field label="Type de logement">
        <div className="flex flex-wrap gap-2">
          {TYPES_LOGEMENT.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ type_logement: t })}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                a.type_logement === t ? "border-accent bg-accent-soft/60 text-accent-dark" : "border-line bg-card hover:border-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Adresse">
        <TextInput value={a.adresse} onChange={(e) => set({ adresse: e.target.value })} placeholder="12 rue de la République" />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-4">
        <Field label="Code postal">
          <TextInput value={a.code_postal} onChange={(e) => set({ code_postal: e.target.value })} placeholder="75011" />
        </Field>
        <Field label="Ville">
          <TextInput value={a.ville} onChange={(e) => set({ ville: e.target.value })} placeholder="Paris" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Étage" hint="0 = RDC">
          <TextInput type="number" min={0} value={a.etage} onChange={(e) => set({ etage: e.target.value })} placeholder="3" />
        </Field>
        <Field label="Surface" hint="m²">
          <TextInput type="number" min={0} value={a.surface} onChange={(e) => set({ surface: e.target.value })} placeholder="65" />
        </Field>
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-card p-4">
        <Toggle checked={a.ascenseur} onChange={(v) => set({ ascenseur: v })} label="Ascenseur" />
        <Toggle checked={a.stationnement} onChange={(v) => set({ stationnement: v })} label="Stationnement possible devant le logement" />
        <Toggle checked={a.acces_difficile} onChange={(v) => set({ acces_difficile: v })} label="Accès difficile pour un camion" />
      </div>
    </div>
  );
}

function PrestationsStep({ form, patch }: StepProps) {
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
                form.formule === f.key ? "border-accent bg-accent-soft/50 shadow-sm" : "border-line bg-card hover:border-line-strong"
              }`}
            >
              <div className="font-serif text-lg leading-tight">{f.titre}</div>
              <div className="mt-1 text-xs text-ink-soft">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="mb-1 text-sm font-medium">Qui s&apos;occupe de quoi ?</div>
        {PRESTATIONS.map((p) => (
          <div key={p.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3">
            <div>
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-xs text-ink-soft">{p.hint}</div>
            </div>
            <Segmented
              small
              options={[["moi", "Je m'en occupe"], ["bailly", "Bailly"]]}
              value={form.prestations[p.key]}
              onChange={(v) => patch({ prestations: { ...form.prestations, [p.key]: v as Presta } })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailsStep({ form, patch }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Période souhaitée">
          <TextInput type="date" value={form.date_souhaitee} onChange={(e) => patch({ date_souhaitee: e.target.value })} />
        </Field>
        <Field label="Flexibilité" hint="facultatif">
          <TextInput value={form.flexibilite} onChange={(e) => patch({ flexibilite: e.target.value })} placeholder="± 1 semaine" />
        </Field>
      </div>
      <Field label="Valeur estimée du mobilier">
        <div className="flex flex-wrap gap-2">
          {VALEURS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => patch({ valeur_mobilier: v })}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                form.valeur_mobilier === v ? "border-accent bg-accent-soft/60 text-accent-dark" : "border-line bg-card hover:border-accent"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Assurance">
        <Segmented
          options={[["standard", "Standard (avec franchise)"], ["luxe", "Luxe (sans franchise)"]]}
          value={form.assurance}
          onChange={(v) => patch({ assurance: v as FormState["assurance"] })}
        />
      </Field>
      <div className="rounded-xl border border-line bg-card p-4">
        <Toggle checked={form.articles_lourds} onChange={(v) => patch({ articles_lourds: v })} label="Objets lourds de plus de 80 kg (piano, coffre-fort…)" />
      </div>
      <Field label="Commentaire" hint="facultatif">
        <textarea
          value={form.commentaire}
          onChange={(e) => patch({ commentaire: e.target.value })}
          rows={4}
          className="w-full resize-none rounded-lg border border-line bg-card px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder="Précisions, contraintes, objets particuliers…"
        />
      </Field>
    </div>
  );
}

/* ---------- Volume (3 modes) ---------- */

function VolumeStep({ form, patch, library }: StepProps & { library: LibraryPhoto[] }) {
  const mode = form.volumeMode;
  return (
    <div>
      <div className="mb-6 grid grid-cols-3 gap-2">
        {([["explicit", "Je connais", "mon volume"], ["list", "Je liste", "mes meubles"], ["ai", "J'envoie", "des photos"]] as const).map(([m, a, b]) => (
          <button
            key={m}
            type="button"
            onClick={() => patch({ volumeMode: m })}
            className={`rounded-xl border px-3 py-4 text-left transition ${
              mode === m ? "border-accent bg-accent-soft/50 shadow-sm" : "border-line bg-card hover:border-line-strong"
            }`}
          >
            <div className="font-serif text-lg leading-tight">{a}</div>
            <div className="text-sm text-ink-soft">{b}</div>
          </button>
        ))}
      </div>
      {mode === "explicit" && <ExplicitMode form={form} patch={patch} />}
      {mode === "list" && <ListMode form={form} patch={patch} />}
      {mode === "ai" && <PhotoAnalyzer library={library} photos={form.photos} onChange={(photos) => patch({ photos })} />}
    </div>
  );
}

function ExplicitMode({ form, patch }: StepProps) {
  return (
    <div className="space-y-5">
      <Field label="Volume estimé" hint="en m³">
        <TextInput type="number" min={0} step="0.5" value={form.explicitVolume} onChange={(e) => patch({ explicitVolume: e.target.value })} placeholder="25" />
      </Field>
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-ink-soft">Repères par logement</div>
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
      patch({ items: [...items, { label, quantite: 1, volume_unitaire_m3: preset.volume }] });
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
        <div className="mb-2 text-xs uppercase tracking-wide text-ink-soft">Ajouter un objet</div>
        <div className="space-y-3">
          {groupes.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-sm font-medium text-ink-soft">{g}</div>
              <div className="flex flex-wrap gap-1.5">
                {CATALOG.filter((c) => c.groupe === g).map((c) => (
                  <button key={c.label} type="button" onClick={() => addFromCatalog(c.label)} className="rounded-full border border-line bg-card px-2.5 py-1 text-xs transition hover:border-accent hover:text-accent">
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
            <div key={it.label} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">{it.label}</div>
                <div className="text-xs text-ink-soft">{it.volume_unitaire_m3} m³/u</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setQty(i, it.quantite - 1)} className="h-7 w-7 rounded-md border border-line text-ink-soft hover:border-accent hover:text-accent">−</button>
                <span className="w-8 text-center text-sm tabular-nums">{it.quantite}</span>
                <button type="button" onClick={() => setQty(i, it.quantite + 1)} className="h-7 w-7 rounded-md border border-line text-ink-soft hover:border-accent hover:text-accent">+</button>
              </div>
              <div className="w-16 text-right text-sm tabular-nums text-ink">{(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³</div>
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

/* ---------- Récapitulatif ---------- */

function RecapStep({ form, volume }: { form: FormState; volume: number | null }) {
  const prestaTxt = PRESTATIONS.filter((p) => form.prestations[p.key] === "bailly").map((p) => p.label).join(", ") || "aucune";
  const rows: [string, string][] = [
    ["Client", `${[form.prenom, form.nom].filter(Boolean).join(" ")} · ${form.email}${form.tel ? " · " + form.tel : ""}`],
    ["Type", form.type_client === "entreprise" ? `Entreprise${form.societe ? " · " + form.societe : ""}` : "Particulier"],
    ["Départ", `${form.depart.adresse}, ${form.depart.code_postal} ${form.depart.ville} — étage ${form.depart.etage || "0"}${form.depart.ascenseur ? ", ascenseur" : ""}`],
    ["Arrivée", `${form.arrivee.adresse}, ${form.arrivee.code_postal} ${form.arrivee.ville} — étage ${form.arrivee.etage || "0"}${form.arrivee.ascenseur ? ", ascenseur" : ""}`],
    ["Formule", form.formule],
    ["Pris en charge par Bailly", prestaTxt],
    ["Date", form.date_souhaitee || "à définir"],
    ["Assurance", form.assurance === "luxe" ? "Luxe (sans franchise)" : "Standard"],
    ["Volume", volume != null ? `${volume} m³ (${labelMode(form.volumeMode)})` : "non renseigné"],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[150px_1fr] gap-4 border-b border-line px-4 py-3 text-sm last:border-0">
          <span className="text-ink-soft">{k}</span>
          <span className="text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function SuccessScreen({ id, volume, heroUrl }: { id: string; volume: number | null; heroUrl?: string }) {
  return (
    <div className="relative min-h-screen">
      {heroUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
      )}
      <div className="absolute inset-0 bg-paper/80" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <div className="animate-fade-up">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-2xl text-good">✓</div>
          <h1 className="font-serif text-5xl">Demande envoyée</h1>
          <p className="mt-3 text-ink-soft">
            Merci ! Nos experts analysent votre projet{volume != null ? ` (~${volume} m³)` : ""} et reviennent vers vous très vite.
          </p>
          <div className="mt-6 inline-block rounded-lg border border-line bg-card px-4 py-2 text-sm text-ink-soft">
            Référence : <span className="font-mono text-ink">{id.slice(0, 8)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ UI ============================ */

function Segmented({
  options, value, onChange, small,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  small?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-line bg-subtle p-0.5 ${small ? "" : "w-full"}`}>
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${small ? "" : "flex-1"} ${
            value === val ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ============================ Helpers ============================ */

function labelMode(m: VolumeMode) {
  return m === "explicit" ? "déclaré" : m === "list" ? "liste" : "photos IA";
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
      return (form.prenom.trim().length > 0 || form.nom.trim().length > 0) && /.+@.+\..+/.test(form.email);
    case 1:
      return form.depart.ville.trim().length > 0;
    case 2:
      return form.arrivee.ville.trim().length > 0;
    case 4:
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
    surface: a.surface ? parseFloat(a.surface) : undefined,
    stationnement: a.stationnement,
    acces_difficile: a.acces_difficile,
  });

  let volume;
  if (form.volumeMode === "explicit") volume = { method: "explicit" as const, volume_m3: parseFloat(form.explicitVolume) };
  else if (form.volumeMode === "list") volume = { method: "list" as const, items: form.items };
  else if (form.photos.length > 0) volume = { method: "ai" as const, photos: form.photos };

  const services = {
    emballage: form.prestations.emballageFragile === "bailly" || form.prestations.emballageNonFragile === "bailly",
    demontage: form.prestations.demontage === "bailly",
    montage: form.prestations.demontage === "bailly",
    monte_meuble: false,
    garde_meuble: false,
  };

  return {
    client: {
      nom: [form.prenom, form.nom].filter(Boolean).join(" ") || form.email,
      email: form.email,
      tel: form.tel || undefined,
    },
    depart: toAddr(form.depart),
    arrivee: toAddr(form.arrivee),
    date_souhaitee: form.date_souhaitee || undefined,
    flexibilite: form.flexibilite || undefined,
    formule: form.formule,
    services,
    volume,
    type_client: form.type_client,
    societe: form.societe || undefined,
    mutation_pro: form.mutation_pro,
    valeur_mobilier: form.valeur_mobilier || undefined,
    assurance: form.assurance,
    articles_lourds: form.articles_lourds,
    commentaire: form.commentaire || undefined,
    prestations: form.prestations as unknown as Record<string, string>,
  };
}
