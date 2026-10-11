"use client";

import { useState, type CSSProperties } from "react";
import { FORMULES, type Formule } from "@/lib/pricing/grille";
import { Choice, Icone, Radio } from "./ui";

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
  accroche: string;
  /** L'en-tête de la carte : clair, à la couleur de marque, puis sombre. */
  bandeau: string;
  vedette?: boolean;
  prestations: Prestations;
};

const CLASSES: Classe[] = [
  {
    key: "eco",
    accroche: "Vous emballez, nous transportons",
    bandeau: "bg-subtle text-ink",
    prestations: { fragile: "moi", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  },
  {
    key: "standard",
    accroche: "Nous emballons le fragile",
    bandeau: "bg-brand text-sur-brand",
    vedette: true,
    prestations: { fragile: "bailly", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" },
  },
  {
    key: "luxe",
    accroche: "Vous n'avez rien à toucher",
    bandeau: "bg-[#1b1a18] text-white",
    prestations: { fragile: "bailly", embNonFragile: "bailly", debNonFragile: "bailly", demontage: "bailly", transport: "moi" },
  },
];

/** La formule retenue pour le client quand il n'en choisit aucune : la plus choisie. */
export const PRESTATIONS_PAR_DEFAUT: Prestations = { ...CLASSES[1].prestations };

const NOM = Object.fromEntries(FORMULES.map((f) => [f.key, f.label])) as Record<Formule, string>;

/**
 * Ce qu'une carte énumère : le transport, toujours inclus, puis les quatre
 * services du formulaire. Inclus ou non, c'est lu dans les cases de la
 * formule — la carte ne peut pas dire autre chose que ce qui sera chiffré.
 */
const SERVICES: { label: string; inclus: (p: Prestations) => boolean }[] = [
  { label: "Chargement, transport et déchargement", inclus: () => true },
  ...LIGNES_CARTE.filter((l) => l.key !== "transport").map((l) => ({
    label: l.label,
    inclus: (p: Prestations) => p[l.key] === "bailly",
  })),
];

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
 * Le choix de la formule : trois cartes côte à côte, à la manière des tarifs
 * d'un billet d'avion — le modèle donné par Céline.
 *
 * Chaque carte porte son nom, son bouton « Sélectionner », ce qu'elle
 * inclut, puis, sous le trait, ce qui reste au client. Rien de plus : le
 * tableau des trente-cinq gestes était « beaucoup trop détaillé ». La formule
 * se lit toujours dans les cinq cases du formulaire : rien d'autre n'est stocké.
 */
export default function ChoixFormule({
  value,
  onChange,
}: {
  value: Prestations;
  onChange: (p: Prestations) => void;
}) {
  const choix = formuleRetenue(value);
  const transportSeul = choix === "transport";
  const [carte, setCarte] = useState(false);

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Formule de déménagement" className="reveal grid gap-4 md:grid-cols-3">
        {CLASSES.map((c) => (
          <CarteFormule
            key={c.key}
            classe={c}
            active={choix === c.key}
            onClick={() => onChange({ ...c.prestations })}
          />
        ))}
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

/** Une formule : l'en-tête, le bouton, ce qui est inclus, ce qui ne l'est pas. */
function CarteFormule({ classe, active, onClick }: { classe: Classe; active: boolean; onClick: () => void }) {
  const inclus = SERVICES.filter((s) => s.inclus(classe.prestations));
  const reste = SERVICES.filter((s) => !s.inclus(classe.prestations));
  return (
    // La place de l'étiquette « Conseillé » est réservée au-dessus des trois
    // cartes : celle du milieu ne fait pas descendre ses voisines.
    <div className={`relative flex flex-col ${classe.vedette ? "pt-7" : "md:pt-7"}`}>
      {classe.vedette && (
        <span className="absolute inset-x-0 top-0 flex h-7 items-center gap-1.5 rounded-t-[14px] bg-[#1b1a18] px-4 text-[11.5px] font-semibold text-white">
          <span aria-hidden>★</span> Conseillé
        </span>
      )}
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onClick}
        className={`flex w-full flex-1 flex-col overflow-hidden border bg-card text-left outline-none transition-[border-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
          classe.vedette ? "rounded-b-[18px]" : "rounded-[18px]"
        } ${
          active
            ? "border-ink ring-1 ring-ink shadow-[0_22px_40px_-28px_rgba(27,26,24,0.55)]"
            : "border-line-strong hover:border-ink-soft"
        }`}
      >
        <span className={`block px-4 py-4 ${classe.bandeau}`}>
          <span className="block text-[16px] font-bold leading-tight">{NOM[classe.key]}</span>
          <span className="mt-1 block text-[12.5px] leading-snug opacity-80">{classe.accroche}</span>
        </span>

        <span className="block px-3 pt-3">
          <span
            className={`flex h-11 items-center justify-center gap-2 rounded-[10px] text-[14px] font-semibold transition-colors duration-200 ${
              active ? "bg-[#1b1a18] text-white" : "bg-subtle text-ink"
            }`}
          >
            {active && <Icone nom="check" taille={14} trait={3} className="coche-or" />}
            {active ? "Sélectionnée" : "Sélectionner"}
          </span>
        </span>

        <span className="block flex-1 px-4 pb-4 pt-4">
          <span className="block text-[12.5px] font-bold">Inclus</span>
          <span className="mt-2.5 block space-y-2.5">
            {inclus.map((s) => (
              <span key={s.label} className="flex gap-2.5 text-[13px] leading-snug">
                <Icone nom="check" taille={15} trait={2.8} className="mt-px shrink-0 text-good" />
                <span>{s.label}</span>
              </span>
            ))}
          </span>
        </span>

        {reste.length > 0 && (
          <span className="mx-4 block space-y-2.5 border-t border-line pb-4 pt-3.5">
            {reste.map((s) => (
              <span key={s.label} className="flex gap-2.5 text-[13px] leading-snug text-ink-soft">
                <Icone nom="croix" taille={15} trait={2.8} className="mt-px shrink-0 text-danger" />
                <span>
                  <span className="sr-only">Non inclus : </span>
                  {s.label}
                </span>
              </span>
            ))}
          </span>
        )}
      </button>
    </div>
  );
}
