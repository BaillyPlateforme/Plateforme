"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { REPERE_LOGEMENT } from "@/lib/catalog";
import { aujourdhuiParis, telephoneValide } from "@/lib/saisies";
import { messageFinDe, nomEnseigne, themeEspace, type EspacePublic } from "@/lib/espaces";
import { AddressInput } from "./AddressInput";
import { BrandPanel, Bouton, Cadre, Erreur, Manque, Titre, type Marque } from "./cadre";
import {
  ChampPeriode,
  Frise,
  GARANTIES,
  PAYS,
  PERIODE_PAR_DEFAUT,
  SuccessScreen,
  VALEURS,
  trajetLisible,
  type PeriodeMode,
} from "./DemandeForm";
import { useEtapesDansLHistorique } from "./historique";
import { remonter } from "./integration";
import { Envoi } from "./QuoteTools";
import { Bloc, CarteChoix, Choice, Field, Icone, Ligne, Pill, Selecteur, TextInput, YesNo, Zone, type NomIcone } from "./ui";

/*
 * Les questionnaires sans prix : la mutation, et l'entreprise en deux branches.
 *
 * Tout vient de la réunion du 29 octobre avec Margaux Solano et Laure Mercier :
 *
 * - Mutation : « garder que les éléments nécessaires, comme une fiche de
 *   visite ». Les coordonnées, la société qui mute, la valeur du mobilier et
 *   la garantie (une mutation n'est pas toujours sous contrat), complet ou
 *   partiel, la période — obligatoire —, les objets lourds dits simplement
 *   (« un particulier ne sait pas ce que pèse son frigo »), les adresses sans
 *   état ni province, l'étage, l'ascenseur, le duplex, la surface et les
 *   dépendances, un espace de commentaires. Plus d'inventaire pièce par pièce
 *   ni de questions d'accès : une visio suit toujours.
 * - Entreprise : « quand on clique sur transfert, ça se sépare en deux ». Le
 *   petit transfert (quatre bureaux, trois caissons, un photocopieur) décrit
 *   son mobilier ; le projet important explique son projet en quelques lignes
 *   pour être rappelé. Sans prix tous les deux, en attendant l'avis de
 *   professionnels du transfert.
 */

type YN = "oui" | "non" | "";

type Etape = {
  cle: string;
  label: string;
  sous: string;
  eyebrow: string;
  avant: string;
  accent: string;
  apres: string;
  sub: string;
};

const emailValide = (e: string) => /.+@.+\..+/.test(e);
/** Une date du calendrier déjà passée (à l'heure de Paris) : refusée, comme au devis complet. */
const datePassee = (mode: PeriodeMode, valeur: string) => mode === "date" && !!valeur && valeur < aujourdhuiParis();

/* ─────────────────────────── Le cadre pas à pas ─────────────────────────── */

/**
 * La coque commune aux questionnaires sans prix : le panneau et sa frise, le
 * titre de l'étape, la barre d'action — la même que celle du devis complet,
 * pour que les trois portes se ressemblent.
 */
function PasAPas({
  etapes,
  step,
  setStep,
  manquant,
  envoi,
  onEnvoyer,
  onBack,
  recap,
  marque,
  theme,
  entete,
  children,
}: {
  etapes: Etape[];
  step: number;
  setStep: (n: number) => void;
  /** Ce qui empêche d'avancer, dit en clair. */
  manquant: string | null;
  envoi: boolean;
  onEnvoyer: () => void;
  onBack: () => void;
  recap: [string, string | null][];
  marque?: Marque | null;
  theme?: CSSProperties;
  /** Ce qui se pose au-dessus du titre : la société reconnue, par exemple. */
  entete?: ReactNode;
  children: ReactNode;
}) {
  const etape = etapes[step];
  const derniere = step === etapes.length - 1;

  // À chaque étape, on remonte — sauf au premier affichage, pour ne pas tirer
  // vers le formulaire la page du site qui l'accueille.
  const vu = useRef(step);
  useEffect(() => {
    if (step === vu.current) return;
    vu.current = step;
    remonter(true);
  }, [step]);

  return (
    <Cadre
      panneau={<BrandPanel milieu={<Frise etapes={etapes} step={step} onAller={setStep} />} marque={marque} recap={recap} />}
      etiquette={`Étape ${step + 1} / ${etapes.length} · ${etape.label}`}
      progression={((step + 1) / etapes.length) * 100}
      onBack={onBack}
      marque={marque}
      theme={theme}
      barre={
        <>
          <button
            type="button"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0 || envoi}
            aria-label="Étape précédente"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] font-medium text-ink-mid transition hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-0 sm:px-5"
          >
            <Icone nom="gauche" taille={15} trait={2.2} />
            <span className="hidden sm:inline">Retour</span>
          </button>
          <div className="min-w-0 flex-1">
            {manquant ? (
              <Manque>{manquant}</Manque>
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
            <Bouton onClick={onEnvoyer} disabled={envoi || manquant !== null}>
              {envoi ? "Envoi…" : "Envoyer ma demande"}
            </Bouton>
          ) : (
            <Bouton onClick={() => setStep(step + 1)} disabled={manquant !== null}>
              Continuer
            </Bouton>
          )}
        </>
      }
    >
      {entete}
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
        {children}
      </div>
    </Cadre>
  );
}

/** Envoie la demande, et dit ce qui a échoué en clair. */
async function envoyer(corps: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
  return data.id as string;
}

/* ─────────────────────────── Les adresses ─────────────────────────── */

type Adresse = {
  adresse: string;
  complement: string;
  code_postal: string;
  ville: string;
  pays: string;
  etage: string;
  ascenseur: YN;
  duplex: YN;
  surface: string;
  surface_inconnue: boolean;
  logement: string;
  /** Les dépendances : cave, garage, grenier, extérieur. */
  annexes: string[];
};

const ADRESSE_VIDE: Adresse = {
  adresse: "", complement: "", code_postal: "", ville: "", pays: "France",
  etage: "", ascenseur: "", duplex: "", surface: "", surface_inconnue: false, logement: "", annexes: [],
};

const LOGEMENTS = REPERE_LOGEMENT.types.map((t) => t.label);

/** Ce qu'une adresse envoie : les colonnes de la demande, puis le reste en détail. */
function versAdresse(a: Adresse) {
  return {
    adresse: a.adresse || undefined,
    code_postal: a.code_postal || undefined,
    ville: a.ville || undefined,
    etage: a.etage ? parseInt(a.etage, 10) : undefined,
    ascenseur: a.ascenseur === "oui" ? true : a.ascenseur === "non" ? false : undefined,
    surface: !a.surface_inconnue && a.surface ? parseFloat(a.surface) : undefined,
    type_logement: a.surface_inconnue ? a.logement || undefined : undefined,
  };
}

function detailAdresse(a: Adresse) {
  return { complement: a.complement, pays: a.pays, duplex: a.duplex, annexes: a.annexes, surface_inconnue: a.surface_inconnue };
}

function adresseLisible(a: Adresse): string | null {
  const fin = [a.code_postal, a.ville].filter(Boolean).join(" ");
  const debut = a.adresse.trim();
  if (!debut) return fin || null;
  return fin && !debut.toLowerCase().includes(a.ville.toLowerCase()) ? `${debut}, ${fin}` : debut;
}

function logementLisible(a: Adresse): string {
  const bouts: string[] = [];
  const etage = parseInt(a.etage, 10);
  if (!isNaN(etage)) bouts.push(etage === 0 ? "rez-de-chaussée" : `${etage}${etage === 1 ? "er" : "e"} étage`);
  if (a.ascenseur === "oui") bouts.push("ascenseur");
  if (a.duplex === "oui") bouts.push("duplex");
  if (a.surface_inconnue ? a.logement : parseFloat(a.surface) > 0) bouts.push(a.surface_inconnue ? a.logement : `${a.surface} m²`);
  for (const an of REPERE_LOGEMENT.annexes) if (a.annexes.includes(an.key)) bouts.push(an.label.toLowerCase());
  return bouts.join(" · ") || "—";
}

/**
 * L'adresse et le logement, comme sur une fiche de visite.
 *
 * Plus d'état ni de province — l'adresse se complète d'elle-même —, plus de
 * questions sur l'accès du camion : « ce n'est pas au client de le savoir ».
 * La version « locaux » sert à l'entreprise : ni duplex, ni dépendances.
 */
function AdresseFiche({
  titre,
  valeur,
  onChange,
  locaux = false,
}: {
  titre: string;
  valeur: Adresse;
  onChange: (a: Adresse) => void;
  locaux?: boolean;
}) {
  const a = valeur;
  const set = (p: Partial<Adresse>) => onChange({ ...a, ...p });
  const basculer = (cle: string) =>
    set({ annexes: a.annexes.includes(cle) ? a.annexes.filter((x) => x !== cle) : [...a.annexes, cle] });

  return (
    <div className="space-y-5">
      <Bloc icone={locaux ? "immeuble" : "pin"} titre={titre} sous="Tapez, puis choisissez dans la liste : l'adresse se complète d'elle-même.">
        <div className="space-y-5">
          <Field label="Adresse">
            <AddressInput
              kind="address"
              value={a.adresse}
              pays={a.pays}
              placeholder="12 rue de la République, Paris"
              onChange={(v) => set({ adresse: v })}
              onSelect={(p) => set({ adresse: p.label, ville: p.ville, code_postal: p.code_postal })}
            />
          </Field>
          <Field label="Complément d'adresse" hint="facultatif">
            <TextInput value={a.complement} onChange={(e) => set({ complement: e.target.value })} placeholder={locaux ? "Bâtiment, étage, société…" : "Bâtiment, appartement…"} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.3fr)]">
            <Field label="Code postal">
              <TextInput value={a.code_postal} onChange={(e) => set({ code_postal: e.target.value })} placeholder="75011" inputMode="numeric" />
            </Field>
            <Field label="Ville *">
              <AddressInput
                kind="municipality"
                value={a.ville}
                pays={a.pays}
                placeholder="Paris"
                onChange={(v) => set({ ville: v })}
                onSelect={(p) => set({ ville: p.ville, code_postal: p.code_postal })}
              />
            </Field>
            <Field label="Pays">
              <Selecteur value={a.pays} onChange={(e) => set({ pays: e.target.value })}>
                {PAYS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Selecteur>
            </Field>
          </div>
        </div>
      </Bloc>

      <Bloc icone="immeuble" titre={locaux ? "Les locaux" : "Le logement"} sous={locaux ? "L'étage et l'ascenseur suffisent : le reste se voit sur place." : "L'essentiel : le reste se voit lors de la visite."} delai={70}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Étage" hint="0 = RDC">
            <TextInput type="number" min={0} value={a.etage} onChange={(e) => set({ etage: e.target.value })} placeholder="3" />
          </Field>
          {!locaux && (
            <Field label="Surface habitable *">
              <TextInput
                type="number"
                min={0}
                unite="m²"
                value={a.surface_inconnue ? "" : a.surface}
                disabled={a.surface_inconnue}
                onChange={(e) => set({ surface: e.target.value })}
                placeholder={a.surface_inconnue ? "—" : "65"}
              />
            </Field>
          )}
        </div>
        {!locaux && (
          <>
            <div className="mt-3">
              <Pill active={a.surface_inconnue} onClick={() => set({ surface_inconnue: !a.surface_inconnue })}>
                Je ne connais pas la surface
              </Pill>
            </div>
            {a.surface_inconnue && (
              <div className="animate-step-in mt-3 rounded-[20px] bg-subtle p-4">
                <Field groupe label="Votre type de logement *">
                  <div className="flex flex-wrap gap-2">
                    {LOGEMENTS.map((l) => (
                      <Pill key={l} active={a.logement === l} onClick={() => set({ logement: l })}>{l}</Pill>
                    ))}
                  </div>
                </Field>
              </div>
            )}
          </>
        )}
        <div className="mt-3">
          <Ligne label="Ascenseur ?"><YesNo value={a.ascenseur} onChange={(v) => set({ ascenseur: v })} /></Ligne>
          {!locaux && <Ligne label="Duplex ?"><YesNo value={a.duplex} onChange={(v) => set({ duplex: v })} /></Ligne>}
        </div>
        {!locaux && (
          <div className="mt-2 border-t border-line pt-4">
            <Field groupe label="Des dépendances ?" hint="plusieurs choix possibles">
              <div className="flex flex-wrap gap-2">
                {REPERE_LOGEMENT.annexes.map((an) => (
                  <Pill key={an.key} active={a.annexes.includes(an.key)} onClick={() => basculer(an.key)}>{an.label}</Pill>
                ))}
              </div>
            </Field>
          </div>
        )}
      </Bloc>
    </div>
  );
}

function adresseManquante(a: Adresse, quoi: string, locaux = false): string | null {
  if (!a.ville.trim()) return `Indiquez la ville ${quoi}`;
  if (locaux) return null;
  if (a.surface_inconnue) return a.logement ? null : "Indiquez votre type de logement";
  return parseFloat(a.surface) > 0 ? null : "Indiquez la surface habitable";
}

/* ─────────────────────────── Le récapitulatif ─────────────────────────── */

function Recapitulatif({ groupes }: { groupes: { icone: NomIcone; titre: string; lignes: [string, string][] }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groupes.map((g) => (
        <section key={g.titre} className="bloc rounded-[22px] border border-line bg-card p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
              <Icone nom={g.icone} taille={15} />
            </span>
            <span className="text-[14px] font-semibold">{g.titre}</span>
          </div>
          <dl className="mt-3 space-y-2">
            {g.lignes.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-[13px] leading-snug">
                <dt className="text-ink-soft">{k}</dt>
                {/* Une adresse e-mail longue, sans tiret ni espace, se coupe : sinon, au téléphone, la page
                    débordait en largeur et la barre « Envoyer ma demande » sortait de l'écran. */}
                <dd className="font-medium text-ink wrap-anywhere">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/* ═══════════════════════════ La mutation ═══════════════════════════ */

const ETAPES_MUTATION: Etape[] = [
  { cle: "vous", label: "Vous", sous: "Coordonnées et mutation", eyebrow: "Votre mutation", avant: "Parlez-nous de ", accent: "vous", apres: "", sub: "Vos coordonnées, l'entreprise qui vous mute et votre projet." },
  { cle: "depart", label: "Départ", sous: "Adresse et logement", eyebrow: "Adresse de départ", avant: "D'où ", accent: "partez-vous", apres: " ?", sub: "L'adresse et le logement que vous quittez." },
  { cle: "arrivee", label: "Arrivée", sous: "Adresse et logement", eyebrow: "Adresse d'arrivée", avant: "Où ", accent: "allez-vous", apres: " ?", sub: "L'adresse et le logement qui vous attendent." },
  { cle: "fin", label: "Envoi", sous: "Commentaires et relecture", eyebrow: "Relecture", avant: "Un dernier ", accent: "mot", apres: " ?", sub: "Ce qu'il faut savoir d'autre, puis l'envoi de votre demande." },
];

type Mutation = {
  prenom: string;
  nom: string;
  tel: string;
  email: string;
  societe: string;
  demenagement: "complet" | "partiel" | "";
  periode_mode: PeriodeMode;
  periode: string;
  valeur_mobilier: string;
  assurance: "standard" | "luxe" | "";
  lourds: YN;
  lourds_detail: string;
  depart: Adresse;
  arrivee: Adresse;
  commentaire: string;
};

const MUTATION_VIDE: Mutation = {
  prenom: "", nom: "", tel: "", email: "", societe: "", demenagement: "",
  periode_mode: "date", periode: "", valeur_mobilier: "", assurance: "",
  lourds: "", lourds_detail: "", depart: ADRESSE_VIDE, arrivee: ADRESSE_VIDE, commentaire: "",
};

export function FormulaireMutation({ onBack }: { onBack: () => void }) {
  const [f, setF] = useState<Mutation>(MUTATION_VIDE);
  const [step, setStep] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [espace, setEspace] = useState<EspacePublic | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const set = (p: Partial<Mutation>) => setF((x) => ({ ...x, ...p }));
  // Retour et Avance du navigateur passent d'une étape à l'autre (voir historique.ts).
  const rembobiner = useEtapesDansLHistorique(step, setStep, fait !== null);

  // La société qui mute a peut-être son espace chez Bailly : on la reconnaît,
  // et la demande suit l'accord passé avec elle.
  const societe = f.societe.trim();
  useEffect(() => {
    if (societe.length < 3 || refus === societe) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/espaces/reconnaitre?nom=${encodeURIComponent(societe)}`);
        const j = await r.json();
        setEspace(j.espace ?? null);
      } catch {
        /* sans réseau, la demande part sans espace */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [societe, refus]);

  const marque: Marque | null = espace ? { nom: nomEnseigne(espace), logo: espace.logo } : null;
  const theme = espace ? themeEspace(espace.couleur) : undefined;

  const periodeOk = f.periode_mode === "date" ? !!f.periode : !!f.periode.trim();
  const manquant = (() => {
    switch (ETAPES_MUTATION[step].cle) {
      case "vous":
        if (!f.nom.trim()) return "Indiquez votre nom";
        if (!f.tel.trim()) return "Indiquez votre téléphone";
        if (!telephoneValide(f.tel)) return "Indiquez un téléphone valide";
        if (!emailValide(f.email)) return "Indiquez un e-mail valide";
        if (!societe) return "Indiquez l'entreprise qui vous mute";
        if (!periodeOk) return "Indiquez la période souhaitée";
        if (datePassee(f.periode_mode, f.periode)) return "Choisissez une date à venir";
        return null;
      case "depart":
        return adresseManquante(f.depart, "de départ");
      case "arrivee":
        return adresseManquante(f.arrivee, "d'arrivée");
      default:
        return null;
    }
  })();

  async function soumettre() {
    setEnvoi(true);
    setErreur(null);
    remonter();
    try {
      const id = await envoyer({
        client: { nom: [f.prenom, f.nom].filter(Boolean).join(" ").trim(), email: f.email, tel: f.tel || undefined },
        depart: versAdresse(f.depart),
        arrivee: versAdresse(f.arrivee),
        date_souhaitee: f.periode_mode === "date" ? f.periode || undefined : undefined,
        flexibilite: f.periode_mode === "date" ? undefined : f.periode || PERIODE_PAR_DEFAUT,
        type_client: "particulier",
        mutation_pro: true,
        societe: societe || undefined,
        valeur_mobilier: f.valeur_mobilier || undefined,
        assurance: f.assurance || undefined,
        articles_lourds: f.lourds === "oui",
        articles_lourds_detail: f.lourds === "oui" ? f.lourds_detail.trim() || undefined : undefined,
        commentaire: f.commentaire.trim() || undefined,
        details: {
          // Prénom et nom séparés : la fiche Créagidem les veut à part (lib/creagidem).
          contact: { prenom: f.prenom.trim(), nom: f.nom.trim() },
          parcours: "mutation",
          demenagement: f.demenagement || "complet",
          depart: detailAdresse(f.depart),
          arrivee: detailAdresse(f.arrivee),
        },
        espace: espace?.slug,
        espace_code: espace?.code,
      });
      setFait(id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible");
      setEnvoi(false);
    }
  }

  if (fait)
    return (
      <SuccessScreen
        id={fait}
        volume={null}
        marque={marque}
        theme={theme}
        message={
          espace
            ? messageFinDe(espace)
            : "Merci ! Votre demande est transmise à nos équipes. Un conseiller vous recontacte pour organiser la visite technique de votre logement, sur place ou en visio."
        }
      />
    );
  if (envoi) return <Envoi theme={theme} marque={marque} />;

  const garantie = GARANTIES.find((g) => g.key === f.assurance);

  return (
    <PasAPas
      etapes={ETAPES_MUTATION}
      step={step}
      setStep={setStep}
      manquant={manquant}
      envoi={envoi}
      onEnvoyer={soumettre}
      onBack={() => { rembobiner(); onBack(); }}
      marque={marque}
      theme={theme}
      recap={[
        ["Entreprise", societe || null],
        ["Trajet", trajetLisible(f.depart.ville, f.arrivee.ville)],
        ["Période", periodeOk ? (f.periode_mode === "date" ? new Date(f.periode).toLocaleDateString("fr-FR") : f.periode) : null],
      ]}
      entete={
        espace && step === 0 ? (
          <div className="animate-step-in mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border border-brand bg-brand-soft px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sur-brand">
              <Icone nom="immeuble" taille={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold">{nomEnseigne(espace)} travaille avec Bailly</div>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">
                Votre demande suit l&apos;accord passé avec votre entreprise.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setRefus(societe); setEspace(null); }}
              className="shrink-0 text-[12.5px] font-medium text-ink-soft underline-offset-4 transition hover:text-ink hover:underline"
            >
              Ce n&apos;est pas mon entreprise
            </button>
          </div>
        ) : null
      }
    >
      {ETAPES_MUTATION[step].cle === "vous" && (
        <div className="space-y-5">
          <Bloc icone="user" titre="Vos coordonnées" sous="Pour vous recontacter et organiser la visite.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom"><TextInput icone="user" value={f.prenom} onChange={(e) => set({ prenom: e.target.value })} placeholder="Camille" autoComplete="given-name" /></Field>
              <Field label="Nom *"><TextInput value={f.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Durand" autoComplete="family-name" /></Field>
              <Field label="Téléphone *"><TextInput icone="tel" type="tel" value={f.tel} onChange={(e) => set({ tel: e.target.value })} placeholder="06 12 34 56 78" autoComplete="tel" /></Field>
              <Field label="E-mail *"><TextInput icone="mail" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="camille.durand@email.fr" autoComplete="email" /></Field>
            </div>
          </Bloc>

          <Bloc icone="immeuble" titre="Votre mutation" sous="L'entreprise qui vous mute, et ce que vous emportez." delai={70}>
            <div className="space-y-5">
              <Field label="Par quelle entreprise êtes-vous muté(e) ? *">
                <TextInput icone="immeuble" value={f.societe} onChange={(e) => set({ societe: e.target.value })} placeholder="Nom de votre employeur" autoComplete="organization" />
              </Field>
              <Field groupe label="Déménagement complet ou partiel ?">
                <div className="sm:max-w-sm">
                  <Choice plein options={[["complet", "Complet"], ["partiel", "Partiel"]]} value={f.demenagement} onChange={(v) => set({ demenagement: v as Mutation["demenagement"] })} />
                </div>
              </Field>
              <ChampPeriode
                label="Période souhaitée *"
                mode={f.periode_mode}
                valeur={f.periode}
                onChange={(periode_mode, periode) => set({ periode_mode, periode })}
                exemple="Avant ma prise de poste, le 1er mars…"
              />
            </div>
          </Bloc>

          <Bloc icone="bouclier" titre="Votre garantie dommages" sous="La valeur de votre mobilier, et le niveau de garantie souhaité." delai={140}>
            <div className="space-y-5">
              <Field groupe label="Estimation de la valeur du mobilier" hint="facultatif">
                <div className="flex flex-wrap gap-2">
                  {VALEURS.map((v) => <Pill key={v} active={f.valeur_mobilier === v} onClick={() => set({ valeur_mobilier: v })}>{v}</Pill>)}
                </div>
              </Field>
              <Field groupe label="Garantie dommages souhaitée" hint="facultatif">
                <div className="grid gap-3 sm:grid-cols-2">
                  {GARANTIES.map((g) => (
                    <CarteChoix
                      key={g.key}
                      active={f.assurance === g.key}
                      onClick={() => set({ assurance: g.key })}
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

          <Bloc icone="poids" titre="Vos objets lourds" sous="Pour que l'équipe prévoie la bonne manutention." delai={210}>
            <Ligne label="Avez-vous des objets lourds ou particuliers ?" aide="Piano, coffre-fort, table en marbre, frigo américain, aquarium…">
              <YesNo value={f.lourds} onChange={(v) => set({ lourds: v })} />
            </Ligne>
            {f.lourds === "oui" && (
              <div className="animate-step-in pb-2">
                <Field label="Lesquels ?">
                  <TextInput value={f.lourds_detail} onChange={(e) => set({ lourds_detail: e.target.value })} placeholder="Un piano droit, une table en marbre…" />
                </Field>
              </div>
            )}
          </Bloc>
        </div>
      )}

      {ETAPES_MUTATION[step].cle === "depart" && (
        <AdresseFiche titre="L'adresse de départ" valeur={f.depart} onChange={(depart) => set({ depart })} />
      )}
      {ETAPES_MUTATION[step].cle === "arrivee" && (
        <AdresseFiche titre="L'adresse d'arrivée" valeur={f.arrivee} onChange={(arrivee) => set({ arrivee })} />
      )}

      {ETAPES_MUTATION[step].cle === "fin" && (
        <div className="space-y-5">
          <Bloc icone="message" titre="Vos commentaires" sous="Une contrainte, une question, un meuble hors norme : tout est utile.">
            <Zone rows={5} value={f.commentaire} onChange={(e) => set({ commentaire: e.target.value })} placeholder="Ce que nous devons savoir pour préparer votre déménagement…" />
          </Bloc>
          <Recapitulatif
            groupes={[
              {
                icone: "user",
                titre: "Vous",
                lignes: [
                  ["Contact", [f.prenom, f.nom].filter(Boolean).join(" ")],
                  ["Téléphone", f.tel],
                  ["E-mail", f.email],
                  ["Entreprise", societe],
                  ["Déménagement", f.demenagement === "partiel" ? "Partiel" : "Complet"],
                  ["Garantie", garantie ? `${garantie.titre}${f.valeur_mobilier ? ` · mobilier ${f.valeur_mobilier}` : ""}` : "à définir avec votre conseiller"],
                  ["Objets lourds", f.lourds === "oui" ? f.lourds_detail || "oui" : "aucun"],
                ],
              },
              {
                icone: "route",
                titre: "Votre trajet",
                lignes: [
                  ["Départ", adresseLisible(f.depart) ?? ""],
                  ["Logement", logementLisible(f.depart)],
                  ["Arrivée", adresseLisible(f.arrivee) ?? ""],
                  ["Logement", logementLisible(f.arrivee)],
                  ["Période", periodeOk ? (f.periode_mode === "date" ? new Date(f.periode).toLocaleDateString("fr-FR") : f.periode) : ""],
                ],
              },
            ]}
          />
          {erreur && <Erreur>{erreur}</Erreur>}
        </div>
      )}
    </PasAPas>
  );
}

/* ═══════════════════════════ L'entreprise ═══════════════════════════ */

/**
 * Le mobilier d'un petit transfert, avec un volume indicatif par pièce. Le
 * client ne voit que les quantités ; le volume ne sert qu'à l'équipe, pour
 * préparer son devis.
 */
const MOBILIER_BUREAU: { label: string; volume: number; icone: NomIcone }[] = [
  { label: "Bureaux", volume: 0.8, icone: "regle" },
  { label: "Caissons", volume: 0.15, icone: "carton" },
  { label: "Chaises et fauteuils", volume: 0.3, icone: "fauteuil" },
  { label: "Armoires", volume: 1.2, icone: "cle" },
  { label: "Tables de réunion", volume: 0.8, icone: "regle" },
  { label: "Photocopieurs et imprimantes", volume: 1, icone: "reglages" },
  { label: "Postes informatiques", volume: 0.15, icone: "eclair" },
  { label: "Cartons d'archives", volume: 0.06, icone: "carton" },
];

type Contact = { societe: string; nom: string; fonction: string; tel: string; email: string };
const CONTACT_VIDE: Contact = { societe: "", nom: "", fonction: "", tel: "", email: "" };

function contactManquant(c: Contact): string | null {
  if (!c.societe.trim()) return "Indiquez le nom de votre société";
  if (!c.nom.trim()) return "Indiquez votre nom";
  if (!c.tel.trim()) return "Indiquez votre téléphone";
  if (!telephoneValide(c.tel)) return "Indiquez un téléphone valide";
  if (!emailValide(c.email)) return "Indiquez un e-mail valide";
  return null;
}

function BlocContact({ valeur, onChange, delai = 0 }: { valeur: Contact; onChange: (c: Contact) => void; delai?: number }) {
  const set = (p: Partial<Contact>) => onChange({ ...valeur, ...p });
  return (
    <Bloc icone="immeuble" titre="Votre société" sous="Pour vous recontacter rapidement." delai={delai}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Société *"><TextInput icone="immeuble" value={valeur.societe} onChange={(e) => set({ societe: e.target.value })} placeholder="Raison sociale" autoComplete="organization" /></Field>
        <Field label="Votre nom *"><TextInput icone="user" value={valeur.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Camille Durand" autoComplete="name" /></Field>
        <Field label="Fonction" hint="facultatif"><TextInput value={valeur.fonction} onChange={(e) => set({ fonction: e.target.value })} placeholder="Office manager" autoComplete="organization-title" /></Field>
        <Field label="Téléphone *"><TextInput icone="tel" type="tel" value={valeur.tel} onChange={(e) => set({ tel: e.target.value })} placeholder="01 23 45 67 89" autoComplete="tel" /></Field>
        <div className="sm:col-span-2">
          <Field label="E-mail *"><TextInput icone="mail" type="email" value={valeur.email} onChange={(e) => set({ email: e.target.value })} placeholder="camille.durand@societe.fr" autoComplete="email" /></Field>
        </div>
      </div>
    </Bloc>
  );
}

/* ── Le petit transfert ── */

const ETAPES_TRANSFERT: Etape[] = [
  { cle: "societe", label: "Société", sous: "Contact et date", eyebrow: "Petit transfert", avant: "Votre ", accent: "société", apres: "", sub: "Qui vous êtes, et quand vous souhaitez déménager." },
  { cle: "adresses", label: "Adresses", sous: "Départ et arrivée", eyebrow: "Les adresses", avant: "D'où, et vers ", accent: "où", apres: " ?", sub: "Les locaux que vous quittez et ceux qui vous attendent." },
  { cle: "mobilier", label: "Mobilier", sous: "Ce que vous déménagez", eyebrow: "Le mobilier", avant: "Que ", accent: "déménagez-vous", apres: " ?", sub: "Indiquez les quantités : nous préparons votre devis à partir de là." },
];

function Compteur({ label, icone, valeur, onChange }: { label: string; icone: NomIcone; valeur: number; onChange: (n: number) => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 transition-colors duration-200 ${valeur > 0 ? "border-ink bg-brand-soft" : "border-line bg-card"}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${valeur > 0 ? "bg-[#1b1a18] text-brand-clair" : "bg-subtle text-ink-mid"}`}>
        <Icone nom={icone} taille={16} />
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug">{label}</span>
      <span className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(Math.max(0, valeur - 1))} aria-label={`Retirer : ${label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">−</button>
        <input
          type="number"
          min={0}
          value={valeur || ""}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
          placeholder="0"
          aria-label={label}
          className="h-8 w-12 rounded-lg border border-line bg-card text-center text-[14px] font-semibold tnum outline-none focus:border-ink"
        />
        <button type="button" onClick={() => onChange(valeur + 1)} aria-label={`Ajouter : ${label}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ink-mid transition hover:border-ink hover:text-ink active:scale-90">+</button>
      </span>
    </div>
  );
}

export function FormulaireTransfert({ onBack }: { onBack: () => void }) {
  const [contact, setContact] = useState<Contact>(CONTACT_VIDE);
  const [periodeMode, setPeriodeMode] = useState<PeriodeMode>("date");
  const [periode, setPeriode] = useState("");
  const [depart, setDepart] = useState<Adresse>(ADRESSE_VIDE);
  const [arrivee, setArrivee] = useState<Adresse>(ADRESSE_VIDE);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [lourds, setLourds] = useState<YN>("");
  const [lourdsDetail, setLourdsDetail] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [step, setStep] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const rembobiner = useEtapesDansLHistorique(step, setStep, fait !== null);

  const pieces = MOBILIER_BUREAU.filter((m) => (quantites[m.label] ?? 0) > 0);
  const total = pieces.reduce((s, m) => s + (quantites[m.label] ?? 0), 0);

  const manquant = (() => {
    switch (ETAPES_TRANSFERT[step].cle) {
      case "societe":
        return contactManquant(contact) ?? (datePassee(periodeMode, periode) ? "Choisissez une date à venir" : null);
      case "adresses":
        return adresseManquante(depart, "de départ", true) ?? adresseManquante(arrivee, "d'arrivée", true);
      default:
        return total > 0 || commentaire.trim() ? null : "Indiquez au moins un élément, ou décrivez-le en commentaire";
    }
  })();

  async function soumettre() {
    setEnvoi(true);
    setErreur(null);
    remonter();
    try {
      const id = await envoyer({
        client: { nom: contact.nom.trim(), email: contact.email, tel: contact.tel || undefined },
        type_client: "entreprise",
        societe: contact.societe.trim(),
        depart: versAdresse(depart),
        arrivee: versAdresse(arrivee),
        date_souhaitee: periodeMode === "date" ? periode || undefined : undefined,
        flexibilite: periodeMode === "date" ? (periode ? undefined : PERIODE_PAR_DEFAUT) : periode || PERIODE_PAR_DEFAUT,
        volume: pieces.length
          ? { method: "list", items: pieces.map((m) => ({ label: m.label, quantite: quantites[m.label], volume_unitaire_m3: m.volume })) }
          : undefined,
        articles_lourds: lourds === "oui",
        articles_lourds_detail: lourds === "oui" ? lourdsDetail.trim() || undefined : undefined,
        commentaire: commentaire.trim() || undefined,
        details: {
          parcours: "entreprise",
          transfert: "simple",
          fonction: contact.fonction.trim() || undefined,
          depart: detailAdresse(depart),
          arrivee: detailAdresse(arrivee),
        },
      });
      setFait(id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible");
      setEnvoi(false);
    }
  }

  if (fait)
    return (
      <SuccessScreen
        id={fait}
        volume={null}
        message="Merci ! Votre demande de transfert est transmise à nos équipes. Un conseiller vous recontacte rapidement pour établir votre devis."
      />
    );
  if (envoi) return <Envoi />;

  return (
    <PasAPas
      etapes={ETAPES_TRANSFERT}
      step={step}
      setStep={setStep}
      manquant={manquant}
      envoi={envoi}
      onEnvoyer={soumettre}
      onBack={() => { rembobiner(); onBack(); }}
      recap={[
        ["Société", contact.societe.trim() || null],
        ["Trajet", trajetLisible(depart.ville, arrivee.ville)],
        ["Mobilier", total > 0 ? `${total} élément${total > 1 ? "s" : ""}` : null],
      ]}
    >
      {ETAPES_TRANSFERT[step].cle === "societe" && (
        <div className="space-y-5">
          <BlocContact valeur={contact} onChange={setContact} />
          <Bloc icone="calendrier" titre="Votre date" sous="Une date, une période, ou vos propres mots." delai={70}>
            <ChampPeriode
              label="Quand souhaitez-vous déménager ?"
              mode={periodeMode}
              valeur={periode}
              onChange={(m, v) => { setPeriodeMode(m); setPeriode(v); }}
              exemple="Un week-end de mars, avant la fin du bail…"
            />
          </Bloc>
        </div>
      )}
      {ETAPES_TRANSFERT[step].cle === "adresses" && (
        <div className="space-y-5">
          <AdresseFiche titre="Les locaux de départ" valeur={depart} onChange={setDepart} locaux />
          <AdresseFiche titre="Les locaux d'arrivée" valeur={arrivee} onChange={setArrivee} locaux />
        </div>
      )}
      {ETAPES_TRANSFERT[step].cle === "mobilier" && (
        <div className="space-y-5">
          <Bloc icone="liste" titre="Votre mobilier" sous="Les quantités, à l'unité près : inutile d'être exact au carton.">
            <div className="grid gap-3 sm:grid-cols-2">
              {MOBILIER_BUREAU.map((m) => (
                <Compteur key={m.label} label={m.label} icone={m.icone} valeur={quantites[m.label] ?? 0} onChange={(n) => setQuantites((q) => ({ ...q, [m.label]: n }))} />
              ))}
            </div>
          </Bloc>
          <Bloc icone="poids" titre="Le matériel particulier" sous="Ce qui change la manutention." delai={70}>
            <Ligne label="Avez-vous du matériel lourd ou particulier ?" aide="Coffre-fort, machine, baie informatique, imprimante de production…">
              <YesNo value={lourds} onChange={setLourds} />
            </Ligne>
            {lourds === "oui" && (
              <div className="animate-step-in pb-2">
                <Field label="Lequel ?">
                  <TextInput value={lourdsDetail} onChange={(e) => setLourdsDetail(e.target.value)} placeholder="Un coffre-fort, un traceur grand format…" />
                </Field>
              </div>
            )}
          </Bloc>
          <Bloc icone="message" titre="Vos commentaires" sous="Ce que nous devons savoir d'autre." delai={140}>
            <Zone rows={4} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Accès, horaires, contraintes de l'immeuble…" />
          </Bloc>
          {erreur && <Erreur>{erreur}</Erreur>}
        </div>
      )}
    </PasAPas>
  );
}

/* ── Le projet important ── */

const ETAPES_PROJET: Etape[] = [
  { cle: "projet", label: "Projet", sous: "En quelques lignes", eyebrow: "Projet de transfert", avant: "Votre ", accent: "projet", apres: "", sub: "Quelques lignes suffisent : nous vous rappelons pour en parler." },
  { cle: "contact", label: "Contact", sous: "Pour vous rappeler", eyebrow: "Vos coordonnées", avant: "Comment vous ", accent: "joindre", apres: " ?", sub: "Qui appeler, et le moment qui vous convient." },
];

const RENDEZ_VOUS: { key: string; titre: string; texte: string; icone: NomIcone }[] = [
  { key: "visite", titre: "Une visite sur place", texte: "Un conseiller vient voir vos locaux.", icone: "pin" },
  { key: "visio", titre: "Une visio", texte: "Vous nous montrez vos locaux à distance.", icone: "photo" },
  { key: "appel", titre: "Un appel d'abord", texte: "Vous préférez en parler au téléphone.", icone: "tel" },
];

export function FormulaireProjet({ onBack }: { onBack: () => void }) {
  const [description, setDescription] = useState("");
  const [villeDepart, setVilleDepart] = useState({ ville: "", code_postal: "" });
  const [villeArrivee, setVilleArrivee] = useState({ ville: "", code_postal: "" });
  const [postes, setPostes] = useState("");
  const [surface, setSurface] = useState("");
  const [periodeMode, setPeriodeMode] = useState<PeriodeMode>("suggestion");
  const [periode, setPeriode] = useState("");
  const [contact, setContact] = useState<Contact>(CONTACT_VIDE);
  const [rendezVous, setRendezVous] = useState("");
  const [creneau, setCreneau] = useState("");
  const [step, setStep] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const rembobiner = useEtapesDansLHistorique(step, setStep, fait !== null);

  const manquant = (() => {
    if (ETAPES_PROJET[step].cle === "projet") {
      if (description.trim().length < 10) return "Décrivez votre projet en quelques mots";
      if (!villeDepart.ville.trim()) return "Indiquez la ville de départ";
      if (!villeArrivee.ville.trim()) return "Indiquez la ville d'arrivée";
      if (datePassee(periodeMode, periode)) return "Choisissez une date à venir";
      return null;
    }
    return contactManquant(contact);
  })();

  async function soumettre() {
    setEnvoi(true);
    setErreur(null);
    remonter();
    const rdv = RENDEZ_VOUS.find((r) => r.key === rendezVous);
    try {
      const id = await envoyer({
        client: { nom: contact.nom.trim(), email: contact.email, tel: contact.tel || undefined },
        type_client: "entreprise",
        societe: contact.societe.trim(),
        depart: { ville: villeDepart.ville || undefined, code_postal: villeDepart.code_postal || undefined },
        arrivee: { ville: villeArrivee.ville || undefined, code_postal: villeArrivee.code_postal || undefined },
        date_souhaitee: periodeMode === "date" ? periode || undefined : undefined,
        flexibilite: periodeMode === "date" ? (periode ? undefined : PERIODE_PAR_DEFAUT) : periode || PERIODE_PAR_DEFAUT,
        commentaire: description.trim(),
        details: {
          parcours: "entreprise",
          transfert: "projet",
          fonction: contact.fonction.trim() || undefined,
          postes: postes ? parseInt(postes, 10) : undefined,
          surface_locaux: surface ? parseFloat(surface) : undefined,
          rendez_vous: rdv?.titre,
          // Le créneau va au tableau des rappels : c'est lui que l'équipe lit.
          creneau: [rdv?.titre, creneau].filter(Boolean).join(" · ") || undefined,
        },
      });
      setFait(id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible");
      setEnvoi(false);
    }
  }

  if (fait)
    return (
      <SuccessScreen
        id={fait}
        volume={null}
        message="Merci ! Votre projet est transmis à nos équipes. Un conseiller vous rappelle rapidement pour organiser la suite."
      />
    );
  if (envoi) return <Envoi />;

  return (
    <PasAPas
      etapes={ETAPES_PROJET}
      step={step}
      setStep={setStep}
      manquant={manquant}
      envoi={envoi}
      onEnvoyer={soumettre}
      onBack={() => { rembobiner(); onBack(); }}
      recap={[
        ["Trajet", trajetLisible(villeDepart.ville, villeArrivee.ville)],
        ["Postes", postes ? postes : null],
        ["Société", contact.societe.trim() || null],
      ]}
    >
      {ETAPES_PROJET[step].cle === "projet" && (
        <div className="space-y-5">
          <Bloc icone="crayon" titre="Votre projet" sous="Machines, archives, plusieurs sites, contraintes de calendrier : dites-le simplement.">
            <Zone rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nous déménageons notre siège de 80 postes, avec 40 mètres linéaires d'archives et un atelier…" />
          </Bloc>
          <Bloc icone="route" titre="Le trajet" sous="Les villes suffisent : les adresses viendront ensuite." delai={70}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ville de départ *">
                <AddressInput kind="municipality" value={villeDepart.ville} placeholder="Paris" onChange={(v) => setVilleDepart({ ville: v, code_postal: "" })} onSelect={(p) => setVilleDepart({ ville: p.ville, code_postal: p.code_postal })} />
              </Field>
              <Field label="Ville d'arrivée *">
                <AddressInput kind="municipality" value={villeArrivee.ville} placeholder="Lyon" onChange={(v) => setVilleArrivee({ ville: v, code_postal: "" })} onSelect={(p) => setVilleArrivee({ ville: p.ville, code_postal: p.code_postal })} />
              </Field>
            </div>
          </Bloc>
          <Bloc icone="immeuble" titre="L'ampleur" sous="Un ordre de grandeur suffit." delai={140}>
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre de postes de travail" hint="facultatif">
                  <TextInput type="number" min={0} value={postes} onChange={(e) => setPostes(e.target.value)} placeholder="25" />
                </Field>
                <Field label="Surface des locaux" hint="facultatif">
                  <TextInput type="number" min={0} unite="m²" value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="400" />
                </Field>
              </div>
              <ChampPeriode
                label="Quand ?"
                mode={periodeMode}
                valeur={periode}
                onChange={(m, v) => { setPeriodeMode(m); setPeriode(v); }}
                exemple="Au second semestre, à la fin du bail…"
              />
            </div>
          </Bloc>
        </div>
      )}
      {ETAPES_PROJET[step].cle === "contact" && (
        <div className="space-y-5">
          <BlocContact valeur={contact} onChange={setContact} />
          <Bloc icone="calendrier" titre="La suite" sous="Comment préférez-vous avancer ?" delai={70}>
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {RENDEZ_VOUS.map((r) => (
                  <CarteChoix key={r.key} active={rendezVous === r.key} onClick={() => setRendezVous(r.key)} icone={r.icone} titre={r.titre} texte={r.texte} />
                ))}
              </div>
              <Field groupe label="Le meilleur moment pour vous joindre" hint="facultatif">
                <div className="sm:max-w-md">
                  <Choice plein options={[["Le matin", "Le matin"], ["L'après-midi", "L'après-midi"], ["Indifférent", "Indifférent"]]} value={creneau} onChange={setCreneau} />
                </div>
              </Field>
            </div>
          </Bloc>
          {erreur && <Erreur>{erreur}</Erreur>}
        </div>
      )}
    </PasAPas>
  );
}
