"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { FORMULES, PRESTATIONS, type Acteur, type Formule } from "@/lib/pricing/grille";
import { Choice, Icone, Radio, type NomIcone } from "./ui";

export type Presta = "moi" | "bailly" | "";
export type Prestations = {
  fragile: Presta;
  embNonFragile: Presta;
  debNonFragile: Presta;
  demontage: Presta;
  transport: Presta;
};

/** Les cinq lignes que le client peut reprendre à la main. */
export const LIGNES_CARTE: { key: keyof Prestations; label: string }[] = [
  { key: "fragile", label: "Emballage et déballage du fragile" },
  { key: "embNonFragile", label: "Emballage du non fragile" },
  { key: "debNonFragile", label: "Déballage du non fragile" },
  { key: "demontage", label: "Démontage et remontage du mobilier" },
  { key: "transport", label: "Transport de meubles uniquement" },
];

type Classe = {
  key: Formule;
  /** Le nom tient sur un écran de téléphone. */
  court: string;
  accroche: string;
  /** Ce qui reste au client, dit en une phrase. */
  reste: string;
  icone: NomIcone;
  vedette?: boolean;
  prestations: Prestations;
};

const CLASSES: Classe[] = [
  {
    key: "eco",
    court: "Éco",
    accroche: "Vous emballez, nous transportons",
    reste: "Vous faites vos cartons, et vous les déballez à l'arrivée.",
    icone: "carton",
    prestations: { fragile: "moi", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  },
  {
    key: "standard",
    court: "Standard",
    accroche: "Nous emballons le fragile",
    reste: "Vous emballez le non fragile : vêtements, livres, cuisine.",
    icone: "verre",
    vedette: true,
    prestations: { fragile: "bailly", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  },
  {
    key: "luxe",
    court: "Premium",
    accroche: "Vous n'avez rien à toucher",
    reste: "Il ne vous reste que les branchements, les lustres et les cadres.",
    icone: "couronne",
    prestations: { fragile: "bailly", embNonFragile: "bailly", debNonFragile: "bailly", demontage: "bailly", transport: "moi" },
  },
];

const CLES = CLASSES.map((c) => c.key);
const NOM = Object.fromEntries(FORMULES.map((f) => [f.key, f.label])) as Record<Formule, string>;

type LigneGrille = (typeof PRESTATIONS)[number]["lignes"][number];
const LIGNES: LigneGrille[] = PRESTATIONS.flatMap((c) => c.lignes);
const TOTAL = LIGNES.length;
/** Le nombre de gestes que Bailly prend en charge — lu dans la grille, jamais recopié. */
const compte = (lignes: LigneGrille[], k: Formule) => lignes.filter((l) => l[k] === "Bailly").length;

/* Les intitulés de la grille sont ceux d'un tableur ; ceux-ci se lisent mieux. */
const TITRE_CATEGORIE: Record<string, string> = {
  "Mise à disposition cartons - Emballages": "Cartons et emballage",
  "Transport - Manutention": "Transport et manutention",
  "Déballage de chaque objet": "Déballage à l'arrivée",
};

const GRILLE = "grid grid-cols-[var(--lab)_repeat(3,minmax(0,1fr))]";

/** Ce que les cinq cases disent du choix du client. */
export function formuleRetenue(p: Prestations): Formule | "transport" | "carte" | null {
  if (p.transport === "bailly") return "transport";
  const cles = Object.keys(p) as (keyof Prestations)[];
  if (cles.every((k) => p[k] === "")) return null;
  const classe = CLASSES.find((c) => cles.every((k) => c.prestations[k] === p[k]));
  return classe ? classe.key : "carte";
}

export function nomFormule(p: Prestations): string | null {
  const choix = formuleRetenue(p);
  if (choix === null) return null;
  if (choix === "transport") return "Transport seul";
  if (choix === "carte") return "Sur mesure";
  return NOM[choix];
}

/**
 * Le choix de la formule, comme on choisit une classe de voyage.
 *
 * Céline : « il faut changer cette étape et faire des colonnes, le client
 * sélectionne celle qu'il choisit — comme pour le choix d'une catégorie
 * d'avion. Je trouve ça plus lisible. »
 *
 * Trois onglets posés sur la photo, et sous chacun sa colonne : les
 * trente-cinq gestes de la grille « Catégories prestations », un par ligne.
 * La colonne retenue s'allume de haut en bas. La formule se lit toujours dans
 * les cinq cases du formulaire : rien d'autre n'est stocké.
 */
export default function ChoixFormule({
  value,
  onChange,
}: {
  value: Prestations;
  onChange: (p: Prestations) => void;
}) {
  const choix = formuleRetenue(value);
  const index = CLASSES.findIndex((c) => c.key === choix);
  const transportSeul = choix === "transport";

  const [fermees, setFermees] = useState<Record<string, boolean>>({});
  const [differences, setDifferences] = useState(false);
  const [carte, setCarte] = useState(false);
  const [survol, setSurvol] = useState<number | null>(null);

  const choisir = (i: number) => onChange({ ...CLASSES[i].prestations });

  /** Ce que le choix veut dire, quel qu'il soit — y compris quand il n'y en a pas. */
  const resume: { icone: NomIcone; titre: string; texte: string } =
    index >= 0
      ? {
          icone: CLASSES[index].icone,
          titre: `Formule ${NOM[CLASSES[index].key]} retenue`,
          texte: `${compte(LIGNES, CLASSES[index].key)} gestes sur ${TOTAL} pris en charge par nos équipes. ${CLASSES[index].reste}`,
        }
      : choix === "transport"
        ? {
            icone: "camion",
            titre: "Transport seul retenu",
            texte: "Vous préparez tout : nous chargeons, transportons et déchargeons.",
          }
        : choix === "carte"
          ? {
              icone: "reglages",
              titre: "Formule sur mesure",
              texte: "Vos choix à la carte sont enregistrés, ligne par ligne.",
            }
          : {
              icone: "info",
              titre: "Aucune formule retenue pour l'instant",
              texte: "Cliquez sur une colonne du tableau pour choisir la vôtre.",
            };

  /** La place d'une colonne dans le tableau, en retrait de la marge des onglets. */
  const colonne = (i: number): CSSProperties => ({
    left: `calc(var(--lab) + (100% - var(--lab)) / 3 * ${i} + var(--marge))`,
    width: "calc((100% - var(--lab)) / 3 - 2 * var(--marge))",
  });

  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Formule de déménagement"
        className="bloc reveal relative overflow-clip rounded-[28px] border border-line bg-card [--lab:34%] [--marge:3px] sm:[--marge:6px] lg:[--lab:36%] xl:[--lab:40%]"
      >
        {/* ── L'en-tête : la photo, et les trois classes posées dessus ── */}
        {/* « clip », pas « hidden » : un cadre en overflow hidden reste défilable
            par programme. Le bas des onglets y dépasse de 12 px ; au premier
            focus, le navigateur faisait défiler l'en-tête pour les montrer en
            entier, et tout sautait de 12 px. Un cadre « clip » ne défile jamais. */}
        <div className="grain relative overflow-clip rounded-t-[27px] bg-[#1b1a18]">
          <Image
            src="/login-interieur.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 960px, 100vw"
            className="object-cover object-center opacity-60"
          />
          <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/80 via-[#1b1a18]/55 to-[#1b1a18]/92" />
          <div
            className="halo drift absolute -left-28 -top-28 h-[380px] w-[380px]"
            style={{ "--halo": "rgba(245,208,51,0.26)" } as CSSProperties}
          />
          <div
            className="halo absolute -right-24 bottom-[-160px] h-[340px] w-[340px]"
            style={{ "--halo": "rgba(255,255,255,0.1)" } as CSSProperties}
          />

          <div className="relative z-10 grid grid-cols-3 items-end px-2 pb-3 pt-6 sm:grid-cols-[var(--lab)_repeat(3,minmax(0,1fr))] sm:px-0 sm:pb-0 sm:pt-8">
            <div className="col-span-3 px-2 pb-6 sm:col-span-1 sm:self-center sm:pb-8 sm:pl-7 sm:pr-5">
              <p className="eyebrow text-brand">Trois formules</p>
              <p className="font-serif mt-2.5 text-[22px] leading-[1.1] text-white xl:text-[25px]">
                Choisissez votre niveau de service
              </p>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/62">
                Comme une classe de voyage : cliquez sur une colonne pour la retenir.
              </p>
            </div>

            {CLASSES.map((c, i) => (
              <Onglet
                key={c.key}
                classe={c}
                actif={index === i}
                attenue={index >= 0 && index !== i}
                onClick={() => choisir(i)}
              />
            ))}
          </div>
        </div>

        {/* ── Le tableau : un geste par ligne, une formule par colonne ── */}
        <div className="relative" onMouseLeave={() => setSurvol(null)}>
          {survol != null && survol !== index && (
            // Au doigt, un survol ne se termine jamais : la colonne resterait grisée.
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 hidden bg-ink/[0.04] [@media(hover:hover)]:block"
              style={colonne(survol)}
            />
          )}
          {/* La colonne retenue : un voile jaune qui glisse d'une formule à l'autre. */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 z-10 rounded-b-[18px] border-x-2 border-b-2 border-brand bg-brand/14 transition-[left,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              index < 0 ? "opacity-0" : "opacity-100"
            }`}
            style={colonne(Math.max(index, 0))}
          />

          {/* Les noms restent en vue pendant qu'on fait défiler les lignes. */}
          <div className={`${GRILLE} sticky top-[3px] z-20 items-stretch border-b border-line bg-card`}>
            <div className="flex items-center px-3 py-2.5 sm:px-7">
              <button
                type="button"
                role="switch"
                aria-checked={differences}
                onClick={() => setDifferences((v) => !v)}
                className="inline-flex items-center gap-2.5 text-left"
              >
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                    differences ? "bg-ink" : "bg-line-strong"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-[left] duration-200 ${
                      differences ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
                <span className="text-[11.5px] font-medium leading-tight text-ink-mid sm:text-[12.5px]">
                  Différences seulement
                </span>
              </button>
            </div>
            {CLASSES.map((c, i) => (
              <button
                key={c.key}
                type="button"
                tabIndex={-1}
                onClick={() => choisir(i)}
                onMouseEnter={() => setSurvol(i)}
                className="px-[var(--marge)]"
              >
                <span
                  className={`flex h-full items-center justify-center py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors duration-300 sm:text-[12px] ${
                    index === i ? "bg-brand text-[#1b1a18]" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <span className="sm:hidden">{c.court}</span>
                  <span className="hidden sm:inline">{NOM[c.key]}</span>
                </span>
              </button>
            ))}
          </div>

          {PRESTATIONS.map((cat) => {
            const ouverte = !fermees[cat.categorie];
            const lignes = differences
              ? cat.lignes.filter((l) => !(l.eco === l.standard && l.standard === l.luxe))
              : cat.lignes;
            return (
              <div key={cat.categorie} className="border-t border-line first:border-t-0">
                <div className={`${GRILLE} items-stretch bg-subtle`}>
                  <button
                    type="button"
                    aria-expanded={ouverte}
                    onClick={() => setFermees((f) => ({ ...f, [cat.categorie]: ouverte }))}
                    className="flex items-center gap-2 px-3 py-3 text-left sm:gap-2.5 sm:px-7"
                  >
                    <Icone
                      nom="chevron"
                      taille={15}
                      trait={2.4}
                      className={`shrink-0 text-ink-soft transition-transform duration-300 ${ouverte ? "" : "-rotate-90"}`}
                    />
                    <span className="text-[11px] font-bold uppercase leading-tight tracking-[0.07em] text-ink sm:text-[12px]">
                      {TITRE_CATEGORIE[cat.categorie] ?? cat.categorie}
                    </span>
                  </button>
                  {CLES.map((k, i) => {
                    const n = compte(cat.lignes, k);
                    return (
                      <div
                        key={k}
                        onClick={() => choisir(i)}
                        onMouseEnter={() => setSurvol(i)}
                        className="flex cursor-pointer flex-col items-center justify-center gap-1.5 py-2.5"
                      >
                        <span className="text-[11.5px] font-semibold leading-none tnum text-ink">
                          {n}
                          <span className="font-normal text-ink-soft">/{cat.lignes.length}</span>
                        </span>
                        <span className="h-1 w-8 overflow-hidden rounded-full bg-line-strong sm:w-12">
                          <span
                            className="block h-full rounded-full bg-ink"
                            style={{ width: `${(n / cat.lignes.length) * 100}%` }}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div
                  className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    ouverte ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden" inert={!ouverte}>
                    {lignes.length === 0 ? (
                      <p className="border-t border-line/70 px-3 py-3 text-[12.5px] text-ink-soft sm:px-7">
                        Identique dans les trois formules.
                      </p>
                    ) : (
                      lignes.map((l) => (
                        <div
                          key={l.label}
                          className={`${GRILLE} items-stretch border-t border-line/70 transition-colors duration-150 hover:bg-subtle/70`}
                        >
                          <div className="flex items-center px-3 py-2.5 text-[12.5px] leading-snug sm:px-7 sm:py-3 sm:text-[13.5px]">
                            {l.label}
                          </div>
                          {CLES.map((k, i) => (
                            <div
                              key={k}
                              onClick={() => choisir(i)}
                              onMouseEnter={() => setSurvol(i)}
                              className="flex cursor-pointer items-center justify-center py-2"
                            >
                              <Cellule acteur={l[k]} retenue={index === i} />
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Le pied : la légende, et un bouton sous chaque colonne. */}
          <div className={`${GRILLE} items-center border-t border-line`}>
            <div className="px-3 py-4 text-[11.5px] leading-relaxed text-ink-soft sm:px-7 sm:text-[12.5px]">
              <span className="inline-flex items-center gap-1.5 align-middle">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[#1b1a18]">
                  <Icone nom="check" taille={9} trait={3.6} />
                </span>
                pris en charge par Bailly
              </span>
              <span className="mx-1.5">·</span>
              <span className="font-semibold text-ink-mid">Vous</span> : reste à votre charge
            </div>
            {CLASSES.map((c, i) => (
              <div key={c.key} className="px-[calc(var(--marge)+5px)] py-4">
                <button
                  type="button"
                  onClick={() => choisir(i)}
                  onMouseEnter={() => setSurvol(i)}
                  aria-label={`Choisir la formule ${NOM[c.key]}`}
                  className={`h-9 w-full rounded-full text-[11.5px] font-semibold transition-[background-color,border-color,color,transform] duration-200 active:scale-95 sm:h-10 sm:text-[12.5px] ${
                    index === i
                      ? "bg-[#1b1a18] text-brand"
                      : "border border-line-strong bg-card text-ink hover:border-ink"
                  }`}
                >
                  {index === i ? "Choisie" : "Choisir"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Ce que le choix veut dire, en une phrase ──
          Le bandeau est toujours présent, à hauteur constante : s'il
          n'apparaissait qu'au premier clic, il repoussait tout ce qui suit. */}
      <div
        aria-live="polite"
        className={`flex min-h-[86px] items-center gap-4 rounded-[22px] border px-4 py-4 transition-colors duration-300 sm:px-5 ${
          choix ? "border-brand bg-brand-soft" : "border-dashed border-line-strong bg-transparent"
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors duration-300 ${
            choix ? "bg-[#1b1a18] text-brand" : "bg-subtle text-ink-soft"
          }`}
        >
          <Icone nom={resume.icone} taille={20} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight">{resume.titre}</div>
          <div className="mt-1 text-[13px] leading-snug text-ink-mid">{resume.texte}</div>
        </div>
      </div>

      {/* ── La quatrième voie : le transport, et rien d'autre ── */}
      <button
        type="button"
        aria-pressed={transportSeul}
        onClick={() =>
          onChange(
            transportSeul
              ? { ...CLASSES[1].prestations }
              : { fragile: "moi", embNonFragile: "moi", debNonFragile: "moi", demontage: "moi", transport: "bailly" },
          )
        }
        className={`reveal group flex w-full items-center gap-4 rounded-[22px] border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-300 active:scale-[0.99] sm:p-5 ${
          transportSeul
            ? "border-ink bg-brand-soft shadow-[inset_0_0_0_1px_var(--color-ink)]"
            : "border-line bg-card hover:-translate-y-0.5 hover:border-ink-soft hover:shadow-[0_18px_34px_-26px_rgba(27,26,24,0.5)]"
        }`}
        style={{ "--d": "120ms" } as CSSProperties}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors duration-300 ${
            transportSeul ? "bg-[#1b1a18] text-brand" : "bg-subtle text-ink-mid"
          }`}
        >
          <Icone nom="camion" taille={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight">Transport de meubles uniquement</span>
          <span className="mt-1 block text-[13px] leading-snug text-ink-soft">
            Ni emballage, ni démontage — vous préparez tout, nous chargeons, transportons et déchargeons.
          </span>
        </span>
        <Radio on={transportSeul} />
      </button>

      {/* ── À la carte : partir d'une formule, puis reprendre une ligne ── */}
      <div
        className="reveal rounded-[22px] border border-line bg-card"
        style={{ "--d": "180ms" } as CSSProperties}
      >
        <button
          type="button"
          aria-expanded={carte}
          onClick={() => setCarte((v) => !v)}
          className="flex w-full items-center gap-4 p-4 text-left sm:p-5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-subtle text-ink-mid">
            <Icone nom="reglages" taille={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-tight">
              Ajuster à la carte
              {choix === "carte" && (
                <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1b1a18]">
                  Sur mesure
                </span>
              )}
            </span>
            <span className="mt-1 block text-[13px] leading-snug text-ink-soft">
              Partez d&apos;une formule, puis reprenez la main sur une ligne.
            </span>
          </span>
          <Icone
            nom="chevron"
            taille={18}
            trait={2.2}
            className={`shrink-0 text-ink-soft transition-transform duration-300 ${carte ? "rotate-180" : ""}`}
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            carte ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden" inert={!carte}>
            <div className="divide-y divide-line border-t border-line px-4 sm:px-5">
              {LIGNES_CARTE.map((p) => {
                // Transporter les meubles seuls exclut tout emballage et tout
                // démontage : les quatre lignes du dessus n'ont plus de sens.
                const eteinte = transportSeul && p.key !== "transport";
                return (
                  <div
                    key={p.key}
                    aria-disabled={eteinte}
                    className={`grid items-center gap-2.5 py-3.5 transition-opacity sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 ${
                      eteinte ? "pointer-events-none opacity-40" : ""
                    }`}
                  >
                    <div className="text-[14px] font-medium leading-snug">
                      {p.label}
                      {eteinte && (
                        <span className="mt-0.5 block text-[12px] font-normal text-ink-soft">
                          sans objet : vous n&apos;avez demandé que le transport
                        </span>
                      )}
                    </div>
                    <Choice
                      options={[
                        ["moi", "Je m'en occupe"],
                        ["bailly", "Bailly"],
                      ]}
                      value={eteinte ? "moi" : value[p.key]}
                      onChange={(v) => onChange({ ...value, [p.key]: v as Presta })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Un onglet de l'en-tête : translucide sur la photo, plein et doré une fois retenu. */
function Onglet({
  classe,
  actif,
  attenue,
  onClick,
}: {
  classe: Classe;
  actif: boolean;
  /** Une autre formule est retenue : celle-ci s'efface un peu. */
  attenue: boolean;
  onClick: () => void;
}) {
  const n = compte(LIGNES, classe.key);
  return (
    // L'onglet monte par une translation, jamais par sa hauteur : agrandir la
    // carte au survol poussait tout le tableau de quelques pixels, et l'écran
    // tremblait dès que la souris passait d'une formule à l'autre. La place
    // est réservée une fois pour toutes ; le bas de la carte, plus long de
    // 12 px, est coupé par l'en-tête tant qu'elle n'est pas retenue.
    <div
      className={`relative px-[var(--marge)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        actif ? "" : "sm:translate-y-3 sm:hover:translate-y-2"
      }`}
    >
      {classe.vedette && (
        <span
          className={`absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] shadow-lg shadow-black/30 transition-colors duration-300 sm:text-[9.5px] ${
            actif ? "bg-[#1b1a18] text-brand" : "bg-brand text-[#1b1a18]"
          }`}
        >
          Le plus choisi
        </span>
      )}
      <button
        type="button"
        role="radio"
        aria-checked={actif}
        onClick={onClick}
        className={`group relative flex w-full flex-col overflow-hidden rounded-[18px] border px-2.5 pb-3 pt-4 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white transition-[background-color,border-color,box-shadow,opacity,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:brightness-95 sm:rounded-b-none sm:border-b-0 sm:px-3.5 sm:pb-8 sm:pt-5 xl:px-4 ${
          actif
            ? "border-[#ffe680] bg-linear-to-b from-[#ffe45e] via-brand to-[#efc52b] text-[#1b1a18] shadow-[0_-20px_54px_-14px_rgba(245,208,51,0.7)]"
            : `border-white/18 bg-linear-to-b from-white/18 to-white/6 text-white hover:from-white/28 hover:to-white/12 ${
                attenue ? "opacity-80 hover:opacity-100" : ""
              }`
        }`}
      >
        {actif && <span aria-hidden className="eclat" />}

        <span
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-300 sm:h-10 sm:w-10 sm:rounded-[14px] ${
            actif ? "bg-[#1b1a18] text-brand" : "bg-white/14 text-white"
          }`}
        >
          <Icone nom={classe.icone} taille={18} />
        </span>

        <span className="font-serif mt-3 block text-[13px] leading-tight sm:text-[14px] xl:text-[17px]">
          {NOM[classe.key]}
        </span>
        <span
          className={`mt-1 hidden min-h-[2.75em] text-[12px] leading-snug sm:block ${
            actif ? "text-[#1b1a18]/75" : "text-white/70"
          }`}
        >
          {classe.accroche}
        </span>

        <span className="mt-3 flex items-baseline gap-1">
          <span className="font-serif text-[20px] leading-none tnum sm:text-[25px]">{n}</span>
          <span className={`text-[10.5px] sm:text-[11.5px] ${actif ? "text-[#1b1a18]/70" : "text-white/55"}`}>
            / {TOTAL} gestes
          </span>
        </span>
        <span className={`mt-2 block h-1.5 overflow-hidden rounded-full ${actif ? "bg-[#1b1a18]/15" : "bg-white/14"}`}>
          <span
            className={`block h-full rounded-full ${actif ? "bg-[#1b1a18]" : "bg-brand"}`}
            style={{ width: `${(n / TOTAL) * 100}%` }}
          />
        </span>

        <span
          className={`mt-3.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-full text-[11.5px] font-semibold transition-colors duration-300 sm:h-9 sm:text-[12.5px] ${
            actif
              ? "bg-[#1b1a18] text-brand"
              : "border border-white/28 text-white group-hover:border-white/60 group-hover:bg-white/10"
          }`}
        >
          {actif ? (
            <>
              <span className="relative inline-flex">
                <span className="onde absolute inset-0 rounded-full" />
                <Icone nom="check" taille={13} trait={3.2} className="coche-pop" />
              </span>
              Choisie
            </>
          ) : (
            "Choisir"
          )}
        </span>
      </button>
    </div>
  );
}

/** Une case du tableau : la coche de Bailly, ou « Vous ». */
function Cellule({ acteur, retenue }: { acteur: Acteur; retenue: boolean }) {
  if (acteur !== "Bailly")
    return (
      <span className={`text-[11.5px] font-medium ${retenue ? "text-ink" : "text-ink-soft/70"}`}>Vous</span>
    );
  return (
    <span
      role="img"
      aria-label="Pris en charge par Bailly"
      // La couleur change, rien ne bouge : trente-cinq coches qui rebondissent
      // à chaque clic faisaient vibrer toute la colonne.
      className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-300 ${
        retenue ? "coche-retenue" : "bg-brand text-[#1b1a18]"
      }`}
    >
      <Icone nom="check" taille={13} trait={3.2} />
    </span>
  );
}
