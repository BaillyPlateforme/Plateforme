"use client";

import { useState, type CSSProperties } from "react";
import { FORMULES, type Formule } from "@/lib/pricing/grille";
import { halo } from "./cadre";
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
  icone: NomIcone;
  vedette?: boolean;
  prestations: Prestations;
};

const CLASSES: Classe[] = [
  {
    key: "eco",
    icone: "carton",
    prestations: { fragile: "moi", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  },
  {
    key: "standard",
    icone: "verre",
    vedette: true,
    prestations: { fragile: "bailly", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  },
  {
    key: "luxe",
    icone: "couronne",
    prestations: { fragile: "bailly", embNonFragile: "bailly", debNonFragile: "bailly", demontage: "bailly", transport: "moi" },
  },
];

/** La formule retenue pour le client quand il n'en choisit aucune : la plus choisie. */
export const PRESTATIONS_PAR_DEFAUT: Prestations = { ...CLASSES[1].prestations };

/** Le nom, l'accroche et les points de chaque formule : ceux de la grille, comme sur la page d'accueil. */
const FICHE = Object.fromEntries(FORMULES.map((f) => [f.key, f])) as Record<Formule, (typeof FORMULES)[number]>;

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
  return FICHE[choix].label;
}

/**
 * Le choix de la formule : trois cartes côte à côte.
 *
 * Le fond vient du modèle de Céline, les tarifs d'un billet d'avion : chaque
 * carte dit à qui elle s'adresse et ce qu'elle inclut — à la place du tableau
 * des trente-cinq gestes, « beaucoup trop détaillé ». Les mots sont ceux de
 * Christian, les mêmes que sur la page d'accueil. La forme est celle des
 * onglets d'origine : la carte blanche posée sur le panneau teinté, qui passe
 * à la couleur de marque quand on la retient.
 *
 * La formule se lit toujours dans les cinq cases du formulaire : rien d'autre
 * n'est stocké.
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
  const [carte, setCarte] = useState(false);

  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Formule de déménagement"
        className="bloc reveal relative overflow-clip rounded-[28px] border border-line bg-subtle"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="halo absolute -left-32 -top-40 h-[440px] w-[440px]" style={halo(46)} />
          <div className="halo absolute -right-24 bottom-[-220px] h-[420px] w-[420px]" style={halo(26)} />
        </div>

        <div className="relative z-10 px-3 pb-4 pt-6 sm:px-5 sm:pb-6 sm:pt-8">
          <div className="px-2 pb-7">
            <p className="eyebrow text-brand-ink">Trois formules</p>
            <p className="font-serif mt-2.5 text-[22px] leading-[1.1] xl:text-[25px]">
              Choisissez votre niveau de service
            </p>
          </div>

          <div className="grid gap-x-3 gap-y-6 md:grid-cols-3">
            {CLASSES.map((c, i) => (
              <CarteFormule
                key={c.key}
                classe={c}
                actif={index === i}
                attenue={index >= 0 && index !== i}
                onClick={() => onChange({ ...c.prestations })}
              />
            ))}
          </div>
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
            transportSeul ? "bg-[#1b1a18] text-brand-clair" : "bg-subtle text-ink-mid"
          }`}
        >
          <Icone nom="camion" taille={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight">Transport de meubles uniquement</span>
          <span className="mt-1 block text-[13px] leading-snug text-ink-soft">
            Nous ne transportons que des meubles vides démontés par vos soins que nous aurons emballés au préalable.
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
                <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sur-brand">
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
              {/* Le transport seul a déjà sa carte juste au-dessus : il n'est pas
                  répété ici. Restent les quatre services qu'on peut reprendre. */}
              {LIGNES_CARTE.filter((p) => p.key !== "transport").map((p) => {
                // Transporter les meubles seuls exclut tout emballage et tout
                // démontage : ces lignes n'ont alors plus de sens.
                const eteinte = transportSeul;
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

/**
 * Une formule : en haut l'onglet d'origine — blanc et un peu translucide, puis
 * plein à la couleur de marque —, en dessous ce qu'elle inclut.
 */
function CarteFormule({
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
  const fiche = FICHE[classe.key];
  return (
    // La carte monte par une translation, jamais par sa hauteur : l'agrandir
    // au survol poussait ce qui suit de quelques pixels, et l'écran tremblait
    // dès que la souris passait d'une formule à l'autre.
    <div
      className={`relative flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        actif ? "" : "md:translate-y-2 md:hover:translate-y-1"
      }`}
    >
      {classe.vedette && (
        <span
          className={`absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] shadow-md transition-colors duration-300 ${
            actif ? "bg-[#1b1a18] text-brand-clair" : "bg-brand text-sur-brand"
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
        className={`group relative flex w-full flex-1 flex-col overflow-hidden rounded-[18px] border text-left outline-none transition-[background-color,border-color,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink active:brightness-95 ${
          actif
            ? "border-brand bg-card shadow-[0_18px_44px_-18px_color-mix(in_srgb,var(--color-brand)_85%,transparent)]"
            : `border-white bg-card/70 shadow-[0_10px_30px_-22px_rgba(27,26,24,0.45)] hover:bg-card ${
                attenue ? "opacity-80 hover:opacity-100" : ""
              }`
        }`}
      >
        {/* ── L'onglet ── */}
        <span
          className={`relative flex flex-col overflow-hidden px-3.5 pb-5 pt-5 transition-colors duration-300 xl:px-4 ${
            actif ? "bg-brand text-sur-brand" : "text-ink"
          }`}
        >
          {actif && <span aria-hidden className="eclat" />}

          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#1b1a18] text-brand-clair">
            <Icone nom={classe.icone} taille={18} />
          </span>

          <span className="font-serif mt-3 block text-[17px] leading-tight">{fiche.label}</span>
          {/* Pas de compteur : « pas nécessaire », et il ne compterait plus rien
              de ce que la carte énumère. */}
          <span className={`mt-1.5 block text-[12.5px] leading-snug md:min-h-[4.2em] ${actif ? "opacity-75" : "text-ink-soft"}`}>
            {fiche.accroche}
          </span>

          <span
            className={`mt-3.5 flex h-9 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-colors duration-300 ${
              actif
                ? "bg-[#1b1a18] text-white"
                : "border border-line-strong text-ink group-hover:border-ink"
            }`}
          >
            {actif ? (
              <>
                <span className="relative inline-flex">
                  <span className="onde absolute inset-0 rounded-full" />
                  <Icone nom="check" taille={13} trait={3.2} className="coche-pop coche-or" />
                </span>
                Choisie
              </>
            ) : (
              "Choisir"
            )}
          </span>
        </span>

        {/* ── Ce qu'elle inclut ── */}
        <span
          className={`flex flex-1 flex-col border-t px-3.5 pb-4 pt-4 text-ink transition-colors duration-300 xl:px-4 ${
            actif ? "border-brand bg-brand/14" : "border-line/70"
          }`}
        >
          <span className="block text-[12.5px] font-bold">Inclus</span>
          <span className="mt-2.5 block flex-1 space-y-2.5">
            {fiche.points.map((point) => (
              <span key={point} className="flex gap-2.5 text-[13px] leading-snug">
                {/* La couleur change, rien ne bouge : des coches qui rebondissent
                    à chaque clic faisaient vibrer toute la colonne. */}
                <span
                  className={`mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                    actif ? "coche-retenue" : "bg-brand text-sur-brand"
                  }`}
                >
                  <Icone nom="check" taille={10} trait={3.4} />
                </span>
                <span>{point}</span>
              </span>
            ))}
          </span>
        </span>
      </button>
    </div>
  );
}
