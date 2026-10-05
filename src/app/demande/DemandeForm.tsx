"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { BrandPanel, Bouton, Cadre, Enseigne, Erreur, Manque, Titre, delai, halo, type Marque } from "./cadre";
import { ListeMeubles, MODES_VOLUME, SaisieVolume, volumeDe, type ListItem, type VolumeMode } from "./volume";
import { messageFinDe, nomEnseigne, themeEspace, type EspacePublic, type QuestionCle } from "@/lib/espaces";

/* ============================ Types ============================ */

type YN = "oui" | "non" | "";
type Demontage = "possible" | "imperatif" | "";
type PeriodeMode = "date" | "suggestion" | "libre";

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

type EtapeCle = "vous" | "depart" | "arrivee" | "prestations" | "emballage" | "inventaire" | "commentaires";

/**
 * Les étapes du devis complet. Chacune a un nom — pas un numéro : un espace
 * pro peut en retirer (les prestations quand la formule est imposée, le
 * démontage), et « l'étape 4 » ne désigne alors plus la même chose.
 *
 * `sous` dit ce que l'étape demande, en trois mots ; `accent` est le mot du
 * titre que le dégradé met en avant.
 */
const ETAPES: { cle: EtapeCle; label: string; sous: string; eyebrow: string; avant: string; accent: string; apres: string; sub: string }[] = [
  { cle: "vous", label: "Vous", sous: "Coordonnées et projet", eyebrow: "Informations personnelles", avant: "Parlez-nous de ", accent: "vous", apres: "", sub: "Une question, un projet ? Nous vous accompagnons à chaque étape." },
  { cle: "depart", label: "Départ", sous: "Adresse et accès", eyebrow: "Adresse de départ", avant: "D'où ", accent: "partez-vous", apres: " ?", sub: "L'adresse et les conditions d'accès actuelles." },
  { cle: "arrivee", label: "Arrivée", sous: "Adresse et accès", eyebrow: "Adresse d'arrivée", avant: "Où ", accent: "allez-vous", apres: " ?", sub: "L'adresse et les conditions d'accès à l'arrivée." },
  { cle: "prestations", label: "Prestations", sous: "Votre formule", eyebrow: "Prestations", avant: "Que devons-nous ", accent: "prendre en charge", apres: " ?", sub: "Trois formules, comparées ligne par ligne. Vous choisissez, nous nous occupons du reste." },
  { cle: "emballage", label: "Emballage", sous: "Meubles à démonter", eyebrow: "Prestation d'emballage", avant: "Vos meubles à ", accent: "démonter", apres: "", sub: "Pour préparer au mieux le démontage et le remontage." },
  { cle: "inventaire", label: "Inventaire", sous: "Volume à déménager", eyebrow: "Inventaire", avant: "Quel ", accent: "volume", apres: " à déménager ?", sub: "Trois façons de l'estimer — dont l'analyse par photo." },
  { cle: "commentaires", label: "Commentaires", sous: "Relecture et envoi", eyebrow: "Commentaires", avant: "Un dernier ", accent: "mot", apres: " ?", sub: "Vérifiez vos informations et ajoutez vos précisions." },
];

/** Une question que l'espace pro a retirée du parcours ? */
type Masque = (cle: QuestionCle) => boolean;
const RIEN_DE_MASQUE: Masque = () => false;

/**
 * Le parcours d'un espace, tel que son écran d'accueil l'annonce : les étapes
 * que le client va réellement traverser, ni plus ni moins.
 */
export function parcoursDe(espace: EspacePublic): { label: string; sous: string }[] {
  if (espace.parcours === "express") {
    const sansPeriode = espace.questions_masquees.includes("periode");
    const sansPhotos = espace.questions_masquees.includes("volume_photos");
    return [
      { label: "Vos coordonnées", sous: "Nom, e-mail, téléphone" },
      { label: "Votre trajet", sous: "Ville de départ, ville d'arrivée" },
      ...(sansPeriode ? [] : [{ label: "Votre date", sous: "Une date ou une période" }]),
      { label: "Votre volume", sous: sansPhotos ? "En mètres cubes" : "Saisi, ou estimé sur photos" },
    ];
  }
  return etapesDe(espace).map(({ label, sous }) => ({ label, sous }));
}

/** Les étapes qu'un espace laisse au client. */
function etapesDe(espace: EspacePublic | undefined) {
  if (!espace) return ETAPES;
  const masquees = new Set<string>(espace.questions_masquees);
  return ETAPES.filter(
    (e) =>
      // La formule imposée par l'entreprise ne se choisit pas.
      !(e.cle === "prestations" && (masquees.has("formules") || espace.formule_imposee)) &&
      !(e.cle === "emballage" && masquees.has("demontage")),
  );
}

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


/* ============================ Sélecteur de devis ============================ */

export default function DemandeForm({
  library,
  instant = false,
  modeInitial = "express",
  onQuitter,
  espace,
}: {
  library: LibraryPhoto[];
  instant?: boolean;
  /** Le parcours choisi sur la vitrine. */
  modeInitial?: "express" | "complet";
  /** Retour à la vitrine, sans changer de page. */
  onQuitter: () => void;
  /** L'espace pro d'où l'on vient : il décide du parcours, des questions et de l'habillage. */
  espace?: EspacePublic;
}) {
  if ((espace?.parcours ?? modeInitial) === "express")
    return <ExpressForm library={library} onBack={onQuitter} instant={instant} espace={espace} />;
  return <CompleteForm library={library} onBack={onQuitter} instant={instant} espace={espace} />;
}

/* ============================ La coque ============================ */

/** Les étapes du parcours, sur un rail qui se remplit à mesure qu'on avance. */
function Frise({
  etapes,
  step,
  onAller,
}: {
  etapes: { label: string; sous: string }[];
  step: number;
  onAller: (i: number) => void;
}) {
  return (
    <ol className="relative">
      <span aria-hidden className="absolute bottom-[26px] left-[15px] top-[26px] w-px bg-line-strong" />
      <span
        aria-hidden
        className="absolute left-[15px] top-[26px] w-px bg-ink transition-[height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ height: `calc((100% - 52px) * ${etapes.length > 1 ? step / (etapes.length - 1) : 0})` }}
      />
      {etapes.map((e, i) => {
        const etat = i === step ? "active" : i < step ? "done" : "todo";
        return (
          <li key={e.label}>
            <button
              type="button"
              onClick={() => i < step && onAller(i)}
              disabled={i > step}
              aria-current={etat === "active" ? "step" : undefined}
              className={`relative flex w-full items-center gap-4 rounded-2xl py-2 pr-3 text-left transition-colors duration-200 ${
                etat === "done" ? "hover:bg-subtle" : ""
              }`}
            >
              <span
                className={`relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-[background-color,box-shadow,color] duration-300 ${
                  etat === "active"
                    ? "bg-ink text-shell shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-brand)_55%,transparent)]"
                    : etat === "done"
                      ? "bg-brand text-sur-brand"
                      : "border border-line-strong bg-card text-ink-soft"
                }`}
              >
                {etat === "done" ? <Icone nom="check" taille={13} trait={3.2} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-[14px] leading-tight ${
                    etat === "active" ? "font-semibold text-ink" : etat === "done" ? "text-ink-mid" : "text-ink-soft"
                  }`}
                >
                  {e.label}
                </span>
                <span className={`mt-1 block text-[11.5px] leading-tight ${etat === "todo" ? "text-ink-soft/70" : "text-ink-soft"}`}>
                  {e.sous}
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
function PromessesExpress({ sansPrix = false }: { sansPrix?: boolean }) {
  const lignes: [NomIcone, string, string][] = sansPrix
    ? [
        ["eclair", "Deux minutes", "Quatre questions, pas une de plus."],
        ["user", "Un conseiller dédié", "Il reprend votre demande et vous recontacte."],
        ["bouclier", "En toute confidentialité", "Vos informations ne servent qu'à préparer votre déménagement."],
      ]
    : [
        ["eclair", "Deux minutes", "Quatre questions, pas une de plus."],
        ["euro", "Le prix tout de suite", "Calculé sur notre grille, celle du commercial."],
        ["bouclier", "Sans engagement", "Vous gardez l'estimation, et vous nous rappelez quand vous voulez."],
      ];
  return (
    <ul className="space-y-5">
      {lignes.map(([icone, titre, texte]) => (
        <li key={titre} className="flex gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-brand text-sur-brand">
            <Icone nom={icone} taille={18} />
          </span>
          <span>
            <span className="block text-[14px] font-semibold">{titre}</span>
            <span className="mt-1 block text-[12.5px] leading-snug text-ink-soft">{texte}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ============================ Devis express ============================ */

function ExpressForm({
  library,
  onBack,
  instant,
  espace,
}: {
  library: LibraryPhoto[];
  onBack: () => void;
  instant: boolean;
  espace?: EspacePublic;
}) {
  const masque: Masque = espace ? (c) => espace.questions_masquees.includes(c) : RIEN_DE_MASQUE;
  const theme = espace ? themeEspace(espace.couleur) : undefined;
  const marque: Marque | null = espace ? { nom: nomEnseigne(espace), logo: espace.logo } : null;
  const montreVolume = espace?.afficher_volume ?? true;
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
          espace: espace?.slug,
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
    // Dans un espace pro, c'est lui qui décide si le prix s'affiche.
    return (espace ? espace.afficher_estimation : instant) ? (
      <InstantResult requestId={done} volume={volume} count={doneCount} theme={theme} marque={marque}
        onNewQuote={() => { setDone(null); setDoneCount(1); setF(EXPRESS_VIDE); setDepartCoord(null); setArriveeCoord(null); setTrajet(null); }}
      />
    ) : (
      <SuccessScreen
        id={done}
        volume={montreVolume ? volume : null}
        count={doneCount}
        marque={marque}
        theme={theme}
        message={espace ? messageFinDe(espace) : undefined}
      />
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
            milieu={<PromessesExpress sansPrix={espace ? !espace.afficher_estimation : false} />}
            marque={marque}
            recap={[
              ["Trajet", trajetLisible(f.departVille, f.arriveeVille)],
              ["Distance", distanceKm != null ? `${distanceKm} km` : null],
              ...(masque("periode") ? [] : ([["Quand", quand]] as [string, string | null][])),
              ...(montreVolume ? ([["Volume", volume != null ? `${volume} m³` : null]] as [string, string | null][]) : []),
            ]}
          />
        }
        etiquette={espace ? espace.slug === "standard" ? "Espace pro" : `Espace ${nomCourt(espace.nom)}` : "Devis express"}
        progression={8 + (faits / 3) * 92}
        onBack={onBack}
        marque={marque}
        theme={theme}
        barre={
          <>
            <div className="min-w-0 flex-1">
              {manque ? (
                <Manque>{manque}</Manque>
              ) : (
                <p className="text-right text-[12.5px] text-ink-soft sm:text-left">
                  {montreVolume ? (
                    <>
                      Tout y est — <span className="font-semibold text-ink">{volume} m³</span> à déménager.
                    </>
                  ) : (
                    "Tout y est — vous pouvez envoyer votre demande."
                  )}
                </p>
              )}
            </div>
            <Bouton onClick={submit} disabled={manque !== null || submitting}>
              {submitting ? "Envoi…" : espace && !espace.afficher_estimation ? "Envoyer ma demande" : "Obtenir mon estimation"}
            </Bouton>
          </>
        }
      >
        <Titre
          pastille={<Icone nom="eclair" taille={11} trait={2.4} />}
          texte="2 minutes"
          eyebrow={espace ? espace.slug === "standard" ? "Espace pro" : `Espace ${nomCourt(espace.nom)}` : "Devis express"}
          avant={espace && !espace.afficher_estimation ? "Demande " : "Estimation "}
          accent="rapide"
          apres=""
          sub={
            espace && !espace.afficher_estimation
              ? "L'essentiel pour préparer votre déménagement — en deux minutes."
              : "L'essentiel pour un premier chiffrage — en deux minutes."
          }
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

          {!masque("periode") && (
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
          )}

          <Bloc
            icone="carton"
            titre="Votre volume"
            sous={masque("volume_photos") ? "Indiquez le volume à déménager." : "Saisissez-le, ou laissez vos photos l'estimer."}
            delai={210}
          >
            {!masque("volume_photos") && (
              <Field groupe label="Volume à déménager *">
                <div className="sm:max-w-md">
                  <Choice plein options={[["explicit", "Je connais mon volume"], ["ai", "J'envoie des photos"]]} value={f.volMode} onChange={(v) => set({ volMode: v as "explicit" | "ai" })} />
                </div>
              </Field>
            )}
            <div key={f.volMode} className={`animate-step-in ${masque("volume_photos") ? "" : "mt-4"}`}>
              {f.volMode === "explicit" || masque("volume_photos") ? (
                <SaisieVolume valeur={f.explicitVolume} onChange={(explicitVolume) => set({ explicitVolume })} />
              ) : (
                <div className={montreVolume ? "" : "sans-volume"}>
                  <PhotoAnalyzer library={library} photos={f.photos} onChange={(photos) => set({ photos })} showTotal={montreVolume} />
                </div>
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

function CompleteForm({
  library,
  onBack,
  instant,
  espace,
}: {
  library: LibraryPhoto[];
  onBack: () => void;
  instant: boolean;
  espace?: EspacePublic;
}) {
  // Ce que l'espace pro change : les étapes, les questions, l'habillage.
  const etapes = useMemo(() => etapesDe(espace), [espace]);
  const masque: Masque = espace ? (c) => espace.questions_masquees.includes(c) : RIEN_DE_MASQUE;
  const theme = espace ? themeEspace(espace.couleur) : undefined;
  const marque: Marque | null = espace ? { nom: nomEnseigne(espace), logo: espace.logo } : null;
  const montreVolume = espace?.afficher_volume ?? true;

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
      setStep(etapes.length - 1);
    }, 0);
    return () => clearTimeout(id);
  }, [etapes.length]);

  const etape = etapes[Math.min(step, etapes.length - 1)];
  const manquant = manque(etape.cle, form);
  const annonce = manquant ? null : annonceDefauts(etape.cle, form, masque);
  /** Aller à une étape par son nom — si l'espace l'a gardée. */
  const allerA = (cle: EtapeCle) => {
    const i = etapes.findIndex((e) => e.cle === cle);
    if (i >= 0) setStep(i);
  };

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...buildPayload(form), distance_km: distanceKm ?? undefined, espace: espace?.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
      setDone(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally { setSubmitting(false); }
  }

  if (done) {
    // Dans un espace pro, c'est lui qui décide si le prix s'affiche.
    return (espace ? espace.afficher_estimation : instant) ? (
      <InstantResult requestId={done} volume={totalVolume} count={doneCount} theme={theme} marque={marque}
        onNewQuote={() => { setDone(null); setDoneCount(1); setForm(initial); setStep(0); setTrajet(null); }}
      />
    ) : (
      <SuccessScreen
        id={done}
        volume={montreVolume ? totalVolume : null}
        count={doneCount}
        marque={marque}
        theme={theme}
        message={espace ? messageFinDe(espace) : undefined}
      />
    );
  }

  const derniere = step === etapes.length - 1;

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
            milieu={<Frise etapes={etapes} step={step} onAller={setStep} />}
            marque={marque}
            recap={[
              ["Trajet", trajetLisible(form.depart.ville, form.arrivee.ville)],
              ["Distance", distanceKm != null ? `${distanceKm} km` : null],
              // Une ligne que l'espace a retirée du parcours ne laisse pas de case vide.
              ...(etapes.some((e) => e.cle === "prestations")
                ? ([["Formule", nomFormule(form.prestations)]] as [string, string | null][])
                : []),
              ...(montreVolume ? ([["Volume", totalVolume != null ? `${totalVolume} m³` : null]] as [string, string | null][]) : []),
            ]}
          />
        }
        etiquette={`Étape ${step + 1} / ${etapes.length} · ${etape.label}`}
        progression={((step + 1) / etapes.length) * 100}
        onBack={onBack}
        large={etape.cle === "prestations"}
        marque={marque}
        theme={theme}
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
                    {etapes.map((e, i) => (
                      <span
                        key={e.cle}
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          i === step ? "w-6 bg-ink" : i < step ? "w-1.5 bg-brand-mid" : "w-1.5 bg-line-strong"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[12.5px] text-ink-soft">
                    Étape {step + 1} sur {etapes.length}
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
                  setForm((f) => ({ ...f, ...defauts(etape.cle, f) }));
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
            texte={`Étape ${step + 1} sur ${etapes.length}`}
            eyebrow={etape.eyebrow}
            avant={etape.avant}
            accent={etape.accent}
            apres={etape.apres}
            sub={etape.sub}
          />
          {etape.cle === "vous" && <VousStep form={form} patch={patch} masque={masque} />}
          {etape.cle === "depart" && <AddressStep which="depart" form={form} patch={patch} masque={masque} />}
          {etape.cle === "arrivee" && <AddressStep which="arrivee" form={form} patch={patch} masque={masque} />}
          {etape.cle === "prestations" && <ChoixFormule value={form.prestations} onChange={(prestations) => patch({ prestations })} />}
          {etape.cle === "emballage" && <EmballageStep form={form} patch={patch} />}
          {etape.cle === "inventaire" && (
            <VolumeStep form={form} patch={patch} library={library} masque={masque} montreVolume={montreVolume} />
          )}
          {etape.cle === "commentaires" && (
            <CommentairesStep
              form={form}
              patch={patch}
              volume={totalVolume}
              masque={masque}
              montreVolume={montreVolume}
              etapes={etapes.map((e) => e.cle)}
              onModifier={allerA}
            />
          )}
        </div>

        {error && <Erreur>{error}</Erreur>}
      </Cadre>
    </>
  );
}

/* ============================ Étapes ============================ */

type StepProps = { form: FormState; patch: (p: Partial<FormState>) => void };
type AvecMasque = { masque: Masque };

function VousStep({ form, patch, masque }: StepProps & AvecMasque) {
  const entreprise = form.type_client === "entreprise";
  // Un bloc dont l'espace a retiré toutes les questions disparaît avec elles.
  const projet = !masque("demenagement") || !masque("mutation_pro") || !masque("periode");
  const garantie = !masque("valeur_mobilier") || !masque("garantie");
  return (
    <div className="space-y-5">
      <Bloc icone="user" titre="Vos coordonnées" sous="Pour vous envoyer l'estimation et vous rappeler.">
        <div className="space-y-5">
          {!masque("type_client") && (
            <Field groupe label="Vous êtes *">
              <div className="sm:max-w-xs">
                <Choice plein options={[["particulier", "Particulier"], ["entreprise", "Entreprise"]]} value={form.type_client} onChange={(v) => patch({ type_client: v as FormState["type_client"] })} />
              </div>
            </Field>
          )}
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

      {projet && (
        <Bloc icone="calendrier" titre="Votre projet" sous="Le cadre de votre déménagement, et la période visée." delai={70}>
          {(!masque("demenagement") || !masque("mutation_pro")) && (
            <div>
              {!masque("demenagement") && (
                <Ligne label="Déménagement complet ou partiel ?">
                  <Choice options={[["complet", "Complet"], ["partiel", "Partiel"]]} value={form.demenagement} onChange={(v) => patch({ demenagement: v as FormState["demenagement"] })} />
                </Ligne>
              )}
              {!masque("mutation_pro") && (
                <>
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
                </>
              )}
            </div>
          )}
          {!masque("periode") && (
            <div className={!masque("demenagement") || !masque("mutation_pro") ? "mt-2 border-t border-line pt-5" : ""}>
              <ChampPeriode
                label="Période souhaitée"
                mode={form.periode_mode}
                valeur={form.periode}
                onChange={(periode_mode, periode) => patch({ periode_mode, periode })}
                exemple="Entre le 15 et le 30 novembre, dès que la vente est signée…"
              />
            </div>
          )}
        </Bloc>
      )}

      {garantie && (
        <Bloc icone="bouclier" titre="Votre garantie dommages" sous="La valeur de votre mobilier, et le niveau de garantie souhaité." delai={140}>
          <div className="space-y-6">
            {!masque("valeur_mobilier") && (
              <Field groupe label="Estimation de la valeur du mobilier" hint="facultatif">
                <div className="flex flex-wrap gap-2">
                  {VALEURS.map((v) => <Pill key={v} active={form.valeur_mobilier === v} onClick={() => patch({ valeur_mobilier: v })}>{v}</Pill>)}
                </div>
              </Field>
            )}
            {!masque("garantie") && (
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
            )}
          </div>
        </Bloc>
      )}

      {!masque("objets_lourds") && (
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
      )}
    </div>
  );
}

function AddressStep({ which, form, patch, masque }: StepProps & AvecMasque & { which: "depart" | "arrivee" }) {
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

      <Bloc
        icone="immeuble"
        titre="Accès au logement"
        sous={masque("acces_logement") ? "L'étage et la surface du logement." : "Étage, ascenseur, escalier : c'est ce qui fait le temps de manutention."}
        delai={70}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Étage" hint="0 = RDC"><TextInput type="number" min={0} value={a.etage} onChange={(e) => set({ etage: e.target.value })} placeholder="3" /></Field>
          <Field label="Surface habitable"><TextInput type="number" min={0} unite="m²" value={a.surface} onChange={(e) => set({ surface: e.target.value })} placeholder="65" /></Field>
        </div>
        {/* Toutes les questions restent posées. Les masquer tant qu'un étage
            n'était pas saisi donnait un bloc à moitié vide, et le client ne
            savait pas ce qu'on attendait de lui. */}
        {!masque("acces_logement") && (
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
        )}
      </Bloc>

      {!masque("acces_camion") && (
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
      )}
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
  masque,
  montreVolume,
  etapes,
  onModifier,
}: StepProps &
  AvecMasque & {
    volume: number | null;
    montreVolume: boolean;
    etapes: EtapeCle[];
    onModifier: (cle: EtapeCle) => void;
  }) {
  return (
    <div className="space-y-5">
      <RecapCard form={form} volume={volume} masque={masque} montreVolume={montreVolume} etapes={etapes} onModifier={onModifier} />
      {!masque("commentaire") && (
        <Bloc icone="message" titre="Votre message" sous="Précisions, contraintes, objets particuliers : tout ce qui nous aidera." delai={120}>
          <Field label="Message" hint="facultatif">
            <Zone value={form.commentaire} onChange={(e) => patch({ commentaire: e.target.value })} rows={5}
              placeholder="Précisions, contraintes, objets particuliers…" />
          </Field>
        </Bloc>
      )}
    </div>
  );
}

/* ---------- Volume (3 modes) ---------- */

function VolumeStep({
  form,
  patch,
  library,
  masque,
  montreVolume,
}: StepProps & AvecMasque & { library: LibraryPhoto[]; montreVolume: boolean }) {
  // L'espace peut retirer la liste ou les photos ; la saisie directe reste toujours.
  const modes = MODES_VOLUME.filter(
    (m) => !(m.key === "list" && masque("volume_liste")) && !(m.key === "ai" && masque("volume_photos"))
  );
  // Quand l'espace tait les mètres cubes, les cartes ne promettent pas un chiffre.
  const texte = (m: (typeof MODES_VOLUME)[number]) =>
    montreVolume || m.key === "explicit"
      ? m.texte
      : m.key === "list"
        ? "Meuble par meuble : nos équipes en déduisent le volume."
        : "Nos équipes estiment le volume d'après vos photos.";
  const actif = modes.find((m) => m.key === form.volumeMode) ?? modes[0];
  const mode = actif.key;
  return (
    <div className="space-y-5">
      {modes.length > 1 && (
        <div className={`reveal grid gap-3 ${modes.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {modes.map((m) => (
            <CarteChoix
              key={m.key}
              active={mode === m.key}
              onClick={() => patch({ volumeMode: m.key })}
              icone={m.icone}
              titre={m.titre}
              texte={texte(m)}
            />
          ))}
        </div>
      )}
      <div key={mode} className={montreVolume ? "" : "sans-volume"}>
        <Bloc icone={actif.icone} titre={actif.titre} sous={texte(actif)} delai={70}>
          {mode === "explicit" && <SaisieVolume valeur={form.explicitVolume} onChange={(explicitVolume) => patch({ explicitVolume })} />}
          {mode === "list" && <ListeMeubles items={form.items} onChange={(items) => patch({ items })} sansVolume={!montreVolume} />}
          {mode === "ai" && (
            <PhotoAnalyzer library={library} photos={form.photos} onChange={(photos) => patch({ photos })} showTotal={montreVolume} />
          )}
        </Bloc>
      </div>
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

/** Le nom d'un espace, sans le mot « Espace » qu'on met déjà devant. */
function nomCourt(nom: string) {
  return nom.replace(/^espace\s+/i, "");
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
  masque,
  montreVolume,
  etapes,
  onModifier,
}: {
  form: FormState;
  volume: number | null;
  masque: Masque;
  montreVolume: boolean;
  etapes: EtapeCle[];
  onModifier: (cle: EtapeCle) => void;
}) {
  const presta = LIGNES_CARTE.filter((p) => form.prestations[p.key] === "bailly").map((p) => p.label).join(", ") || "aucune";
  const contact = [[form.prenom, form.nom].filter(Boolean).join(" "), form.email, form.tel].filter(Boolean).join(" · ");
  const si = (garde: boolean, ligne: [string, string]): [string, string][] => (garde ? [ligne] : []);
  const acces = (a: Address): [string, string][] => [
    ["Adresse", adresseLisible(a)],
    ...si(!masque("acces_logement") || !masque("acces_camion"), ["Accès", accesLisible(a)]),
  ];
  const tous: { cle: EtapeCle; icone: NomIcone; titre: string; lignes: [string, string][] }[] = [
    {
      cle: "vous",
      icone: "user",
      titre: "Vous",
      lignes: [
        ["Client", contact || "non renseigné"],
        ...si(Boolean(form.societe), ["Société", form.societe]),
        ...si(!masque("garantie"), ["Garantie", garantieLisible(form)]),
        ...si(!masque("objets_lourds"), ["Objets lourds", lourdsLisible(form)]),
        ...si(!masque("periode"), ["Période", periodeLisible(form)]),
      ],
    },
    { cle: "depart", icone: "pin", titre: "Départ", lignes: acces(form.depart) },
    { cle: "arrivee", icone: "maison", titre: "Arrivée", lignes: acces(form.arrivee) },
    { cle: "prestations", icone: "bouclier", titre: "Prestations", lignes: [["Formule", nomFormule(form.prestations) ?? "à définir"], ["Prise en charge Bailly", presta]] },
    { cle: "emballage", icone: "cle", titre: "Démontage", lignes: demontageLisible(form) },
    {
      cle: "inventaire",
      icone: "carton",
      titre: "Inventaire",
      lignes: [
        montreVolume
          ? ["Volume", volume != null ? `${volume} m³ (${METHODE_VOLUME[form.volumeMode]})` : "non renseigné"]
          : ["Inventaire", volume != null ? `transmis (${METHODE_VOLUME[form.volumeMode]})` : "non renseigné"],
      ],
    },
  ];
  // Une étape que l'espace a retirée ne figure pas au récapitulatif.
  const groupes = tous.filter((g) => etapes.includes(g.cle));
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
              onClick={() => onModifier(g.cle)}
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

function SuccessScreen({
  id,
  volume,
  count = 1,
  marque,
  theme,
  message,
}: {
  id: string;
  volume: number | null;
  count?: number;
  marque?: Marque | null;
  theme?: CSSProperties;
  /** Le mot de la fin d'un espace pro, à la place du texte par défaut. */
  message?: string;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-6 py-16 text-ink" style={theme}>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="halo absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2" style={halo(30)} />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center">
        <div className="flex justify-center">
          <Enseigne marque={marque} />
        </div>
        <div className="reveal mx-auto mt-10 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-sur-brand shadow-[0_0_0_10px_color-mix(in_srgb,var(--color-brand)_22%,transparent)]">
          <Icone nom="check" taille={28} trait={3} className="coche-pop" />
        </div>
        <h1 className="font-serif reveal mt-7 text-balance text-[40px] sm:text-[52px]" style={delai(80)}>
          {count > 1 ? `${count} demandes envoyées` : "Demande envoyée"}
        </h1>
        <p className="reveal mx-auto mt-4 max-w-[44ch] text-[15.5px] leading-relaxed text-ink-soft" style={delai(160)}>
          {message ||
            (count > 1
              ? `Merci ! Nos experts étudient vos ${count} scénarios et vous adressent un devis pour chacun par e-mail.`
              : `Merci ! Nos experts analysent votre projet${volume != null ? ` (~${volume} m³)` : ""} et reviennent vers vous très vite.`)}
        </p>
        <div className="reveal mt-7 inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-4 py-2 text-[13px] text-ink-soft" style={delai(240)}>
          Référence <span className="font-mono text-ink">{id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================ Helpers ============================ */

function computeVolume(form: FormState): number | null {
  return volumeDe(form.volumeMode, form.explicitVolume, form.items, form.photos);
}

/** Ce qu'il manque pour passer à l'étape suivante — ou rien. */
function manque(cle: EtapeCle, form: FormState): string | null {
  switch (cle) {
    case "vous": {
      const nomme = (form.prenom.trim() || form.nom.trim()).length > 0;
      if (form.type_client === "entreprise") {
        if (!form.societe.trim() && !nomme) return "Indiquez la raison sociale";
      } else if (!nomme) return "Indiquez votre nom";
      if (!form.tel.trim()) return "Indiquez votre téléphone";
      if (!/.+@.+\..+/.test(form.email)) return "Indiquez un e-mail valide";
      return null;
    }
    // La ville est le minimum : sans elle, ni distance ni prix.
    case "depart":
      return form.depart.ville.trim() ? null : "Indiquez la ville de départ";
    case "arrivee":
      return form.arrivee.ville.trim() ? null : "Indiquez la ville d'arrivée";
    case "inventaire":
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
function defauts(etape: EtapeCle, form: FormState): Partial<FormState> {
  switch (etape) {
    case "vous": {
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
    case "depart":
    case "arrivee": {
      const cle = etape;
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
    case "prestations":
      return formuleRetenue(form.prestations) === null ? { prestations: { ...PRESTATIONS_PAR_DEFAUT } } : {};
    default:
      return {};
  }
}

/** La question à laquelle se rattache chaque réponse complétée d'office. */
const QUESTION_DU_CHAMP: Record<string, QuestionCle> = {
  demenagement: "demenagement",
  mutation_pro: "mutation_pro",
  assurance: "garantie",
  articles_lourds: "objets_lourds",
  piano: "objets_lourds",
  periode: "periode",
  duplex: "acces_logement",
  ascenseur: "acces_logement",
  passage_ascenseur: "acces_logement",
  passage_escalier: "acces_logement",
  difficulte_acces: "acces_camion",
  stationnement: "acces_camion",
};

/**
 * Ce que la barre du bas annonce quand des réponses vont être complétées.
 * Une question que l'espace a retirée est complétée en silence : on n'annonce
 * pas au client une question qu'il n'a jamais vue.
 */
function annonceDefauts(etape: EtapeCle, form: FormState, masque: Masque): string | null {
  const visible = (champ: string) => !(champ in QUESTION_DU_CHAMP && masque(QUESTION_DU_CHAMP[champ]));
  const patch = defauts(etape, form);
  if (etape === "prestations") return patch.prestations ? "Sans choix de votre part, la formule Standard sera retenue." : null;
  let n = 0;
  if (etape === "depart" || etape === "arrivee") {
    const cle = etape;
    const apres = patch[cle];
    if (apres) n = (Object.keys(apres) as (keyof Address)[]).filter((k) => apres[k] !== form[cle][k] && visible(k)).length;
  } else {
    n = Object.keys(patch).filter((k) => k !== "periode_mode" && visible(k)).length;
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
