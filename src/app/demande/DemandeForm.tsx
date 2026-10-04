"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CATALOG, LOGEMENT_HINTS } from "@/lib/catalog";
import {
  Bloc,
  CarteChoix,
  Choice,
  Field,
  Icone,
  Ligne,
  Option,
  Pill,
  Selecteur,
  TextInput,
  YesNo,
  Zone,
  type NomIcone,
} from "./ui";
import ChoixFormule, {
  LIGNES_CARTE,
  PRESTATIONS_PAR_DEFAUT,
  formuleRetenue,
  nomFormule,
  type Prestations,
} from "./Formules";
import PhotoAnalyzer, { type LibraryPhoto } from "@/components/PhotoAnalyzer";
import { volumePhotos, type AnalyzedPhoto } from "@/components/PhotoAnalysisCard";
import { InstantResult, Comparateur } from "./QuoteTools";
import { AddressInput, roadDistanceKm, type Place } from "./AddressInput";

/* ============================ Types ============================ */

type YN = "oui" | "non" | "";
type Demontage = "possible" | "imperatif" | "";
type PeriodeMode = "date" | "suggestion" | "libre";
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
  portage_m: string;
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
  charges_lourdes: { label: string; poids: string }[];
  piano: YN;
  periode: string;
  periode_mode: PeriodeMode;
  // Étapes 2/3
  depart: Address;
  arrivee: Address;
  // Étape 4
  prestations: Prestations;
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

/** Ce que chaque étape demande, dit en trois mots sous son nom. */
const SOUS_ETAPES = [
  "Coordonnées et projet",
  "Adresse et accès",
  "Adresse et accès",
  "Votre formule",
  "Meubles à démonter",
  "Volume à déménager",
  "Relecture et envoi",
];

/** Le titre de chaque étape, avec le mot que le dégradé met en avant. */
const HEADERS: { eyebrow: string; avant: string; accent: string; apres: string; sub: string }[] = [
  { eyebrow: "Informations personnelles", avant: "Parlez-nous de ", accent: "vous", apres: "", sub: "Une question, un projet ? Nous vous accompagnons à chaque étape." },
  { eyebrow: "Adresse de départ", avant: "D'où ", accent: "partez-vous", apres: " ?", sub: "L'adresse et les conditions d'accès actuelles." },
  { eyebrow: "Adresse d'arrivée", avant: "Où ", accent: "allez-vous", apres: " ?", sub: "L'adresse et les conditions d'accès à l'arrivée." },
  { eyebrow: "Prestations", avant: "Que devons-nous ", accent: "prendre en charge", apres: " ?", sub: "Trois formules, comparées ligne par ligne. Vous choisissez, nous nous occupons du reste." },
  { eyebrow: "Prestation d'emballage", avant: "Vos meubles à ", accent: "démonter", apres: "", sub: "Pour préparer au mieux le démontage et le remontage." },
  { eyebrow: "Inventaire", avant: "Quel ", accent: "volume", apres: " à déménager ?", sub: "Trois façons de l'estimer — dont l'analyse par photo." },
  { eyebrow: "Commentaires", avant: "Un dernier ", accent: "mot", apres: " ?", sub: "Vérifiez vos informations et ajoutez vos précisions." },
];

const VALEURS = ["< 10 000 €", "10 000 – 30 000 €", "30 000 – 60 000 €", "> 60 000 €"];
// Les mots sont ceux du client : on écrit « garantie », jamais « assurance »,
// et le Luxe rembourse à l'identique — pas à neuf.
const GARANTIES: { key: "standard" | "luxe"; titre: string; texte: string; badge: string }[] = [
  {
    key: "standard",
    titre: "Garantie dommages standard",
    texte: "Garantie avec tableau de vétusté pour le mobilier.",
    badge: "Franchise de 300 € par sinistre",
  },
  {
    key: "luxe",
    titre: "Garantie dommages Luxe",
    texte: "Garantie en valeur de remplacement à l'identique et sans vétusté.",
    badge: "Sans franchise",
  },
];
const PAYS = [
  "France", "Belgique", "Suisse", "Luxembourg", "Allemagne", "Espagne", "Italie", "Portugal",
  "Royaume-Uni", "Pays-Bas", "Irlande", "Autriche", "Danemark", "Suède", "Norvège", "Pologne",
  "Maroc", "Tunisie", "Algérie", "États-Unis", "Canada", "Australie", "Autre",
];

const MEUBLES: {
  key: "ikea" | "anciens" | "specifiques";
  precKey: "ikeaPrecision" | "anciensPrecision" | "specifiquesPrecision";
  titre: string;
  sous: string;
  icone: NomIcone;
  exemple: string;
}[] = [
  {
    key: "ikea",
    precKey: "ikeaPrecision",
    titre: "Meubles type IKEA, Conforama…",
    sous: "Les meubles en kit, montés chez vous.",
    icone: "cle",
    exemple: "Armoire trois portes, lit avec tiroirs…",
  },
  {
    key: "anciens",
    precKey: "anciensPrecision",
    titre: "Meubles anciens",
    sous: "Armoires, buffets, meubles de famille.",
    icone: "sablier",
    exemple: "Armoire normande, buffet deux corps…",
  },
  {
    key: "specifiques",
    precKey: "specifiquesPrecision",
    titre: "Meubles spécifiques",
    sous: "Sur mesure, design ou de grandes dimensions.",
    icone: "regle",
    exemple: "Dressing sur mesure, lit mezzanine, bibliothèque murale…",
  },
];

const AGENCE = { lien: "tel:+33169103520", numero: "01 69 10 35 20" };

const emptyAddress: Address = {
  adresse: "", complement: "", ville: "", region: "", code_postal: "", pays: "France",
  etage: "", duplex: "", ascenseur: "", taille_ascenseur: "", passage_ascenseur: "",
  passage_escalier: "", surface: "", difficulte_acces: "", type_difficulte: "", stationnement: "",
  portage_m: "",
};

const initial: FormState = {
  type_client: "particulier", prenom: "", nom: "", tel: "", email: "",
  valeur_mobilier: "", assurance: "", mutation_pro: "", societe: "", demenagement: "", articles_lourds: "", charges_lourdes: [], piano: "", periode: "", periode_mode: "date",
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
  articles_lourds: "non", charges_lourdes: [], piano: "non", periode: "2026-11-15", periode_mode: "date",
  depart: { ...emptyAddress, adresse: "24 rue des Lilas", code_postal: "69003", ville: "Lyon", etage: "3", surface: "65", ascenseur: "non", stationnement: "oui", portage_m: "15" },
  arrivee: { ...emptyAddress, adresse: "8 avenue Jean Jaurès", code_postal: "31000", ville: "Toulouse", etage: "1", surface: "70", ascenseur: "oui" },
  prestations: { fragile: "bailly", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  volumeMode: "explicit", explicitVolume: "30",
};

const EXPRESS_VIDE = {
  nom: "", email: "", tel: "", departVille: "", departCP: "", arriveeVille: "",
  dateMode: "date" as PeriodeMode, date: "", periode: "",
  volMode: "explicit" as "explicit" | "ai", explicitVolume: "", photos: [] as AnalyzedPhoto[],
};

const delai = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/* ============================ Sélecteur de devis ============================ */

export default function DemandeForm({
  library,
  instant = false,
  modeInitial = "express",
  onQuitter,
}: {
  library: LibraryPhoto[];
  instant?: boolean;
  /** Le parcours choisi sur la vitrine. */
  modeInitial?: "express" | "complet";
  /** Retour à la vitrine, sans changer de page. */
  onQuitter: () => void;
}) {
  if (modeInitial === "express")
    return <ExpressForm library={library} onBack={onQuitter} instant={instant} />;
  return <CompleteForm library={library} onBack={onQuitter} instant={instant} />;
}

/* ============================ La coque ============================ */

/**
 * Le panneau de gauche, dans le langage de la vitrine : la photo d'intérieur
 * assombrie, le halo doré, le texte en blanc. Le milieu est laissé au
 * parcours ; en bas, la demande se remplit sous les yeux du client.
 *
 * Les noirs sont écrits en dur : le panneau reste sombre quel que soit le
 * thème, là où `bg-ink` s'éclaircirait de nuit.
 */
function BrandPanel({
  milieu,
  recap,
}: {
  milieu: ReactNode;
  recap: [string, string | null][];
}) {
  return (
    <aside className="grain relative hidden overflow-hidden bg-[#1b1a18] lg:sticky lg:top-0 lg:block lg:h-dvh">
      {/* Le décor a son propre cadre : next/image refuse un parent « sticky ». */}
      <div aria-hidden className="absolute inset-0">
        <Image src="/login-interieur.jpg" alt="" fill priority sizes="380px" className="ken-burns object-cover" />
        <div className="absolute inset-0 bg-[#1b1a18]/78" />
        <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/85 via-[#1b1a18]/55 to-[#1b1a18]/95" />
        <div className="halo drift absolute -left-24 top-1/3 h-[380px] w-[380px]" style={{ "--halo": "rgba(245,208,51,0.22)" } as CSSProperties} />
      </div>

      <div className="relative z-10 flex h-full flex-col overflow-y-auto px-7 py-8 [scrollbar-width:none] xl:px-9">
        <Image
          src="/marque/bailly-logo-blanc.svg"
          alt="Bailly Déménagement"
          width={200}
          height={64}
          priority
          className="h-auto w-[150px] shrink-0 xl:w-[170px]"
        />
        <p className="font-serif mt-6 max-w-xs text-[19px] leading-snug text-white xl:text-[21px] [@media(max-height:840px)]:hidden">
          Une question, un projet ? Nous vous{" "}
          <span className="gradient-flow-light">accompagnons</span> à chaque étape.
        </p>

        <div className="my-auto py-6">{milieu}</div>

        <div className="edge-glow relative shrink-0 rounded-[22px] bg-linear-to-br from-white/16 via-white/7 to-white/4 p-4 xl:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-white/55">Votre demande</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
              en direct
            </span>
          </div>
          <dl className="mt-3.5 space-y-2.5">
            {recap.map(([cle, valeur]) => (
              <div key={cle} className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[12px] text-white/55">{cle}</dt>
                <dd
                  key={valeur ?? "vide"}
                  className={`min-w-0 truncate text-right text-[13px] font-medium ${
                    valeur ? "animate-step-in text-white" : "text-white/28"
                  }`}
                >
                  {valeur ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
          <a
            href={AGENCE.lien}
            className="mt-4 flex items-center justify-between gap-3 border-t border-white/12 pt-3.5 text-[12px] text-white/60 transition hover:text-white"
          >
            <span>Une question ?</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <Icone nom="tel" taille={13} />
              {AGENCE.numero}
            </span>
          </a>
        </div>
      </div>
    </aside>
  );
}

/** Les sept étapes, sur un rail qui se remplit de jaune à mesure qu'on avance. */
function Frise({ step, onAller }: { step: number; onAller: (i: number) => void }) {
  return (
    <ol className="relative">
      <span aria-hidden className="absolute bottom-[26px] left-[15px] top-[26px] w-px bg-white/15" />
      <span
        aria-hidden
        className="absolute left-[15px] top-[26px] w-px bg-brand transition-[height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ height: `calc((100% - 52px) * ${step / (STEPS.length - 1)})` }}
      />
      {STEPS.map((label, i) => {
        const etat = i === step ? "active" : i < step ? "done" : "todo";
        return (
          <li key={label}>
            <button
              type="button"
              onClick={() => i < step && onAller(i)}
              disabled={i > step}
              aria-current={etat === "active" ? "step" : undefined}
              className={`relative flex w-full items-center gap-4 rounded-2xl py-2 pr-3 text-left transition-colors duration-200 ${
                etat === "done" ? "hover:bg-white/8" : ""
              }`}
            >
              <span
                className={`relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-[background-color,box-shadow,color] duration-300 ${
                  etat === "active"
                    ? "bg-brand text-[#1b1a18] shadow-[0_0_0_5px_rgba(245,208,51,0.24)]"
                    : etat === "done"
                      ? "bg-brand text-[#1b1a18]"
                      : "border border-white/28 bg-[#22211e] text-white/60"
                }`}
              >
                {etat === "done" ? <Icone nom="check" taille={13} trait={3.2} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-[14px] leading-tight ${
                    etat === "active" ? "font-semibold text-white" : etat === "done" ? "text-white/88" : "text-white/55"
                  }`}
                >
                  {label}
                </span>
                <span className={`mt-1 block text-[11.5px] leading-tight ${etat === "todo" ? "text-white/38" : "text-white/55"}`}>
                  {SOUS_ETAPES[i]}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Ce que promet le devis express, à la place des étapes. */
function PromessesExpress() {
  const lignes: [NomIcone, string, string][] = [
    ["eclair", "Deux minutes", "Quatre questions, pas une de plus."],
    ["euro", "Le prix tout de suite", "Calculé sur notre grille, celle du commercial."],
    ["bouclier", "Sans engagement", "Vous gardez l'estimation, et vous nous rappelez quand vous voulez."],
  ];
  return (
    <ul className="space-y-5">
      {lignes.map(([icone, titre, texte]) => (
        <li key={titre} className="flex gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/18 bg-white/10 text-brand">
            <Icone nom={icone} taille={18} />
          </span>
          <span>
            <span className="block text-[14px] font-semibold text-white">{titre}</span>
            <span className="mt-1 block text-[12.5px] leading-snug text-white/55">{texte}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Le cadre commun aux deux parcours : le panneau à gauche, la progression en
 * haut, le contenu, et la barre d'action qui reste collée en bas de l'écran.
 */
function Cadre({
  panneau,
  etiquette,
  progression,
  onBack,
  large = false,
  barre,
  children,
}: {
  panneau: ReactNode;
  /** Où l'on en est, pour le bandeau du téléphone. */
  etiquette: string;
  progression: number;
  onBack: () => void;
  /** Le comparateur de formules demande plus de place que les autres étapes. */
  large?: boolean;
  barre: ReactNode;
  children: ReactNode;
}) {
  const largeur = large ? "max-w-[1060px]" : "max-w-[860px]";
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
      {panneau}

      <main className="relative flex min-h-dvh min-w-0 flex-col">
        <div className="sticky top-0 z-40 h-[3px] w-full bg-line">
          <div
            className="h-full rounded-r-full bg-linear-to-r from-brand-mid to-brand shadow-[0_0_12px_rgba(245,208,51,0.85)] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${progression}%` }}
          />
        </div>

        {/* Une lueur dorée dans l'angle, comme sur la vitrine. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px] overflow-hidden">
          <div className="halo absolute -right-48 -top-56 h-[640px] w-[640px]" style={{ "--halo": "rgba(245,208,51,0.2)" } as CSSProperties} />
        </div>

        {/* Sur téléphone, le panneau disparaît : il en reste le logo et l'étape. */}
        <div className="relative z-10 flex items-center justify-between gap-3 bg-[#1b1a18] px-5 py-3 lg:hidden">
          <Image src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={120} height={38} priority className="h-7 w-auto" />
          <span className="text-[12px] font-medium text-white/70">{etiquette}</span>
        </div>

        <div className={`relative z-10 mx-auto w-full flex-1 px-5 pb-14 pt-6 sm:px-8 lg:px-12 lg:pt-9 ${largeur}`}>
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="group inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-card px-3.5 text-[12.5px] font-medium text-ink-mid transition hover:border-ink hover:text-ink"
            >
              <Icone nom="gauche" taille={14} trait={2.2} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
              Accueil
            </button>
            <a href={AGENCE.lien} className="inline-flex items-center gap-2 text-[12.5px] text-ink-soft transition hover:text-ink">
              <Icone nom="tel" taille={14} />
              <span className="hidden sm:inline">Besoin d&apos;aide ?</span>
              <span className="font-semibold text-ink">{AGENCE.numero}</span>
            </a>
          </div>
          {children}
        </div>

        <div className="sticky bottom-0 z-30 border-t border-line bg-card shadow-[0_-22px_44px_-32px_rgba(27,26,24,0.45)]">
          <div className={`mx-auto flex w-full items-center gap-3 px-5 py-3 sm:gap-4 sm:px-8 lg:px-12 ${largeur}`}>{barre}</div>
        </div>
      </main>
    </div>
  );
}

/** Le titre d'une page : la pastille, le surtitre, et un mot pris dans le dégradé. */
function Titre({
  pastille,
  texte,
  eyebrow,
  avant,
  accent,
  apres,
  sub,
}: {
  pastille: ReactNode;
  texte: string;
  eyebrow: string;
  avant: string;
  accent: string;
  apres: string;
  sub: string;
}) {
  return (
    <header className="mb-8 mt-7 sm:mb-9 sm:mt-9">
      <div className="reveal flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-ink py-1 pl-1 pr-3 text-[11.5px] font-semibold text-shell">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-bold text-[#1b1a18]">
            {pastille}
          </span>
          {texte}
        </span>
        <span className="eyebrow text-brand-ink">{eyebrow}</span>
      </div>
      <h1 className="font-serif reveal mt-4 text-balance text-[34px] sm:text-[44px] xl:text-[50px]" style={delai(60)}>
        {avant}
        <span className="gradient-text">{accent}</span>
        {apres}
      </h1>
      <p className="reveal mt-3.5 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft sm:text-[16px]" style={delai(120)}>
        {sub}
      </p>
    </header>
  );
}

/** Le bouton d'action : noir, avec sa flèche dans un rond jaune. */
function Bouton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex h-12 shrink-0 items-center gap-3 rounded-full bg-ink pl-5 pr-1.5 text-[14px] font-semibold text-shell shadow-[0_16px_30px_-16px_rgba(27,26,24,0.8)] transition-[box-shadow,transform,opacity] duration-200 hover:shadow-[0_20px_36px_-14px_rgba(27,26,24,0.85)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none sm:pl-6"
    >
      {children}
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[#1b1a18] transition-transform duration-300 group-hover:translate-x-0.5 group-disabled:translate-x-0">
        <Icone nom="droite" taille={16} trait={2.4} />
      </span>
    </button>
  );
}

function Erreur({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex items-start gap-2.5 rounded-[18px] border border-danger/30 bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
      <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
      {children}
    </div>
  );
}

/** Ce qui manque pour avancer, dit en clair au lieu d'un bouton grisé muet. */
function Manque({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-end gap-2 text-right text-[12.5px] leading-snug text-ink-soft sm:justify-start sm:text-left">
      <Icone nom="info" taille={15} className="hidden shrink-0 sm:block" />
      {children}
    </p>
  );
}

/* ============================ Devis express ============================ */

function ExpressForm({ library, onBack, instant }: { library: LibraryPhoto[]; onBack: () => void; instant: boolean }) {
  const [compare, setCompare] = useState(false);
  const [doneCount, setDoneCount] = useState(1);
  const [f, setF] = useState(EXPRESS_VIDE);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departCoord, setDepartCoord] = useState<Place | null>(null);
  const [arriveeCoord, setArriveeCoord] = useState<Place | null>(null);
  const [trajet, setTrajet] = useState<{ cle: string; km: number } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  // La distance appartient à un couple de villes : dès qu'une ville change,
  // la clé ne correspond plus et l'ancienne distance cesse de s'afficher.
  const cleTrajet =
    departCoord && arriveeCoord
      ? `${departCoord.lat},${departCoord.lon}|${arriveeCoord.lat},${arriveeCoord.lon}`
      : null;
  useEffect(() => {
    if (!cleTrajet || !departCoord || !arriveeCoord) return;
    let cancelled = false;
    roadDistanceKm(departCoord, arriveeCoord).then((km) => {
      if (!cancelled) setTrajet({ cle: cleTrajet, km });
    });
    return () => { cancelled = true; };
  }, [cleTrajet, departCoord, arriveeCoord]);
  const distanceKm = trajet && trajet.cle === cleTrajet ? trajet.km : null;

  // Le raccourci de démonstration, déclenché par ?demo=1. Différé d'un tour :
  // le premier rendu doit être le même côté serveur et côté navigateur.
  useEffect(() => {
    const id = setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
      setF((x) => ({ ...x, nom: "Camille Durand", email: "camille.durand@email.fr", tel: "06 12 34 56 78", departVille: "Lyon", departCP: "69003", arriveeVille: "Toulouse", date: "2026-11-15", volMode: "explicit", explicitVolume: "30" }));
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const volume = f.volMode === "explicit"
    ? (isNaN(parseFloat(f.explicitVolume)) ? null : Math.round(parseFloat(f.explicitVolume) * 100) / 100)
    : (f.photos.length ? volumePhotos(f.photos) : null);

  const coordOk = f.nom.trim().length > 0 && /.+@.+\..+/.test(f.email);
  const trajetOk = f.departVille.trim().length > 0 && f.arriveeVille.trim().length > 0;
  const dateOk = f.dateMode === "date" ? !!f.date : !!f.periode;
  const manque = !f.nom.trim()
    ? "Indiquez votre nom"
    : !coordOk
      ? "Indiquez un e-mail valide"
      : !f.departVille.trim()
        ? "Indiquez la ville de départ"
        : !f.arriveeVille.trim()
          ? "Indiquez la ville d'arrivée"
          : volume == null
            ? "Renseignez le volume à déménager"
            : null;
  // La date ne bloque plus : sans elle, on retient « je ne sais pas encore ».
  const faits = [coordOk, trajetOk, volume != null].filter(Boolean).length;

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
          date_souhaitee: f.dateMode === "date" ? (f.date || undefined) : undefined,
          flexibilite: dateOk ? (f.dateMode === "date" ? undefined : f.periode) : PERIODE_PAR_DEFAUT,
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
      <InstantResult requestId={done} volume={volume} count={doneCount}
        onNewQuote={() => { setDone(null); setDoneCount(1); setF(EXPRESS_VIDE); setDepartCoord(null); setArriveeCoord(null); setTrajet(null); }}
      />
    ) : (
      <SuccessScreen id={done} volume={volume} count={doneCount} />
    );
  }

  const quand = f.dateMode === "date" ? (f.date ? dateLisible(f.date) : null) : f.periode || null;

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
      <Cadre
        panneau={
          <BrandPanel
            milieu={<PromessesExpress />}
            recap={[
              ["Trajet", trajetLisible(f.departVille, f.arriveeVille)],
              ["Distance", distanceKm != null ? `${distanceKm} km` : null],
              ["Quand", quand],
              ["Volume", volume != null ? `${volume} m³` : null],
            ]}
          />
        }
        etiquette="Devis express"
        progression={8 + (faits / 3) * 92}
        onBack={onBack}
        barre={
          <>
            <div className="min-w-0 flex-1">
              {manque ? (
                <Manque>{manque}</Manque>
              ) : (
                <p className="text-right text-[12.5px] text-ink-soft sm:text-left">
                  Tout y est — <span className="font-semibold text-ink">{volume} m³</span> à déménager.
                </p>
              )}
            </div>
            <Bouton onClick={submit} disabled={manque !== null || submitting}>
              {submitting ? "Envoi…" : "Obtenir mon estimation"}
            </Bouton>
          </>
        }
      >
        <Titre
          pastille={<Icone nom="eclair" taille={11} trait={2.4} />}
          texte="2 minutes"
          eyebrow="Devis express"
          avant="Estimation "
          accent="rapide"
          apres=""
          sub="L'essentiel pour un premier chiffrage — en deux minutes."
        />

        <div className="space-y-5">
          <Bloc icone="user" titre="Vos coordonnées" sous="Pour vous envoyer l'estimation.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nom *"><TextInput icone="user" value={f.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Camille Durand" autoComplete="name" /></Field>
              <Field label="E-mail *"><TextInput icone="mail" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="camille@email.fr" autoComplete="email" /></Field>
              <Field label="Téléphone"><TextInput icone="tel" type="tel" value={f.tel} onChange={(e) => set({ tel: e.target.value })} placeholder="06 12 34 56 78" autoComplete="tel" /></Field>
            </div>
          </Bloc>

          <Bloc icone="route" titre="Votre trajet" sous="Commencez à taper, puis choisissez la ville dans la liste." delai={70}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ville de départ *">
                <AddressInput kind="municipality" value={f.departVille} placeholder="Lyon"
                  onChange={(v) => { set({ departVille: v }); setDepartCoord(null); }}
                  onSelect={(p) => { set({ departVille: p.ville, departCP: p.code_postal }); setDepartCoord(p); }} />
              </Field>
              <Field label="Ville d'arrivée *">
                <AddressInput kind="municipality" value={f.arriveeVille} placeholder="Toulouse"
                  onChange={(v) => { set({ arriveeVille: v }); setArriveeCoord(null); }}
                  onSelect={(p) => { set({ arriveeVille: p.ville }); setArriveeCoord(p); }} />
              </Field>
            </div>
            {distanceKm != null && (
              <div className="animate-step-in mt-4 inline-flex max-w-full items-center gap-2.5 rounded-full bg-ink py-2 pl-3 pr-4 text-[12.5px] text-shell">
                <span className="coche-or"><Icone nom="route" taille={15} /></span>
                <span className="truncate">
                  {f.departVille} → {f.arriveeVille} · <span className="font-semibold">{distanceKm} km</span> par la route
                </span>
              </div>
            )}
          </Bloc>

          <Bloc icone="calendrier" titre="Votre date" sous="Une date, une période, ou vos propres mots." delai={140}>
            <ChampPeriode
              label="Quand souhaitez-vous déménager ?"
              mode={f.dateMode}
              valeur={f.dateMode === "date" ? f.date : f.periode}
              onChange={(dateMode, v) =>
                set(dateMode === "date" ? { dateMode, date: v, periode: "" } : { dateMode, date: "", periode: v })
              }
              exemple="Courant mars, entre le 10 et le 20 avril, avant l'été…"
            />
          </Bloc>

          <Bloc icone="carton" titre="Votre volume" sous="Saisissez-le, ou laissez vos photos l'estimer." delai={210}>
            <Field groupe label="Volume à déménager *">
              <div className="sm:max-w-md">
                <Choice plein options={[["explicit", "Je connais mon volume"], ["ai", "J'envoie des photos"]]} value={f.volMode} onChange={(v) => set({ volMode: v as "explicit" | "ai" })} />
              </div>
            </Field>
            <div key={f.volMode} className="animate-step-in mt-4">
              {f.volMode === "explicit" ? (
                <SaisieVolume valeur={f.explicitVolume} onChange={(explicitVolume) => set({ explicitVolume })} />
              ) : (
                <PhotoAnalyzer library={library} photos={f.photos} onChange={(photos) => set({ photos })} />
              )}
            </div>
          </Bloc>
        </div>

        {error && <Erreur>{error}</Erreur>}
      </Cadre>
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
  const [trajet, setTrajet] = useState<{ cle: string; km: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalVolume = useMemo(() => computeVolume(form), [form]);

  // La distance appartient à un couple d'adresses : dès qu'une adresse change,
  // la clé ne correspond plus et l'ancienne distance cesse de s'afficher.
  const d = form.depart, a = form.arrivee;
  const cleTrajet =
    d.lat != null && d.lon != null && a.lat != null && a.lon != null
      ? `${d.lat},${d.lon}|${a.lat},${a.lon}`
      : null;
  useEffect(() => {
    if (!cleTrajet) return;
    const [dep, arr] = cleTrajet.split("|").map((c) => {
      const [lat, lon] = c.split(",").map(Number);
      return { lat, lon };
    });
    let cancelled = false;
    roadDistanceKm(dep, arr).then((km) => {
      if (!cancelled) setTrajet({ cle: cleTrajet, km });
    });
    return () => { cancelled = true; };
  }, [cleTrajet]);
  const distanceKm = trajet && trajet.cle === cleTrajet ? trajet.km : null;

  // À chaque changement d'étape, on remonte en haut de la page.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  // Le raccourci de démonstration, déclenché par ?demo=1. Différé d'un tour :
  // le premier rendu doit être le même côté serveur et côté navigateur.
  useEffect(() => {
    const id = setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
      setForm(DEMO);
      setStep(STEPS.length - 1);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const manquant = manque(step, form);
  const annonce = manquant ? null : annonceDefauts(step, form);

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
      <InstantResult requestId={done} volume={totalVolume} count={doneCount}
        onNewQuote={() => { setDone(null); setDoneCount(1); setForm(initial); setStep(0); setTrajet(null); }}
      />
    ) : (
      <SuccessScreen id={done} volume={totalVolume} count={doneCount} />
    );
  }

  const entete = HEADERS[step];
  const derniere = step === STEPS.length - 1;

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
      <Cadre
        panneau={
          <BrandPanel
            milieu={<Frise step={step} onAller={setStep} />}
            recap={[
              ["Trajet", trajetLisible(form.depart.ville, form.arrivee.ville)],
              ["Distance", distanceKm != null ? `${distanceKm} km` : null],
              ["Formule", nomFormule(form.prestations)],
              ["Volume", totalVolume != null ? `${totalVolume} m³` : null],
            ]}
          />
        }
        etiquette={`Étape ${step + 1} / ${STEPS.length} · ${STEPS[step]}`}
        progression={((step + 1) / STEPS.length) * 100}
        onBack={onBack}
        large={step === 3}
        barre={
          <>
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || submitting}
              aria-label="Étape précédente"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] font-medium text-ink-mid transition hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-0 sm:px-5"
            >
              <Icone nom="gauche" taille={15} trait={2.2} />
              <span className="hidden sm:inline">Retour</span>
            </button>
            <div className="min-w-0 flex-1">
              {manquant ? (
                <Manque>{manquant}</Manque>
              ) : annonce ? (
                <Manque>{annonce}</Manque>
              ) : (
                <div className="hidden items-center gap-3 sm:flex">
                  <div className="flex items-center gap-1.5">
                    {STEPS.map((label, i) => (
                      <span
                        key={label}
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          i === step ? "w-6 bg-ink" : i < step ? "w-1.5 bg-brand-mid" : "w-1.5 bg-line-strong"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[12.5px] text-ink-soft">
                    Étape {step + 1} sur {STEPS.length}
                  </span>
                </div>
              )}
            </div>
            {derniere ? (
              <Bouton onClick={submit} disabled={submitting}>{submitting ? "Envoi…" : "Envoyer ma demande"}</Bouton>
            ) : (
              <Bouton
                onClick={() => {
                  // Les questions laissées sans réponse prennent leur valeur par défaut.
                  setForm((f) => ({ ...f, ...defauts(step, f) }));
                  setStep((s) => s + 1);
                }}
                disabled={manquant !== null}
              >
                Continuer
              </Bouton>
            )}
          </>
        }
      >
        <div key={step}>
          <Titre
            pastille={step + 1}
            texte={`Étape ${step + 1} sur ${STEPS.length}`}
            eyebrow={entete.eyebrow}
            avant={entete.avant}
            accent={entete.accent}
            apres={entete.apres}
            sub={entete.sub}
          />
          {step === 0 && <VousStep form={form} patch={patch} />}
          {step === 1 && <AddressStep which="depart" form={form} patch={patch} />}
          {step === 2 && <AddressStep which="arrivee" form={form} patch={patch} />}
          {step === 3 && <ChoixFormule value={form.prestations} onChange={(prestations) => patch({ prestations })} />}
          {step === 4 && <EmballageStep form={form} patch={patch} />}
          {step === 5 && <VolumeStep form={form} patch={patch} library={library} />}
          {step === 6 && <CommentairesStep form={form} patch={patch} volume={totalVolume} onModifier={setStep} />}
        </div>

        {error && <Erreur>{error}</Erreur>}
      </Cadre>
    </>
  );
}

/* ============================ Étapes ============================ */

type StepProps = { form: FormState; patch: (p: Partial<FormState>) => void };

function VousStep({ form, patch }: StepProps) {
  const entreprise = form.type_client === "entreprise";
  return (
    <div className="space-y-5">
      <Bloc icone="user" titre="Vos coordonnées" sous="Pour vous envoyer l'estimation et vous rappeler.">
        <div className="space-y-5">
          <Field groupe label="Vous êtes *">
            <div className="sm:max-w-xs">
              <Choice plein options={[["particulier", "Particulier"], ["entreprise", "Entreprise"]]} value={form.type_client} onChange={(v) => patch({ type_client: v as FormState["type_client"] })} />
            </div>
          </Field>
          {entreprise && (
            <div className="animate-step-in">
              <Field label="Raison sociale *">
                <TextInput icone="immeuble" value={form.societe} onChange={(e) => patch({ societe: e.target.value })} placeholder="Transports Dubois SARL" autoComplete="organization" />
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={entreprise ? "Interlocuteur" : "Prénom"} hint={entreprise ? "facultatif" : undefined}>
              <TextInput icone="user" value={form.prenom} onChange={(e) => patch({ prenom: e.target.value })} placeholder="Camille" autoComplete="given-name" />
            </Field>
            <Field label={entreprise ? "Nom de l'interlocuteur" : "Nom *"} hint={entreprise ? "facultatif" : undefined}>
              <TextInput value={form.nom} onChange={(e) => patch({ nom: e.target.value })} placeholder="Durand" autoComplete="family-name" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone *"><TextInput icone="tel" type="tel" value={form.tel} onChange={(e) => patch({ tel: e.target.value })} placeholder="06 12 34 56 78" autoComplete="tel" /></Field>
            <Field label="E-mail *"><TextInput icone="mail" type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="camille.durand@email.fr" autoComplete="email" /></Field>
          </div>
        </div>
      </Bloc>

      <Bloc icone="calendrier" titre="Votre projet" sous="Le cadre de votre déménagement, et la période visée." delai={70}>
        <div>
          <Ligne label="Déménagement complet ou partiel ?">
            <Choice options={[["complet", "Complet"], ["partiel", "Partiel"]]} value={form.demenagement} onChange={(v) => patch({ demenagement: v as FormState["demenagement"] })} />
          </Ligne>
          <Ligne label="S'agit-il d'une mutation professionnelle ?">
            <YesNo value={form.mutation_pro} onChange={(v) => patch({ mutation_pro: v })} />
          </Ligne>
          {!entreprise && form.mutation_pro === "oui" && (
            <div className="animate-step-in pb-4">
              <Field label="De quelle société s'agit-il ?">
                <TextInput icone="immeuble" value={form.societe} onChange={(e) => patch({ societe: e.target.value })} placeholder="Nom de la société" />
              </Field>
            </div>
          )}
        </div>
        <div className="mt-2 border-t border-line pt-5">
          <ChampPeriode
            label="Période souhaitée"
            mode={form.periode_mode}
            valeur={form.periode}
            onChange={(periode_mode, periode) => patch({ periode_mode, periode })}
            exemple="Entre le 15 et le 30 novembre, dès que la vente est signée…"
          />
        </div>
      </Bloc>

      <Bloc icone="bouclier" titre="Votre garantie dommages" sous="La valeur de votre mobilier, et le niveau de garantie souhaité." delai={140}>
        <div className="space-y-6">
          <Field groupe label="Estimation de la valeur du mobilier" hint="facultatif">
            <div className="flex flex-wrap gap-2">
              {VALEURS.map((v) => <Pill key={v} active={form.valeur_mobilier === v} onClick={() => patch({ valeur_mobilier: v })}>{v}</Pill>)}
            </div>
          </Field>
          <Field groupe label="Garantie dommages souhaitée">
            <div className="grid gap-3 sm:grid-cols-2">
              {GARANTIES.map((g) => (
                <CarteChoix
                  key={g.key}
                  active={form.assurance === g.key}
                  onClick={() => patch({ assurance: g.key })}
                  icone={g.key === "luxe" ? "couronne" : "bouclier"}
                  titre={g.titre}
                  texte={g.texte}
                  badge={g.badge}
                />
              ))}
            </div>
          </Field>
        </div>
      </Bloc>

      <Bloc icone="poids" titre="Vos objets lourds" sous="Ils demandent une manutention à part : mieux vaut les annoncer." delai={210}>
        <div>
          <Ligne
            label="Avez-vous des objets de 80 à 150 kg ?"
            aide="Aquarium de plus de 150 litres, frigo américain, juke-box, flipper, cave à vin, petit coffre-fort, buffet en bois massif."
          >
            <YesNo value={form.articles_lourds} onChange={(v) => patch({ articles_lourds: v })} />
          </Ligne>
          {form.articles_lourds === "oui" && (
            <div className="animate-step-in mb-4 rounded-[20px] bg-subtle p-4">
              <ChargesLourdes
                lignes={form.charges_lourdes}
                onChange={(charges_lourdes) => patch({ charges_lourdes })}
              />
            </div>
          )}
          <Ligne
            label="Avez-vous un piano ?"
            aide="Plus de 150 kg, il demande une manutention à part — les pianos électriques, légers, n'en font pas partie."
          >
            <YesNo value={form.piano} onChange={(v) => patch({ piano: v })} />
          </Ligne>
        </div>
      </Bloc>
    </div>
  );
}

function AddressStep({ which, form, patch }: StepProps & { which: "depart" | "arrivee" }) {
  const a = form[which];
  const set = (p: Partial<Address>) => patch({ [which]: { ...a, ...p } } as Partial<FormState>);
  const depart = which === "depart";
  return (
    <div className="space-y-5">
      <Bloc
        icone={depart ? "pin" : "maison"}
        titre={depart ? "L'adresse de départ" : "L'adresse d'arrivée"}
        sous="Tapez, puis choisissez dans la liste : l'adresse se complète et la distance se calcule."
      >
        <div className="space-y-5">
          <div>
            <Field label={`Adresse ${depart ? "de départ" : "d'arrivée"}`}>
              <AddressInput kind="address" value={a.adresse} placeholder="12 rue de la République, Paris"
                onChange={(v) => set({ adresse: v, lat: undefined, lon: undefined })}
                onSelect={(p) => set({ adresse: p.label, ville: p.ville, code_postal: p.code_postal, lat: p.lat, lon: p.lon })} />
            </Field>
            <p className="mt-2 flex gap-2 text-[12.5px] leading-snug text-ink-soft">
              <Icone nom="info" taille={14} className="mt-px shrink-0" />
              <span>
                Adresse introuvable dans la liste ? Saisissez-la telle quelle, puis{" "}
                <span className="font-medium text-ink">choisissez au moins la ville ci-dessous</span> — cela suffit pour calculer la distance.
              </span>
            </p>
          </div>
          <Field label="Complément d'adresse" hint="facultatif">
            <TextInput value={a.complement} onChange={(e) => set({ complement: e.target.value })} placeholder="Bâtiment, appartement…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="Code postal"><TextInput value={a.code_postal} onChange={(e) => set({ code_postal: e.target.value })} placeholder="75011" inputMode="numeric" /></Field>
            <Field label="Ville *" hint="choisissez dans la liste">
              <AddressInput kind="municipality" value={a.ville} placeholder="Paris"
                /* Les coordonnées repartent à zéro dès qu'on retape : sans ça, une
                   ville saisie à la main gardait celles de l'adresse précédente, et
                   la distance comme la carte restaient sur l'ancienne commune. */
                onChange={(v) => set({ ville: v, lat: undefined, lon: undefined })}
                onSelect={(p) => set({ ville: p.ville, code_postal: p.code_postal, lat: p.lat, lon: p.lon })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="État / Province / Région"><TextInput value={a.region} onChange={(e) => set({ region: e.target.value })} placeholder="Île-de-France" /></Field>
            <Field label="Pays">
              <Selecteur value={a.pays} onChange={(e) => set({ pays: e.target.value })}>
                {PAYS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Selecteur>
            </Field>
          </div>
        </div>
      </Bloc>

      <Bloc icone="immeuble" titre="Accès au logement" sous="Étage, ascenseur, escalier : c'est ce qui fait le temps de manutention." delai={70}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Étage" hint="0 = RDC"><TextInput type="number" min={0} value={a.etage} onChange={(e) => set({ etage: e.target.value })} placeholder="3" /></Field>
          <Field label="Surface habitable"><TextInput type="number" min={0} unite="m²" value={a.surface} onChange={(e) => set({ surface: e.target.value })} placeholder="65" /></Field>
        </div>
        {/* Toutes les questions restent posées. Les masquer tant qu'un étage
            n'était pas saisi donnait un bloc à moitié vide, et le client ne
            savait pas ce qu'on attendait de lui. */}
        <div className="mt-3">
          <Ligne label="Duplex ?"><YesNo value={a.duplex} onChange={(v) => set({ duplex: v })} /></Ligne>
          <Ligne label="Ascenseur ?"><YesNo value={a.ascenseur} onChange={(v) => set({ ascenseur: v })} /></Ligne>
          {a.ascenseur === "oui" && (
            <div className="animate-step-in mb-4 space-y-1 rounded-[20px] bg-subtle p-4">
              <Field label="Taille de l'ascenseur" hint="nombre de personnes">
                <TextInput type="number" min={0} unite="pers." value={a.taille_ascenseur} onChange={(e) => set({ taille_ascenseur: e.target.value })} placeholder="4" />
              </Field>
              <Ligne nue label="Vos meubles passent-ils par l'ascenseur ?"><YesNo value={a.passage_ascenseur} onChange={(v) => set({ passage_ascenseur: v })} /></Ligne>
            </div>
          )}
          <Ligne label="Vos meubles passent-ils par l'escalier ?"><YesNo value={a.passage_escalier} onChange={(v) => set({ passage_escalier: v })} /></Ligne>
        </div>
      </Bloc>

      <Bloc icone="camion" titre="Accès camion" sous="Où le camion peut se garer, et à quelle distance de votre porte." delai={140}>
        <Field label="Distance entre le stationnement du camion et la porte d'entrée">
          <div className="sm:max-w-[220px]">
            <TextInput type="number" min={0} unite="m" value={a.portage_m} onChange={(e) => set({ portage_m: e.target.value })} placeholder="15" />
          </div>
        </Field>
        <div className="mt-3">
          <Ligne label="Difficultés d'accès en camion poids lourd ?"><YesNo value={a.difficulte_acces} onChange={(v) => set({ difficulte_acces: v })} /></Ligne>
          {a.difficulte_acces === "oui" && (
            <div className="animate-step-in pb-4">
              <Field label="Type de difficulté d'accès">
                <TextInput value={a.type_difficulte} onChange={(e) => set({ type_difficulte: e.target.value })} placeholder="Rue étroite, sens interdit, hauteur limitée…" />
              </Field>
            </div>
          )}
          <Ligne label="Autorisation de stationnement nécessaire ?"><YesNo value={a.stationnement} onChange={(v) => set({ stationnement: v })} /></Ligne>
          {a.stationnement === "oui" && (
            <p className="animate-step-in flex gap-2.5 rounded-[18px] bg-brand-soft px-4 py-3 text-[12.5px] leading-snug text-brand-ink">
              <Icone nom="info" taille={15} className="mt-px shrink-0" />
              <span>
                Des frais de stationnement peuvent être appliqués par votre mairie. Le cas échéant,
                ils vous seront refacturés à l&apos;euro près, sur justificatif.
              </span>
            </p>
          )}
        </div>
      </Bloc>
    </div>
  );
}

/**
 * Les meubles à démonter : trois cartes bâties sur le même gabarit.
 *
 * Le titre en haut, les deux réponses dessous, la précision en dernier. Un
 * libellé plus long que les autres — celui des meubles en kit — ne peut donc
 * plus faire passer ses réponses à la ligne quand celles des autres restent
 * à droite.
 */
function EmballageStep({ form, patch }: StepProps) {
  const e = form.emballage;
  return (
    <div className="space-y-5">
      {MEUBLES.map((m, i) => {
        const choisir = (v: Demontage) => patch({ emballage: { ...e, [m.key]: e[m.key] === v ? "" : v } });
        return (
          <Bloc key={m.key} icone={m.icone} titre={m.titre} sous={m.sous} delai={i * 70}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Option
                active={e[m.key] === "possible"}
                onClick={() => choisir("possible")}
                titre="Démontage possible"
                texte="Si cela facilite le transport."
              />
              <Option
                active={e[m.key] === "imperatif"}
                onClick={() => choisir("imperatif")}
                titre="Démontage impératif"
                texte="Ils ne passent pas autrement."
              />
            </div>
            <div className="mt-4">
              <Field label="Précisions" hint="facultatif">
                <TextInput value={e[m.precKey]} onChange={(ev) => patch({ emballage: { ...e, [m.precKey]: ev.target.value } })} placeholder={m.exemple} />
              </Field>
            </div>
          </Bloc>
        );
      })}
    </div>
  );
}

function CommentairesStep({
  form,
  patch,
  volume,
  onModifier,
}: StepProps & { volume: number | null; onModifier: (step: number) => void }) {
  return (
    <div className="space-y-5">
      <RecapCard form={form} volume={volume} onModifier={onModifier} />
      <Bloc icone="message" titre="Votre message" sous="Précisions, contraintes, objets particuliers : tout ce qui nous aidera." delai={120}>
        <Field label="Message" hint="facultatif">
          <Zone value={form.commentaire} onChange={(e) => patch({ commentaire: e.target.value })} rows={5}
            placeholder="Précisions, contraintes, objets particuliers…" />
        </Field>
      </Bloc>
    </div>
  );
}

/* ---------- Volume (3 modes) ---------- */

const MODES_VOLUME: { key: VolumeMode; icone: NomIcone; titre: string; texte: string }[] = [
  { key: "explicit", icone: "carton", titre: "Je connais mon volume", texte: "Vous saisissez le nombre de mètres cubes." },
  { key: "list", icone: "liste", titre: "Je liste mes meubles", texte: "Meuble par meuble, le volume se calcule." },
  { key: "ai", icone: "photo", titre: "J'envoie des photos", texte: "L'analyse de vos photos estime le volume." },
];

function VolumeStep({ form, patch, library }: StepProps & { library: LibraryPhoto[] }) {
  const mode = form.volumeMode;
  const actif = MODES_VOLUME.find((m) => m.key === mode) ?? MODES_VOLUME[0];
  return (
    <div className="space-y-5">
      <div className="reveal grid gap-3 sm:grid-cols-3">
        {MODES_VOLUME.map((m) => (
          <CarteChoix
            key={m.key}
            active={mode === m.key}
            onClick={() => patch({ volumeMode: m.key })}
            icone={m.icone}
            titre={m.titre}
            texte={m.texte}
          />
        ))}
      </div>
      <div key={mode}>
        <Bloc icone={actif.icone} titre={actif.titre} sous={actif.texte} delai={70}>
          {mode === "explicit" && <SaisieVolume valeur={form.explicitVolume} onChange={(explicitVolume) => patch({ explicitVolume })} />}
          {mode === "list" && <ListMode form={form} patch={patch} />}
          {mode === "ai" && <PhotoAnalyzer library={library} photos={form.photos} onChange={(photos) => patch({ photos })} />}
        </Bloc>
      </div>
    </div>
  );
}

/** Le volume saisi à la main, avec des repères par type de logement. */
function SaisieVolume({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-5">
      <Field label="Volume estimé">
        <div className="sm:max-w-[260px]">
          <TextInput type="number" min={0} step="0.5" unite="m³" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder="25" />
        </div>
      </Field>
      <Field groupe label="Repères par logement" hint="un clic remplit le champ">
        <div className="flex flex-wrap gap-2">
          {LOGEMENT_HINTS.map((h) => (
            <Pill key={h.label} active={valeur === String(h.volume)} onClick={() => onChange(String(h.volume))}>
              {h.label}
              <span className="ml-1.5 opacity-60">~{h.volume} m³</span>
            </Pill>
          ))}
        </div>
      </Field>
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
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1b1a18] px-1 text-[10px] font-bold text-brand">{n}</span>
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
                <div className="text-[12px] text-ink-soft">{it.volume_unitaire_m3} m³ l&apos;unité</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setQty(i, it.quantite - 1)} aria-label={`Retirer un ${it.label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">−</button>
                <span className="w-7 text-center text-[14px] font-semibold tnum">{it.quantite}</span>
                <button type="button" onClick={() => setQty(i, it.quantite + 1)} aria-label={`Ajouter un ${it.label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">+</button>
              </div>
              <div className="w-16 text-right text-[13.5px] tnum">{(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³</div>
            </div>
          ))}
          <div className="flex items-center justify-between bg-subtle px-4 py-3.5">
            <span className="text-[14px] font-semibold">Total</span>
            <span className="font-serif text-[20px] tnum">{total.toFixed(1)} m³</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Les objets de 80 à 150 kg, un par ligne.
 *
 * Céline : « si le client a un frigo à 100 kg et un billard à 300 kg, on doit
 * pouvoir ajouter plusieurs fois le supplément de charges lourdes ». Un champ
 * libre ne le permettait pas : chaque ligne vaut désormais un supplément.
 */
function ChargesLourdes({
  lignes,
  onChange,
}: {
  lignes: { label: string; poids: string }[];
  onChange: (l: { label: string; poids: string }[]) => void;
}) {
  const liste = lignes.length ? lignes : [{ label: "", poids: "" }];
  const set = (i: number, champ: "label" | "poids", v: string) =>
    onChange(liste.map((l, n) => (n === i ? { ...l, [champ]: v } : l)));

  return (
    <Field groupe label="Lesquels, et quel poids ?" hint="un objet par ligne">
      <div className="space-y-2">
        {liste.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_112px_44px] items-center gap-2">
            <TextInput
              value={l.label}
              onChange={(e) => set(i, "label", e.target.value)}
              placeholder="Billard"
              aria-label="Objet"
            />
            <TextInput
              value={l.poids}
              onChange={(e) => set(i, "poids", e.target.value)}
              placeholder="120 kg"
              aria-label="Poids"
            />
            {liste.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(liste.filter((_, n) => n !== i))}
                title="Retirer cette ligne"
                aria-label="Retirer cette ligne"
                className="flex h-12 items-center justify-center rounded-2xl border border-line-strong text-ink-soft transition hover:border-danger hover:text-danger active:scale-95"
              >
                <Icone nom="croix" taille={15} trait={2.2} />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...liste, { label: "", poids: "" }])}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-ink-soft/50 px-4 text-[13px] font-medium text-ink-mid transition hover:border-ink hover:text-ink active:scale-95"
      >
        <Icone nom="plus" taille={14} trait={2.4} />
        Ajouter un objet
      </button>
    </Field>
  );
}

/** Les périodes qu'un client propose de lui-même, dans ses mots. */
const PERIODES = [
  "Dès que possible",
  "Ce mois-ci",
  "Le mois prochain",
  "Dans 2 à 3 mois",
  "Dans plus de 3 mois",
  "Je ne sais pas encore",
];

/**
 * Quand le client veut déménager.
 *
 * Trois façons de répondre, parce qu'un déménagement se cale rarement sur une
 * date : certains en ont une, d'autres une fourchette, d'autres une condition
 * (« après la vente »). Forcer le calendrier faisait saisir n'importe quoi.
 */
function ChampPeriode({
  label,
  mode,
  valeur,
  onChange,
  exemple,
}: {
  label: string;
  mode: PeriodeMode;
  valeur: string;
  onChange: (mode: PeriodeMode, valeur: string) => void;
  exemple: string;
}) {
  return (
    <Field groupe label={label}>
      <Choice
        plein
        options={[
          ["date", "Une date précise"],
          ["suggestion", "Une période"],
          ["libre", "Je précise moi-même"],
        ]}
        value={mode}
        onChange={(v) => onChange(v as PeriodeMode, "")}
      />
      <div key={mode} className="animate-step-in mt-3">
        {mode === "date" && (
          <div className="sm:max-w-[260px]">
            <TextInput type="date" value={valeur} onChange={(e) => onChange("date", e.target.value)} aria-label="Date souhaitée" />
          </div>
        )}
        {mode === "suggestion" && (
          <div className="flex flex-wrap gap-2">
            {PERIODES.map((p) => (
              <Pill key={p} active={valeur === p} onClick={() => onChange("suggestion", p)}>
                {p}
              </Pill>
            ))}
          </div>
        )}
        {mode === "libre" && (
          <TextInput
            value={valeur}
            onChange={(e) => onChange("libre", e.target.value)}
            placeholder={exemple}
            aria-label="Période souhaitée"
          />
        )}
      </div>
    </Field>
  );
}

/* ---------- Récap + succès ---------- */

/**
 * L'adresse en une ligne, sans répéter la ville.
 *
 * L'autocomplétion renvoie un libellé qui contient déjà le code postal et la
 * commune : les recoller derrière affichait « 12 rue des Lilas, 69003 Lyon,
 * 69003 Lyon ».
 */
function adresseLisible(a: Address) {
  const fin = [a.code_postal, a.ville].filter(Boolean).join(" ");
  const base = a.adresse.trim();
  if (!base) return fin || "non renseignée";
  return fin && !aplatirTexte(base).includes(aplatirTexte(fin)) ? `${base}, ${fin}` : base;
}

function aplatirTexte(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Ce qui pèse sur la manutention : étage, ascenseur, portage, accès camion. */
function accesLisible(a: Address) {
  const bouts: string[] = [];
  const etage = parseInt(a.etage, 10);
  if (!isNaN(etage)) bouts.push(etage === 0 ? "rez-de-chaussée" : `${etage}${etage === 1 ? "er" : "e"} étage`);
  if (a.duplex === "oui") bouts.push("duplex");
  if (!isNaN(etage) && etage > 0) bouts.push(a.ascenseur === "oui" ? "avec ascenseur" : "sans ascenseur");
  const portage = parseInt(a.portage_m, 10);
  if (!isNaN(portage) && portage > 0) bouts.push(`portage ${portage} m`);
  if (a.difficulte_acces === "oui") bouts.push(`accès difficile${a.type_difficulte ? ` (${a.type_difficulte})` : ""}`);
  if (a.stationnement === "oui") bouts.push("autorisation de stationnement");
  return bouts.length ? bouts.join(" · ") : "rien de particulier";
}

/** Les objets lourds déclarés, ligne à ligne, et le piano. */
function lourdsLisible(form: FormState) {
  const bouts = form.charges_lourdes
    .filter((l) => l.label.trim())
    .map((l) => (l.poids.trim() ? `${l.label.trim()} (${l.poids.trim()})` : l.label.trim()));
  if (form.piano === "oui") bouts.push("piano");
  return bouts.length ? bouts.join(" · ") : "aucun";
}

function garantieLisible(form: FormState) {
  const g = GARANTIES.find((x) => x.key === form.assurance);
  if (!g) return "à définir";
  const valeur = form.valeur_mobilier ? ` · mobilier déclaré ${form.valeur_mobilier}` : "";
  return `${g.titre}${valeur}`;
}

/** « 2026-11-15 » devient « 15 novembre 2026 ». */
function dateLisible(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function periodeLisible(form: FormState) {
  if (!form.periode) return "à définir";
  return form.periode_mode === "date" ? dateLisible(form.periode) : form.periode;
}

function trajetLisible(depart: string, arrivee: string) {
  const d = depart.trim(), a = arrivee.trim();
  if (d && a) return `${d} → ${a}`;
  return d || a || null;
}

function demontageLisible(form: FormState): [string, string][] {
  const lignes = MEUBLES.filter((m) => form.emballage[m.key] || form.emballage[m.precKey].trim()).map((m): [string, string] => {
    const choix = form.emballage[m.key];
    const precision = form.emballage[m.precKey].trim();
    const etat = choix === "imperatif" ? "démontage impératif" : choix === "possible" ? "démontage possible" : "";
    return [m.titre, [etat, precision].filter(Boolean).join(" — ")];
  });
  return lignes.length ? lignes : [["Meubles", "rien de signalé"]];
}

const METHODE_VOLUME: Record<VolumeMode, string> = {
  explicit: "volume saisi",
  list: "liste de meubles",
  ai: "analyse de photos",
};

/**
 * La demande relue avant l'envoi, rangée par étape. Chaque groupe renvoie à
 * la sienne : corriger une adresse ne demande pas de remonter tout le parcours.
 */
function RecapCard({
  form,
  volume,
  onModifier,
}: {
  form: FormState;
  volume: number | null;
  onModifier: (step: number) => void;
}) {
  const presta = LIGNES_CARTE.filter((p) => form.prestations[p.key] === "bailly").map((p) => p.label).join(", ") || "aucune";
  const contact = [[form.prenom, form.nom].filter(Boolean).join(" "), form.email, form.tel].filter(Boolean).join(" · ");
  const groupes: { step: number; icone: NomIcone; titre: string; lignes: [string, string][] }[] = [
    {
      step: 0,
      icone: "user",
      titre: "Vous",
      lignes: [
        ["Client", contact || "non renseigné"],
        ...(form.societe ? ([["Société", form.societe]] as [string, string][]) : []),
        ["Garantie", garantieLisible(form)],
        ["Objets lourds", lourdsLisible(form)],
        ["Période", periodeLisible(form)],
      ],
    },
    { step: 1, icone: "pin", titre: "Départ", lignes: [["Adresse", adresseLisible(form.depart)], ["Accès", accesLisible(form.depart)]] },
    { step: 2, icone: "maison", titre: "Arrivée", lignes: [["Adresse", adresseLisible(form.arrivee)], ["Accès", accesLisible(form.arrivee)]] },
    { step: 3, icone: "bouclier", titre: "Prestations", lignes: [["Formule", nomFormule(form.prestations) ?? "à définir"], ["Prise en charge Bailly", presta]] },
    { step: 4, icone: "cle", titre: "Démontage", lignes: demontageLisible(form) },
    {
      step: 5,
      icone: "carton",
      titre: "Inventaire",
      lignes: [["Volume", volume != null ? `${volume} m³ (${METHODE_VOLUME[form.volumeMode]})` : "non renseigné"]],
    },
  ];
  return (
    <div className="bloc reveal overflow-hidden rounded-[26px] border border-line bg-card">
      {groupes.map((g) => (
        <div
          key={g.titre}
          className="grid gap-x-6 gap-y-3 border-b border-line px-5 py-5 last:border-0 sm:grid-cols-[170px_minmax(0,1fr)] sm:px-7"
        >
          <div className="flex items-center justify-between gap-3 sm:block">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
                <Icone nom={g.icone} taille={16} />
              </span>
              <span className="text-[14.5px] font-semibold">{g.titre}</span>
            </div>
            <button
              type="button"
              onClick={() => onModifier(g.step)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-ink transition hover:text-ink sm:mt-2.5"
            >
              <Icone nom="crayon" taille={12} />
              Modifier
            </button>
          </div>
          <dl className="space-y-2">
            {g.lignes.map(([cle, valeur]) => (
              <div key={cle} className="grid gap-x-4 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)]">
                <dt className="text-ink-soft">{cle}</dt>
                <dd className="text-ink">{valeur}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function SuccessScreen({ id, volume, count = 1 }: { id: string; volume: number | null; count?: number }) {
  return (
    <div className="grain relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#1b1a18] px-6 py-16">
      <Image src="/login-interieur.jpg" alt="" fill priority sizes="100vw" className="ken-burns object-cover" />
      <div className="absolute inset-0 bg-[#1b1a18]/70" />
      <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/85 via-[#1b1a18]/40 to-[#1b1a18]/95" />
      <div className="halo drift absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2" style={{ "--halo": "rgba(245,208,51,0.2)" } as CSSProperties} />

      <div className="relative z-10 w-full max-w-lg text-center">
        <div className="reveal mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand text-[#1b1a18] shadow-[0_0_0_10px_rgba(245,208,51,0.18)]">
          <Icone nom="check" taille={28} trait={3} className="coche-pop" />
        </div>
        <h1 className="font-serif reveal mt-7 text-balance text-[40px] text-white sm:text-[52px]" style={delai(80)}>
          {count > 1 ? `${count} demandes envoyées` : "Demande envoyée"}
        </h1>
        <p className="reveal mx-auto mt-4 max-w-[44ch] text-[15.5px] leading-relaxed text-white/72" style={delai(160)}>
          {count > 1
            ? `Merci ! Nos experts étudient vos ${count} scénarios et vous adressent un devis pour chacun par e-mail.`
            : `Merci ! Nos experts analysent votre projet${volume != null ? ` (~${volume} m³)` : ""} et reviennent vers vous très vite.`}
        </p>
        <div className="reveal mt-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[13px] text-white/70" style={delai(240)}>
          Référence <span className="font-mono text-white">{id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================ Helpers ============================ */

function computeVolume(form: FormState): number | null {
  if (form.volumeMode === "explicit") { const v = parseFloat(form.explicitVolume); return isNaN(v) ? null : Math.round(v * 100) / 100; }
  if (form.volumeMode === "list") { if (form.items.length === 0) return null; return Math.round(form.items.reduce((s, it) => s + it.quantite * it.volume_unitaire_m3, 0) * 100) / 100; }
  if (form.photos.length === 0) return null;
  return volumePhotos(form.photos);
}

/** Ce qu'il manque pour passer à l'étape suivante — ou rien. */
function manque(step: number, form: FormState): string | null {
  switch (step) {
    case 0: {
      const nomme = (form.prenom.trim() || form.nom.trim()).length > 0;
      if (form.type_client === "entreprise") {
        if (!form.societe.trim() && !nomme) return "Indiquez la raison sociale";
      } else if (!nomme) return "Indiquez votre nom";
      if (!form.tel.trim()) return "Indiquez votre téléphone";
      if (!/.+@.+\..+/.test(form.email)) return "Indiquez un e-mail valide";
      return null;
    }
    // La ville est le minimum : sans elle, ni distance ni prix.
    case 1:
      return form.depart.ville.trim() ? null : "Indiquez la ville de départ";
    case 2:
      return form.arrivee.ville.trim() ? null : "Indiquez la ville d'arrivée";
    case 5:
      return computeVolume(form) != null ? null : "Renseignez le volume à déménager";
    default:
      return null;
  }
}

/** La période retenue quand le client n'en donne pas. */
const PERIODE_PAR_DEFAUT = "Je ne sais pas encore";

/**
 * Les réponses retenues pour le client quand il passe une question.
 *
 * Le minimum est obligatoire — qui il est, d'où il part, où il va, quel
 * volume. Tout le reste est facultatif : une question laissée sans réponse
 * prend, au moment de continuer, sa valeur la plus courante. Le client
 * avance sans être bloqué, et le récapitulatif lui montre ce qui a été retenu.
 */
function defauts(step: number, form: FormState): Partial<FormState> {
  switch (step) {
    case 0: {
      const p: Partial<FormState> = {};
      if (!form.demenagement) p.demenagement = "complet";
      if (!form.mutation_pro) p.mutation_pro = "non";
      if (!form.assurance) p.assurance = "standard";
      if (!form.articles_lourds) p.articles_lourds = "non";
      if (!form.piano) p.piano = "non";
      if (!form.periode) {
        p.periode_mode = "suggestion";
        p.periode = PERIODE_PAR_DEFAUT;
      }
      return p;
    }
    case 1:
    case 2: {
      const cle = step === 1 ? "depart" : "arrivee";
      const a = form[cle];
      const d: Partial<Address> = {};
      if (!a.etage) d.etage = "0";
      if (!a.duplex) d.duplex = "non";
      if (!a.ascenseur) d.ascenseur = "non";
      if (a.ascenseur === "oui" && !a.passage_ascenseur) d.passage_ascenseur = "oui";
      if (!a.passage_escalier) d.passage_escalier = "oui";
      if (!a.difficulte_acces) d.difficulte_acces = "non";
      if (!a.stationnement) d.stationnement = "non";
      return Object.keys(d).length ? ({ [cle]: { ...a, ...d } } as Partial<FormState>) : {};
    }
    case 3:
      return formuleRetenue(form.prestations) === null ? { prestations: { ...PRESTATIONS_PAR_DEFAUT } } : {};
    default:
      return {};
  }
}

/** Ce que la barre du bas annonce quand des réponses vont être complétées. */
function annonceDefauts(step: number, form: FormState): string | null {
  const patch = defauts(step, form);
  if (step === 3) return patch.prestations ? "Sans choix de votre part, la formule Standard sera retenue." : null;
  let n = 0;
  if (step === 1 || step === 2) {
    const cle = step === 1 ? "depart" : "arrivee";
    const apres = patch[cle];
    if (apres) n = (Object.keys(apres) as (keyof Address)[]).filter((k) => apres[k] !== form[cle][k]).length;
  } else {
    n = Object.keys(patch).filter((k) => k !== "periode_mode").length;
  }
  if (n === 0) return null;
  return n === 1
    ? "1 question sans réponse : la valeur par défaut sera retenue."
    : `${n} questions sans réponse : les valeurs par défaut seront retenues.`;
}

function buildPayload(form: FormState) {
  const yn = (v: YN) => (v === "oui" ? true : v === "non" ? false : undefined);
  const toAddr = (a: Address) => ({
    adresse: a.adresse || undefined, code_postal: a.code_postal || undefined, ville: a.ville || undefined,
    etage: a.etage ? parseInt(a.etage, 10) : undefined, ascenseur: yn(a.ascenseur),
    surface: a.surface ? parseFloat(a.surface) : undefined, stationnement: yn(a.stationnement),
    portage_m: a.portage_m ? parseInt(a.portage_m, 10) : undefined,
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
  const bailly = LIGNES_CARTE.filter((p) => form.prestations[p.key] === "bailly").length;
  const formule = bailly >= 4 ? "luxe" : bailly >= 2 ? "standard" : "eco";

  return {
    // Une entreprise peut ne donner que sa raison sociale : elle tient lieu de nom.
    client: { nom: [form.prenom, form.nom].filter(Boolean).join(" ") || form.societe || form.email, email: form.email, tel: form.tel || undefined },
    depart: toAddr(form.depart), arrivee: toAddr(form.arrivee),
    date_souhaitee: form.periode_mode === "date" ? form.periode || undefined : undefined,
    flexibilite: form.periode_mode === "date" ? undefined : form.periode || undefined,
    formule, services, volume,
    type_client: form.type_client,
    assurance: form.assurance || undefined,
    societe: form.societe || undefined,
    mutation_pro: form.mutation_pro === "oui",
    valeur_mobilier: form.valeur_mobilier || undefined,
    articles_lourds: form.articles_lourds === "oui",
    charges_lourdes:
      form.articles_lourds === "oui"
        ? form.charges_lourdes.filter((l) => l.label.trim()).map((l) => ({ label: l.label.trim(), poids: l.poids.trim() || undefined }))
        : undefined,
    piano: form.piano === "oui",
    commentaire: form.commentaire || undefined,
    prestations: form.prestations as unknown as Record<string, string>,
    // tout le détail brut (adresses complètes, emballage, etc.) conservé
    details: { depart: form.depart, arrivee: form.arrivee, emballage: form.emballage, demenagement: form.demenagement } as unknown as Record<string, unknown>,
  };
}
