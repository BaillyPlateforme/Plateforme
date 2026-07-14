"use client";

import { useEffect, useMemo, useState } from "react";
import { CATALOG, LOGEMENT_HINTS } from "@/lib/catalog";
import { Field, TextInput } from "./ui";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import type { AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import ModeSwitch from "@/components/ModeSwitch";
import { InstantResult, Comparateur } from "./QuoteTools";
import { AddressInput, roadDistanceKm, type Place } from "./AddressInput";

/* ============================ Types ============================ */

type YN = "oui" | "non" | "";
type Presta = "moi" | "bailly" | "";
type Demontage = "possible" | "imperatif" | "";
type VolumeMode = "explicit" | "list" | "ai";
type ListItem = { label: string; quantite: number; volume_unitaire_m3: number };

type Address = {
  adresse: string;
  complement: string;
  ville: string;
  region: string;
  code_postal: string;
  pays: string;
  etage: string;
  duplex: YN;
  ascenseur: YN;
  taille_ascenseur: string;
  passage_ascenseur: YN;
  passage_escalier: YN;
  surface: string;
  difficulte_acces: YN;
  type_difficulte: string;
  stationnement: YN;
  lat?: number;
  lon?: number;
};

type FormState = {
  // Étape 1
  type_client: "particulier" | "entreprise";
  prenom: string;
  nom: string;
  tel: string;
  email: string;
  valeur_mobilier: string;
  assurance: "standard" | "luxe" | "";
  mutation_pro: YN;
  societe: string;
  demenagement: "complet" | "partiel" | "";
  articles_lourds: YN;
  periode: string;
  // Étapes 2/3
  depart: Address;
  arrivee: Address;
  // Étape 4
  prestations: { fragile: Presta; embNonFragile: Presta; debNonFragile: Presta; demontage: Presta; transport: Presta };
  // Étape 5
  emballage: {
    ikea: Demontage; ikeaPrecision: string;
    anciens: Demontage; anciensPrecision: string;
    specifiques: Demontage; specifiquesPrecision: string;
  };
  // Étape 6
  volumeMode: VolumeMode;
  explicitVolume: string;
  items: ListItem[];
  photos: AnalyzedPhoto[];
  // Étape 7
  commentaire: string;
};

/* ============================ Constantes ============================ */

const STEPS = ["Vous", "Départ", "Arrivée", "Prestations", "Emballage", "Inventaire", "Commentaires"] as const;

const HEADERS: { eyebrow: string; title: string; sub: string }[] = [
  { eyebrow: "Informations personnelles", title: "Parlez-nous de vous", sub: "Une question, un projet ? Nous vous accompagnons à chaque étape." },
  { eyebrow: "Adresse de départ", title: "D'où partez-vous ?", sub: "L'adresse et les conditions d'accès actuelles." },
  { eyebrow: "Adresse d'arrivée", title: "Où allez-vous ?", sub: "L'adresse et les conditions d'accès à l'arrivée." },
  { eyebrow: "Prestations", title: "Que devons-nous prendre en charge ?", sub: "Vous choisissez, nous nous occupons du reste." },
  { eyebrow: "Prestation d'emballage", title: "Vos meubles à démonter", sub: "Pour préparer au mieux le démontage et le remontage." },
  { eyebrow: "Inventaire", title: "Quel volume à déménager ?", sub: "Trois façons de l'estimer — dont l'analyse par photo." },
  { eyebrow: "Commentaires", title: "Un dernier mot ?", sub: "Vérifiez vos informations et ajoutez vos précisions." },
];

const TYPES_LOGEMENT = ["Studio", "T1", "T2", "T3", "T4", "T5+", "Maison", "Local"];
const VALEURS = ["< 10 000 €", "10 000 – 30 000 €", "30 000 – 60 000 €", "> 60 000 €"];
const ASSURANCES: [string, string][] = [
  ["standard", "Garantie STANDARD — avec franchise, à valeur de vétusté"],
  ["luxe", "Garantie LUXE — sans franchise, à valeur de remplacement"],
];
const PRESTATIONS: { key: keyof FormState["prestations"]; label: string }[] = [
  { key: "fragile", label: "Emballage et déballage du fragile" },
  { key: "embNonFragile", label: "Emballage du non fragile" },
  { key: "debNonFragile", label: "Déballage du non fragile" },
  { key: "demontage", label: "Démontage et remontage du mobilier" },
  { key: "transport", label: "Transport de meubles uniquement" },
];
const PAYS = [
  "France", "Belgique", "Suisse", "Luxembourg", "Allemagne", "Espagne", "Italie", "Portugal",
  "Royaume-Uni", "Pays-Bas", "Irlande", "Autriche", "Danemark", "Suède", "Norvège", "Pologne",
  "Maroc", "Tunisie", "Algérie", "États-Unis", "Canada", "Australie", "Autre",
];

const emptyAddress: Address = {
  adresse: "", complement: "", ville: "", region: "", code_postal: "", pays: "France",
  etage: "", duplex: "", ascenseur: "", taille_ascenseur: "", passage_ascenseur: "",
  passage_escalier: "", surface: "", difficulte_acces: "", type_difficulte: "", stationnement: "",
};

const initial: FormState = {
  type_client: "particulier", prenom: "", nom: "", tel: "", email: "",
  valeur_mobilier: "", assurance: "", mutation_pro: "", societe: "", demenagement: "", articles_lourds: "", periode: "",
  depart: { ...emptyAddress }, arrivee: { ...emptyAddress },
  prestations: { fragile: "", embNonFragile: "", debNonFragile: "", demontage: "", transport: "" },
  emballage: { ikea: "", ikeaPrecision: "", anciens: "", anciensPrecision: "", specifiques: "", specifiquesPrecision: "" },
  volumeMode: "explicit", explicitVolume: "", items: [], photos: [],
  commentaire: "",
};

const DEMO: FormState = {
  ...initial,
  prenom: "Camille", nom: "Durand", tel: "06 12 34 56 78", email: "camille.durand@email.fr",
  valeur_mobilier: "10 000 – 30 000 €", assurance: "standard", mutation_pro: "non", demenagement: "complet",
  articles_lourds: "non", periode: "",
  depart: { ...emptyAddress, adresse: "24 rue des Lilas", code_postal: "69003", ville: "Lyon", etage: "3", surface: "65", ascenseur: "non", stationnement: "oui" },
  arrivee: { ...emptyAddress, adresse: "8 avenue Jean Jaurès", code_postal: "31000", ville: "Toulouse", etage: "1", surface: "70", ascenseur: "oui" },
  prestations: { fragile: "bailly", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  volumeMode: "explicit", explicitVolume: "30",
};

/* ============================ Sélecteur de devis ============================ */

export default function DemandeForm({ library, instant = false }: { library: LibraryPhoto[]; instant?: boolean }) {
  const [mode, setMode] = useState<null | "express" | "complet">(null);
  if (mode === null) return <ModeChooser heroUrls={library.map((l) => l.url)} onSelect={setMode} />;
  if (mode === "express") return <ExpressForm library={library} onBack={() => setMode(null)} instant={instant} />;
  return <CompleteForm library={library} onBack={() => setMode(null)} instant={instant} />;
}

function BrandPanel({ heroUrl, children }: { heroUrl?: string; children?: React.ReactNode }) {
  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-subtle md:sticky md:top-0 md:flex md:h-screen md:flex-col md:justify-between">
      <div className="relative z-10 p-9">
        <div className="font-serif text-3xl font-semibold text-ink">Bailly</div>
        <div className="eyebrow mt-1 text-ink-soft">Déménagement</div>
        <p className="mt-7 max-w-xs font-serif text-2xl leading-snug text-ink">
          Une question, un projet ? Nous vous accompagnons à chaque étape.
        </p>
      </div>
      {heroUrl && (
        <div className="relative z-10 px-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroUrl} alt="" className="h-44 w-full rounded-2xl border border-line object-cover" />
        </div>
      )}
      <div className="relative z-10 p-9">
        <div className="border-t border-line pt-5 text-sm text-ink-soft">
          {children ?? "Échangez avec nos experts pour un accompagnement sur mesure."}
        </div>
      </div>
    </aside>
  );
}

function BigCard({ onClick, img, icon, badge, title, desc, points, delay }: {
  onClick: () => void; img?: string; icon: string; badge: string; title: string; desc: string; points: string[]; delay: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: delay }}
      className="group animate-fade-up flex flex-col overflow-hidden rounded-[24px] border border-line bg-card text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-md)]"
    >
      {/* Visuel */}
      <div className="relative h-52 w-full overflow-hidden">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105" />
        ) : (
          <div className="h-full w-full bg-accent-soft" />
        )}
        <div className="absolute left-5 top-5 z-10 flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/50 bg-white/75 text-xl backdrop-blur-md">{icon}</span>
          <span className="rounded-full border border-white/50 bg-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink backdrop-blur-md">{badge}</span>
        </div>
      </div>

      {/* Contenu sur fond clair */}
      <div className="flex flex-1 flex-col p-7 md:p-8">
        <h2 className="font-serif text-3xl text-ink md:text-4xl">{title}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{desc}</p>
        <ul className="mt-4 space-y-1.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2 text-sm text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />{p}
            </li>
          ))}
        </ul>
        <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-all duration-300 group-hover:gap-3 group-hover:bg-accent-dark">
          Commencer <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </button>
  );
}

function ModeChooser({ heroUrls, onSelect }: { heroUrls: (string | undefined)[]; onSelect: (m: "express" | "complet") => void }) {
  return (
    <>
      <ModeSwitch current="form" />
      <div className="relative min-h-screen overflow-hidden bg-paper text-ink">
        <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12 md:py-16">
          <header className="animate-fade-up">
            <div className="font-serif text-2xl font-semibold">Bailly</div>
            <div className="eyebrow mt-4 text-accent">Demande de devis</div>
            <h1 className="mt-2 max-w-2xl font-serif text-4xl leading-[1.05] md:text-6xl">Comment souhaitez-vous procéder ?</h1>
            <p className="mt-3 text-ink-soft">Deux formules — à vous de choisir.</p>
          </header>

          <div className="mt-9 grid flex-1 gap-5 md:grid-cols-2">
            <BigCard
              onClick={() => onSelect("express")}
              img={heroUrls[0]}
              icon="⚡"
              badge="≈ 2 minutes"
              title="Devis express"
              desc="Une estimation rapide, sans détour. Idéal pour obtenir un premier chiffrage."
              points={["Vos coordonnées", "Trajet départ → arrivée", "Volume : saisie ou photos IA"]}
              delay="80ms"
            />
            <BigCard
              onClick={() => onSelect("complet")}
              img={heroUrls[1] ?? heroUrls[0]}
              icon="◆"
              badge="Sur mesure"
              title="Devis complet"
              desc="Le dossier détaillé pour un devis au plus juste, adapté à votre situation."
              points={["Conditions d'accès complètes", "Prestations & emballage", "Assurance & inventaire"]}
              delay="160ms"
            />
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================ Devis express ============================ */

function ExpressForm({ library, onBack, instant }: { library: LibraryPhoto[]; onBack: () => void; instant: boolean }) {
  const [compare, setCompare] = useState(false);
  const [doneCount, setDoneCount] = useState(1);
  const [f, setF] = useState({
    nom: "", email: "", tel: "", departVille: "", departCP: "", arriveeVille: "", date: "",
    volMode: "explicit" as "explicit" | "ai", explicitVolume: "", photos: [] as AnalyzedPhoto[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departCoord, setDepartCoord] = useState<Place | null>(null);
  const [arriveeCoord, setArriveeCoord] = useState<Place | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (!departCoord || !arriveeCoord) { setDistanceKm(null); return; }
    let cancelled = false;
    roadDistanceKm(departCoord, arriveeCoord).then((km) => { if (!cancelled) setDistanceKm(km); });
    return () => { cancelled = true; };
  }, [departCoord, arriveeCoord]);

  const volume = f.volMode === "explicit"
    ? (isNaN(parseFloat(f.explicitVolume)) ? null : Math.round(parseFloat(f.explicitVolume) * 100) / 100)
    : (f.photos.length ? Math.round(f.photos.reduce((s, p) => s + p.volume_m3, 0) * 100) / 100 : null);

  const canSubmit = f.nom.trim() && /.+@.+\..+/.test(f.email) && f.departVille.trim() && f.arriveeVille.trim() && volume != null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const volumePayload = f.volMode === "explicit"
        ? { method: "explicit" as const, volume_m3: parseFloat(f.explicitVolume) }
        : { method: "ai" as const, photos: f.photos };
      const res = await fetch("/api/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { nom: f.nom, email: f.email, tel: f.tel || undefined },
          depart: { ville: f.departVille || undefined, code_postal: f.departCP || undefined },
          arrivee: { ville: f.arriveeVille || undefined },
          date_souhaitee: f.date || undefined,
          distance_km: distanceKm ?? undefined,
          volume: volumePayload,
          type_client: "particulier",
          details: { express: true } as unknown as Record<string, unknown>,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
      setDone(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally { setSubmitting(false); }
  }

  if (done) {
    return instant ? (
      <InstantResult requestId={done} volume={volume} count={doneCount} />
    ) : (
      <SuccessScreen id={done} volume={volume} heroUrl={library[0]?.url} count={doneCount} />
    );
  }

  return (
    <>
      {compare && (
        <Comparateur
          simple
          base={{ nom: f.nom, email: f.email, tel: f.tel, departVille: f.departVille, departCP: f.departCP, arriveeVille: f.arriveeVille, date: f.date }}
          initial={{ volume: f.explicitVolume, distance: distanceKm != null ? String(distanceKm) : "" }}
          onClose={() => setCompare(false)}
          onDone={(count, firstId) => { setCompare(false); setDoneCount(count); setDone(firstId); }}
        />
      )}
      <ModeSwitch current="form" />
      <div className="min-h-screen bg-paper md:grid md:grid-cols-[minmax(340px,420px)_1fr]">
        <BrandPanel heroUrl={library[0]?.url} />
        <main className="flex min-h-screen flex-col">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10 md:px-12 md:py-14">
            <button type="button" onClick={onBack} className="mb-4 self-start text-xs font-medium text-ink-soft transition hover:text-ink">
              ← Changer de type de devis
            </button>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow text-accent">Devis express</div>
                <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">Estimation rapide</h1>
                <p className="mt-2 text-ink-soft">L&apos;essentiel pour un premier chiffrage — en deux minutes.</p>
              </div>
              <button
                type="button"
                onClick={() => set({ nom: "Camille Durand", email: "camille.durand@email.fr", tel: "06 12 34 56 78", departVille: "Lyon", departCP: "69003", arriveeVille: "Toulouse", volMode: "explicit", explicitVolume: "30" })}
                className="ml-4 hidden shrink-0 rounded-full border border-line-strong bg-card px-3.5 py-2 text-xs font-medium transition hover:border-ink sm:block"
              >
                ⚡ Devis express
              </button>
            </div>

            <div className="mt-8 space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Nom *"><TextInput value={f.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Camille Durand" /></Field>
                <Field label="E-mail *"><TextInput type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="camille@email.fr" /></Field>
                <Field label="Téléphone"><TextInput value={f.tel} onChange={(e) => set({ tel: e.target.value })} placeholder="06 12 34 56 78" /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ville de départ *" hint="Commencez à taper, choisissez dans la liste">
                  <AddressInput kind="municipality" value={f.departVille} placeholder="Lyon"
                    onChange={(v) => { set({ departVille: v }); setDepartCoord(null); }}
                    onSelect={(p) => { set({ departVille: p.ville, departCP: p.code_postal }); setDepartCoord(p); }} />
                </Field>
                <Field label="Ville d'arrivée *" hint="Commencez à taper, choisissez dans la liste">
                  <AddressInput kind="municipality" value={f.arriveeVille} placeholder="Toulouse"
                    onChange={(v) => { set({ arriveeVille: v }); setArriveeCoord(null); }}
                    onSelect={(p) => { set({ arriveeVille: p.ville }); setArriveeCoord(p); }} />
                </Field>
              </div>
              {distanceKm != null && (
                <div className="rounded-lg border border-line bg-subtle/60 px-4 py-2.5 text-sm">
                  📍 Distance estimée : <span className="font-semibold text-ink">{distanceKm} km</span> <span className="text-ink-soft">(trajet routier)</span>
                </div>
              )}
              <Field label="Date souhaitée" hint="facultatif"><TextInput type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>

              <div>
                <div className="mb-2 text-sm font-medium">Volume à déménager *</div>
                <div className="mb-4 w-full sm:w-80">
                  <Choice options={[["explicit", "Je connais mon volume"], ["ai", "J'envoie des photos"]]} value={f.volMode} onChange={(v) => set({ volMode: v as "explicit" | "ai" })} />
                </div>
                {f.volMode === "explicit" ? (
                  <div className="space-y-3">
                    <TextInput type="number" min={0} step="0.5" value={f.explicitVolume} onChange={(e) => set({ explicitVolume: e.target.value })} placeholder="Volume estimé en m³" />
                    <div className="flex flex-wrap gap-2">
                      {LOGEMENT_HINTS.map((h) => <Pill key={h.label} active={false} onClick={() => set({ explicitVolume: String(h.volume) })}>{h.label} · ~{h.volume} m³</Pill>)}
                    </div>
                  </div>
                ) : (
                  <PhotoAnalyzer library={library} photos={f.photos} onChange={(photos) => set({ photos })} />
                )}
              </div>
            </div>

            {error && <div className="mt-6 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">{error}</div>}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
              <span className="text-sm text-ink-soft">{volume != null ? `Volume estimé : ${volume} m³` : "Renseignez le volume"}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCompare(true)}
                  className="rounded-lg border border-line-strong px-5 py-3 text-sm font-medium transition hover:bg-subtle">
                  Comparer
                </button>
                <button type="button" onClick={submit} disabled={!canSubmit || submitting}
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40">
                  {submitting ? "Envoi…" : "Obtenir mon estimation"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

/* ============================ Formulaire complet ============================ */

function CompleteForm({ library, onBack, instant }: { library: LibraryPhoto[]; onBack: () => void; instant: boolean }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(1);
  const [compare, setCompare] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalVolume = useMemo(() => computeVolume(form), [form]);

  useEffect(() => {
    const d = form.depart, a = form.arrivee;
    if (d.lat != null && d.lon != null && a.lat != null && a.lon != null) {
      let cancelled = false;
      roadDistanceKm({ lat: d.lat, lon: d.lon }, { lat: a.lat, lon: a.lon }).then((km) => { if (!cancelled) setDistanceKm(km); });
      return () => { cancelled = true; };
    }
    setDistanceKm(null);
  }, [form.depart, form.arrivee]);
  const heroUrl = library[0]?.url;

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  function fillDemo() { setForm(DEMO); setStep(STEPS.length - 1); }
  const canNext = validateStep(step, form);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...buildPayload(form), distance_km: distanceKm ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
      setDone(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally { setSubmitting(false); }
  }

  if (done) {
    return instant ? (
      <InstantResult requestId={done} volume={totalVolume} count={doneCount} />
    ) : (
      <SuccessScreen id={done} volume={totalVolume} heroUrl={heroUrl} count={doneCount} />
    );
  }
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      {compare && (
        <Comparateur
          base={{ nom: `${form.prenom} ${form.nom}`.trim(), email: form.email, tel: form.tel, departVille: form.depart.ville, departCP: form.depart.code_postal, arriveeVille: form.arrivee.ville, date: form.periode }}
          initial={{
            volume: String(totalVolume ?? ""),
            distance: distanceKm != null ? String(distanceKm) : "",
            departEtage: form.depart.etage || "0",
            departAsc: form.depart.ascenseur === "oui",
            arriveeEtage: form.arrivee.etage || "0",
            arriveeAsc: form.arrivee.ascenseur === "oui",
            emballage: form.prestations.fragile === "bailly" || form.prestations.embNonFragile === "bailly",
            demontage: form.prestations.demontage === "bailly",
            montage: form.prestations.demontage === "bailly",
          }}
          onClose={() => setCompare(false)}
          onDone={(count, firstId) => { setCompare(false); setDoneCount(count); setDone(firstId); }}
        />
      )}
      <ModeSwitch current="form" />
      <div className="min-h-screen bg-paper md:grid md:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Panneau visuel */}
        <aside className="relative hidden overflow-hidden border-r border-line bg-subtle md:sticky md:top-0 md:flex md:h-screen md:flex-col md:justify-between">
          <div className="relative z-10 p-9">
            <div className="font-serif text-3xl font-semibold text-ink">Bailly</div>
            <div className="eyebrow mt-1 text-ink-soft">Déménagement</div>
            <p className="mt-7 max-w-xs font-serif text-2xl leading-snug text-ink">
              Une question, un projet ? Nous vous accompagnons à chaque étape.
            </p>
          </div>
          <div className="relative z-10 px-9">
            <ol className="space-y-0.5">
              {STEPS.map((label, i) => {
                const state = i === step ? "active" : i < step ? "done" : "todo";
                return (
                  <li key={label}>
                    <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition ${
                        state === "active" ? "bg-accent-soft font-medium text-accent" : state === "done" ? "text-ink hover:bg-line/50" : "text-ink-soft/50"}`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                        state === "active" ? "bg-accent text-white" : state === "done" ? "bg-accent-soft text-accent" : "border border-line-strong text-ink-soft/50"}`}>
                        {state === "done" ? "✓" : i + 1}
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="relative z-10 p-9">
            <div className="flex items-end justify-between border-t border-line pt-5">
              <p className="max-w-[13rem] text-sm text-ink-soft">Échangez avec nos experts pour un accompagnement sur mesure.</p>
              <div className="text-right">
                <div className="eyebrow text-ink-soft">Volume estimé</div>
                <div className="font-serif text-3xl text-ink">{totalVolume ?? "—"}<span className="ml-1 text-base text-ink-soft">m³</span></div>
                {distanceKm != null && <div className="mt-1 text-xs text-ink-soft">📍 {distanceKm} km</div>}
              </div>
            </div>
          </div>
        </aside>

        {/* Contenu */}
        <main className="flex min-h-screen flex-col">
          <div className="sticky top-0 z-20 h-1 w-full bg-line">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10 md:px-12 md:py-14">
            <button type="button" onClick={onBack} className="mb-4 self-start text-xs font-medium text-ink-soft transition hover:text-ink">
              ← Changer de type de devis
            </button>
            <div className="mb-8 flex items-start justify-between">
              <div>
                <div className="eyebrow text-accent">Étape {step + 1} / {STEPS.length} · {HEADERS[step].eyebrow}</div>
                <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{HEADERS[step].title}</h1>
                <p className="mt-2 text-ink-soft">{HEADERS[step].sub}</p>
              </div>
              <button type="button" onClick={fillDemo}
                className="ml-4 hidden shrink-0 rounded-full border border-line-strong bg-card px-3.5 py-2 text-xs font-medium transition hover:border-ink sm:block">
                ⚡ Devis express
              </button>
            </div>

            <div key={step} className="animate-step-in flex-1">
              {step === 0 && <VousStep form={form} patch={patch} />}
              {step === 1 && <AddressStep which="depart" form={form} patch={patch} />}
              {step === 2 && <AddressStep which="arrivee" form={form} patch={patch} />}
              {step === 3 && <PrestationsStep form={form} patch={patch} />}
              {step === 4 && <EmballageStep form={form} patch={patch} />}
              {step === 5 && <VolumeStep form={form} patch={patch} library={library} />}
              {step === 6 && <CommentairesStep form={form} patch={patch} volume={totalVolume} />}
            </div>

            {error && <div className="mt-6 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">{error}</div>}

            <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
              <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:text-ink disabled:opacity-40">← Retour</button>
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40">Enregistrer et continuer</button>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCompare(true)}
                    className="rounded-lg border border-line-strong px-5 py-3 text-sm font-medium transition hover:bg-subtle">Comparer</button>
                  <button type="button" onClick={submit} disabled={submitting}
                    className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">{submitting ? "Envoi…" : "Envoyer ma demande"}</button>
                </div>
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
      <Field label="Vous êtes *">
        <Choice options={[["particulier", "Particulier"], ["entreprise", "Entreprise"]]} value={form.type_client} onChange={(v) => patch({ type_client: v as FormState["type_client"] })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Prénom"><TextInput value={form.prenom} onChange={(e) => patch({ prenom: e.target.value })} placeholder="Camille" /></Field>
        <Field label="Nom"><TextInput value={form.nom} onChange={(e) => patch({ nom: e.target.value })} placeholder="Durand" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Téléphone *"><TextInput value={form.tel} onChange={(e) => patch({ tel: e.target.value })} placeholder="06 12 34 56 78" /></Field>
        <Field label="E-mail *"><TextInput type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="camille.durand@email.fr" /></Field>
      </div>
      <Field label="Estimation de la valeur du mobilier" hint="facultatif">
        <div className="flex flex-wrap gap-2">
          {VALEURS.map((v) => <Pill key={v} active={form.valeur_mobilier === v} onClick={() => patch({ valeur_mobilier: v })}>{v}</Pill>)}
        </div>
      </Field>
      <Field label="Assurance souhaitée *">
        <div className="space-y-2">
          {ASSURANCES.map(([v, l]) => (
            <button key={v} type="button" onClick={() => patch({ assurance: v as FormState["assurance"] })}
              className={`block w-full rounded-lg border px-4 py-2.5 text-left text-sm transition ${form.assurance === v ? "border-accent bg-accent-soft/50" : "border-line bg-card hover:border-line-strong"}`}>{l}</button>
          ))}
        </div>
      </Field>
      <Field label="S'agit-il d'une mutation professionnelle ? *">
        <YesNo value={form.mutation_pro} onChange={(v) => patch({ mutation_pro: v })} />
      </Field>
      {(form.type_client === "entreprise" || form.mutation_pro === "oui") && (
        <Field label="De quelle société s'agit-il ?"><TextInput value={form.societe} onChange={(e) => patch({ societe: e.target.value })} placeholder="Nom de la société" /></Field>
      )}
      <Field label="Déménagement complet ou partiel ?">
        <Choice options={[["complet", "Complet"], ["partiel", "Partiel"]]} value={form.demenagement} onChange={(v) => patch({ demenagement: v as FormState["demenagement"] })} />
      </Field>
      <Field label="Avez-vous des articles de plus de 80 kg ?">
        <YesNo value={form.articles_lourds} onChange={(v) => patch({ articles_lourds: v })} />
      </Field>
      <Field label="Période souhaitée *"><TextInput type="date" value={form.periode} onChange={(e) => patch({ periode: e.target.value })} /></Field>
    </div>
  );
}

function AddressStep({ which, form, patch }: StepProps & { which: "depart" | "arrivee" }) {
  const a = form[which];
  const set = (p: Partial<Address>) => patch({ [which]: { ...a, ...p } } as Partial<FormState>);
  return (
    <div className="space-y-6">
      <Field label={`Adresse ${which === "depart" ? "de départ" : "d'arrivée"} *`} hint="Tapez et choisissez dans la liste (adresse & distance automatiques)">
        <AddressInput kind="address" value={a.adresse} placeholder="12 rue de la République, Paris"
          onChange={(v) => set({ adresse: v, lat: undefined, lon: undefined })}
          onSelect={(p) => set({ adresse: p.label, ville: p.ville, code_postal: p.code_postal, lat: p.lat, lon: p.lon })} />
      </Field>
      <Field label="Complément d'adresse" hint="facultatif">
        <TextInput value={a.complement} onChange={(e) => set({ complement: e.target.value })} placeholder="Bâtiment, appartement…" />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-4">
        <Field label="Code postal"><TextInput value={a.code_postal} onChange={(e) => set({ code_postal: e.target.value })} placeholder="75011" /></Field>
        <Field label="Ville"><TextInput value={a.ville} onChange={(e) => set({ ville: e.target.value })} placeholder="Paris" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="État / Province / Région"><TextInput value={a.region} onChange={(e) => set({ region: e.target.value })} placeholder="Île-de-France" /></Field>
        <Field label="Pays">
          <select value={a.pays} onChange={(e) => set({ pays: e.target.value })} className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-accent">
            {PAYS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>

      <div className="rounded-xl border border-line bg-card p-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Accès au logement</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Étage" hint="0 = RDC"><TextInput type="number" min={0} value={a.etage} onChange={(e) => set({ etage: e.target.value })} placeholder="3" /></Field>
          <Field label="Surface habitable" hint="m²"><TextInput type="number" min={0} value={a.surface} onChange={(e) => set({ surface: e.target.value })} placeholder="65" /></Field>
        </div>
        <div className="mt-3 space-y-3">
          <FieldRow label="Duplex ?"><YesNo value={a.duplex} onChange={(v) => set({ duplex: v })} /></FieldRow>
          <FieldRow label="Ascenseur ?"><YesNo value={a.ascenseur} onChange={(v) => set({ ascenseur: v })} /></FieldRow>
          {a.ascenseur === "oui" && (
            <div className="grid grid-cols-1 gap-3 pl-1">
              <Field label="Taille de l'ascenseur (nb de personnes)"><TextInput type="number" min={0} value={a.taille_ascenseur} onChange={(e) => set({ taille_ascenseur: e.target.value })} placeholder="4" /></Field>
              <FieldRow label="Vos meubles passent-ils par l'ascenseur ?"><YesNo value={a.passage_ascenseur} onChange={(v) => set({ passage_ascenseur: v })} /></FieldRow>
            </div>
          )}
          <FieldRow label="Vos meubles passent-ils par l'escalier ?"><YesNo value={a.passage_escalier} onChange={(v) => set({ passage_escalier: v })} /></FieldRow>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-card p-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Accès camion</div>
        <div className="space-y-3">
          <FieldRow label="Difficultés d'accès en camion poids lourd ?"><YesNo value={a.difficulte_acces} onChange={(v) => set({ difficulte_acces: v })} /></FieldRow>
          {a.difficulte_acces === "oui" && (
            <Field label="Type de difficulté d'accès"><TextInput value={a.type_difficulte} onChange={(e) => set({ type_difficulte: e.target.value })} placeholder="Rue étroite, sens interdit, hauteur limitée…" /></Field>
          )}
          <FieldRow label="Autorisation de stationnement nécessaire ?"><YesNo value={a.stationnement} onChange={(v) => set({ stationnement: v })} /></FieldRow>
        </div>
      </div>
    </div>
  );
}

function PrestationsStep({ form, patch }: StepProps) {
  return (
    <div className="space-y-2.5">
      {PRESTATIONS.map((p) => (
        <div key={p.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3">
          <div className="text-sm font-medium">{p.label}</div>
          <Choice small options={[["moi", "Je m'en occupe"], ["bailly", "Bailly"]]} value={form.prestations[p.key]} onChange={(v) => patch({ prestations: { ...form.prestations, [p.key]: v as Presta } })} />
        </div>
      ))}
    </div>
  );
}

function EmballageStep({ form, patch }: StepProps) {
  const e = form.emballage;
  const rows: { key: keyof FormState["emballage"]; precKey: keyof FormState["emballage"]; label: string }[] = [
    { key: "ikea", precKey: "ikeaPrecision", label: "Meubles type IKEA / CONFORAMA…" },
    { key: "anciens", precKey: "anciensPrecision", label: "Meubles anciens" },
    { key: "specifiques", precKey: "specifiquesPrecision", label: "Meubles spécifiques" },
  ];
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.key} className="rounded-xl border border-line bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium">{r.label}</div>
            <Choice small options={[["possible", "Démontage possible"], ["imperatif", "Démontage impératif"]]} value={e[r.key] as string} onChange={(v) => patch({ emballage: { ...e, [r.key]: v as Demontage } })} />
          </div>
          <TextInput value={e[r.precKey] as string} onChange={(ev) => patch({ emballage: { ...e, [r.precKey]: ev.target.value } })} placeholder="Précisez (facultatif)" />
        </div>
      ))}
    </div>
  );
}

function CommentairesStep({ form, patch, volume }: StepProps & { volume: number | null }) {
  return (
    <div className="space-y-6">
      <RecapCard form={form} volume={volume} />
      <Field label="Message" hint="facultatif">
        <textarea value={form.commentaire} onChange={(e) => patch({ commentaire: e.target.value })} rows={5}
          className="w-full resize-none rounded-lg border border-line bg-card px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder="Précisions, contraintes, objets particuliers…" />
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
          <button key={m} type="button" onClick={() => patch({ volumeMode: m })}
            className={`rounded-xl border px-3 py-4 text-left transition ${mode === m ? "border-accent bg-accent-soft/50 shadow-sm" : "border-line bg-card hover:border-line-strong"}`}>
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
      <Field label="Volume estimé" hint="en m³"><TextInput type="number" min={0} step="0.5" value={form.explicitVolume} onChange={(e) => patch({ explicitVolume: e.target.value })} placeholder="25" /></Field>
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-ink-soft">Repères par logement</div>
        <div className="flex flex-wrap gap-2">
          {LOGEMENT_HINTS.map((h) => <Pill key={h.label} active={false} onClick={() => patch({ explicitVolume: String(h.volume) })}>{h.label} · ~{h.volume} m³</Pill>)}
        </div>
      </div>
    </div>
  );
}

function ListMode({ form, patch }: StepProps) {
  const items = form.items;
  const total = items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0);
  function addFromCatalog(label: string) {
    const preset = CATALOG.find((c) => c.label === label); if (!preset) return;
    const existing = items.findIndex((it) => it.label === label);
    if (existing >= 0) { const copy = [...items]; copy[existing] = { ...copy[existing], quantite: copy[existing].quantite + 1 }; patch({ items: copy }); }
    else patch({ items: [...items, { label, quantite: 1, volume_unitaire_m3: preset.volume }] });
  }
  function setQty(i: number, q: number) { if (q <= 0) return patch({ items: items.filter((_, idx) => idx !== i) }); const copy = [...items]; copy[i] = { ...copy[i], quantite: q }; patch({ items: copy }); }
  const groupes = [...new Set(CATALOG.map((c) => c.groupe))];
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {groupes.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-sm font-medium text-ink-soft">{g}</div>
            <div className="flex flex-wrap gap-1.5">
              {CATALOG.filter((c) => c.groupe === g).map((c) => (
                <button key={c.label} type="button" onClick={() => addFromCatalog(c.label)} className="rounded-full border border-line bg-card px-2.5 py-1 text-xs transition hover:border-accent hover:text-accent">+ {c.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div className="rounded-xl border border-line bg-card">
          {items.map((it, i) => (
            <div key={it.label} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1"><div className="truncate text-sm">{it.label}</div><div className="text-xs text-ink-soft">{it.volume_unitaire_m3} m³/u</div></div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setQty(i, it.quantite - 1)} className="h-7 w-7 rounded-md border border-line text-ink-soft hover:border-accent">−</button>
                <span className="w-8 text-center text-sm tabular-nums">{it.quantite}</span>
                <button type="button" onClick={() => setQty(i, it.quantite + 1)} className="h-7 w-7 rounded-md border border-line text-ink-soft hover:border-accent">+</button>
              </div>
              <div className="w-16 text-right text-sm tabular-nums">{(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³</div>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 font-medium"><span>Total</span><span className="tabular-nums">{total.toFixed(1)} m³</span></div>
        </div>
      )}
    </div>
  );
}

/* ---------- Récap + succès ---------- */

function RecapCard({ form, volume }: { form: FormState; volume: number | null }) {
  const presta = PRESTATIONS.filter((p) => form.prestations[p.key] === "bailly").map((p) => p.label).join(", ") || "aucune";
  const rows: [string, string][] = [
    ["Client", `${[form.prenom, form.nom].filter(Boolean).join(" ")} · ${form.email}${form.tel ? " · " + form.tel : ""}`],
    ["Départ", `${form.depart.adresse}, ${form.depart.code_postal} ${form.depart.ville}`],
    ["Arrivée", `${form.arrivee.adresse}, ${form.arrivee.code_postal} ${form.arrivee.ville}`],
    ["Prise en charge Bailly", presta],
    ["Période", form.periode || "à définir"],
    ["Volume", volume != null ? `${volume} m³` : "non renseigné"],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[150px_1fr] gap-4 border-b border-line px-4 py-2.5 text-sm last:border-0">
          <span className="text-ink-soft">{k}</span><span className="truncate text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function SuccessScreen({ id, volume, heroUrl, count = 1 }: { id: string; volume: number | null; heroUrl?: string; count?: number }) {
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
          <h1 className="font-serif text-5xl">{count > 1 ? `${count} demandes envoyées` : "Demande envoyée"}</h1>
          <p className="mt-3 text-ink-soft">
            {count > 1
              ? `Merci ! Nos experts étudient vos ${count} scénarios et vous adressent un devis pour chacun par e-mail.`
              : `Merci ! Nos experts analysent votre projet${volume != null ? ` (~${volume} m³)` : ""} et reviennent vers vous très vite.`}
          </p>
          <div className="mt-6 inline-block rounded-lg border border-line bg-card px-4 py-2 text-sm text-ink-soft">Référence : <span className="font-mono text-ink">{id.slice(0, 8)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ============================ UI ============================ */

function Choice({ options, value, onChange, small }: { options: [string, string][]; value: string; onChange: (v: string) => void; small?: boolean }) {
  return (
    <div className={`inline-flex rounded-lg border border-line bg-subtle p-0.5 ${small ? "" : "flex"}`}>
      {options.map(([val, label]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${small ? "" : "flex-1"} ${value === val ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

function YesNo({ value, onChange }: { value: YN; onChange: (v: YN) => void }) {
  return (
    <div className="inline-flex gap-2">
      {(["oui", "non"] as const).map((v) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${value === v ? "border-accent bg-accent-soft/60 text-accent-dark" : "border-line bg-card text-ink-soft hover:border-accent"}`}>
          {v === "oui" ? "Oui" : "Non"}
        </button>
      ))}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3.5 py-1.5 text-sm transition ${active ? "border-accent bg-accent-soft/60 text-accent-dark" : "border-line bg-card hover:border-accent hover:text-accent"}`}>{children}</button>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </div>
  );
}

/* ============================ Helpers ============================ */

function computeVolume(form: FormState): number | null {
  if (form.volumeMode === "explicit") { const v = parseFloat(form.explicitVolume); return isNaN(v) ? null : Math.round(v * 100) / 100; }
  if (form.volumeMode === "list") { if (form.items.length === 0) return null; return Math.round(form.items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0) * 100) / 100; }
  if (form.photos.length === 0) return null;
  return Math.round(form.photos.reduce((s, p) => s + p.volume_m3, 0) * 100) / 100;
}

function validateStep(step: number, form: FormState): boolean {
  switch (step) {
    case 0: return (form.prenom.trim() || form.nom.trim()).length > 0 && /.+@.+\..+/.test(form.email) && form.tel.trim().length > 0;
    case 1: return form.depart.adresse.trim().length > 0 || form.depart.ville.trim().length > 0;
    case 2: return form.arrivee.adresse.trim().length > 0 || form.arrivee.ville.trim().length > 0;
    case 5: return computeVolume(form) != null;
    default: return true;
  }
}

function buildPayload(form: FormState) {
  const yn = (v: YN) => (v === "oui" ? true : v === "non" ? false : undefined);
  const toAddr = (a: Address) => ({
    adresse: a.adresse || undefined, code_postal: a.code_postal || undefined, ville: a.ville || undefined,
    etage: a.etage ? parseInt(a.etage, 10) : undefined, ascenseur: yn(a.ascenseur),
    surface: a.surface ? parseFloat(a.surface) : undefined, stationnement: yn(a.stationnement),
    acces_difficile: yn(a.difficulte_acces),
  });

  let volume;
  if (form.volumeMode === "explicit") volume = { method: "explicit" as const, volume_m3: parseFloat(form.explicitVolume) };
  else if (form.volumeMode === "list") volume = { method: "list" as const, items: form.items };
  else if (form.photos.length > 0) volume = { method: "ai" as const, photos: form.photos };

  const services = {
    emballage: form.prestations.fragile === "bailly" || form.prestations.embNonFragile === "bailly",
    demontage: form.prestations.demontage === "bailly",
    montage: form.prestations.demontage === "bailly",
    monte_meuble: false, garde_meuble: false,
  };
  const bailly = PRESTATIONS.filter((p) => form.prestations[p.key] === "bailly").length;
  const formule = bailly >= 4 ? "luxe" : bailly >= 2 ? "standard" : "eco";

  return {
    client: { nom: [form.prenom, form.nom].filter(Boolean).join(" ") || form.email, email: form.email, tel: form.tel || undefined },
    depart: toAddr(form.depart), arrivee: toAddr(form.arrivee),
    date_souhaitee: form.periode || undefined,
    formule, services, volume,
    type_client: form.type_client,
    assurance: form.assurance || undefined,
    societe: form.societe || undefined,
    mutation_pro: form.mutation_pro === "oui",
    valeur_mobilier: form.valeur_mobilier || undefined,
    articles_lourds: form.articles_lourds === "oui",
    commentaire: form.commentaire || undefined,
    prestations: form.prestations as unknown as Record<string, string>,
    // tout le détail brut (adresses complètes, emballage, etc.) conservé
    details: { depart: form.depart, arrivee: form.arrivee, emballage: form.emballage, demenagement: form.demenagement } as unknown as Record<string, unknown>,
  };
}
