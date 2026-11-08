import type { ReactNode } from "react";
import { ETAPE_RH, ETAPES_EN_COURS, PAYEURS_RH, type CleEtapeRh, type PayeurRh } from "@/lib/rh-modele";
import { Picto, type NomPicto } from "./Icones";

/* Les briques de l'espace RH : cartes, tuiles chiffrées, pastilles d'étape, états vides. */

export function Carte({
  titre,
  sous,
  action,
  children,
  className = "",
  id,
}: {
  titre: string;
  sous?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`bloc min-w-0 rounded-[24px] border border-line bg-card p-5 sm:p-6 ${className}`}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{titre}</h2>
          {sous && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{sous}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Une tuile chiffrée : libellé, valeur, note. La valeur garde des chiffres
 * proportionnels (un grand nombre à chasse fixe paraît lâche). `nuit` : la
 * tuile qui mène, en noir de la marque, l'accent de l'entreprise en filet.
 */
export function Tuile({ picto, label, valeur, note, nuit = false }: { picto: NomPicto; label: string; valeur: ReactNode; note?: ReactNode; nuit?: boolean }) {
  return (
    <div
      className={`bloc relative min-w-0 overflow-hidden rounded-[20px] p-4 sm:rounded-[24px] sm:p-6 ${nuit ? "bg-[#1b1a18] text-white" : "border border-line bg-card"}`}
    >
      {nuit && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-brand" />}
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[12.5px] font-medium leading-snug sm:text-[13px] ${nuit ? "text-white/70" : "text-ink-soft"}`}>{label}</span>
        <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-[12px] sm:flex ${nuit ? "bg-white/10 text-brand-clair" : "bg-brand-soft text-brand-ink"}`}>
          <Picto nom={picto} taille={18} />
        </span>
      </div>
      <div className="mt-3 text-[25px] font-bold leading-none tracking-[-0.03em] sm:mt-4 sm:text-[34px] xl:text-[38px]">{valeur}</div>
      {note && <div className={`mt-2 text-[12px] leading-snug sm:mt-2.5 sm:text-[12.5px] ${nuit ? "text-white/65" : "text-ink-soft"}`}>{note}</div>}
    </div>
  );
}

/**
 * L'étape d'une mobilité : son nom, et devant lui une petite jauge de six
 * crans — où elle en est du parcours, d'un coup d'œil. Les mobilités closes
 * n'ont pas de jauge.
 */
export function PastilleEtape({ etape, grande = false }: { etape: CleEtapeRh; grande?: boolean }) {
  const e = ETAPE_RH[etape];
  if (etape === "termine")
    return (
      <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#1b1a18] font-semibold text-white ${grande ? "px-3 py-1.5 text-[12.5px]" : "px-2.5 py-1 text-[11.5px]"}`}>
        <Picto nom="check" taille={grande ? 13 : 12} trait={2.6} className="text-brand-clair" />
        {e.label}
      </span>
    );
  if (!e.ouverte)
    return (
      <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-line-strong font-semibold text-ink-soft ${grande ? "px-3 py-1.5 text-[12.5px]" : "px-2.5 py-1 text-[11.5px]"}`}>
        {e.label}
      </span>
    );
  const rang = ETAPES_EN_COURS.findIndex((x) => x.cle === etape);
  return (
    <span
      title={e.aide}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-subtle font-semibold text-ink ${grande ? "px-3 py-1.5 text-[12.5px]" : "px-2.5 py-1 text-[11.5px]"}`}
    >
      <span aria-hidden className="flex gap-[2px]">
        {ETAPES_EN_COURS.map((x, i) => (
          <span key={x.cle} className={`h-[9px] w-[3px] rounded-full ${i <= rang ? "bg-brand-ink" : "bg-line-strong"}`} />
        ))}
      </span>
      {e.label}
    </span>
  );
}

/**
 * Qui paie la mobilité. L'entreprise : la couleur de l'entreprise, pâle ; le
 * salarié : un contour ; à confirmer : un contour pointillé. Pas de couleur
 * d'état (vert, rouge) : ce n'est ni un succès ni une alerte.
 */
export function PastillePayeur({ payeur, grande = false }: { payeur: PayeurRh; grande?: boolean }) {
  const p = PAYEURS_RH[payeur];
  const ton =
    payeur === "entreprise"
      ? "bg-brand-soft text-brand-ink"
      : payeur === "salarie"
        ? "border border-line-strong bg-card text-ink-mid"
        : "border border-dashed border-line-strong text-ink-soft";
  return (
    <span
      title={p.aide}
      data-payeur={payeur}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${ton} ${grande ? "px-3 py-1.5 text-[12.5px]" : "px-2.5 py-1 text-[11.5px]"}`}
    >
      <Picto nom={payeur === "entreprise" ? "immeuble" : payeur === "salarie" ? "personnes" : "horloge"} taille={grande ? 14 : 12.5} />
      {p.label}
    </span>
  );
}

/**
 * Ce qui reste hors des montants : les mobilités que le salarié paie, les
 * demandes dont le payeur reste à confirmer. Rien quand tout est compté.
 * TEXTE À VALIDER.
 */
export function NoteHorsBudget({ salarie, aConfirmer, className = "" }: { salarie: number; aConfirmer: number; className?: string }) {
  if (!salarie && !aConfirmer) return null;
  const parties = [
    salarie ? `${salarie} mobilité${salarie > 1 ? "s" : ""} payée${salarie > 1 ? "s" : ""} par le salarié` : null,
    aConfirmer ? `${aConfirmer} demande${aConfirmer > 1 ? "s" : ""} dont le payeur reste à confirmer` : null,
  ].filter(Boolean);
  return (
    <p data-hors-budget className={`flex items-start gap-2 text-[12.5px] leading-snug text-ink-soft ${className}`}>
      <Picto nom="info" taille={15} className="mt-px shrink-0" />
      <span>
        Hors budget : {parties.join(" et ")}. {salarie + aConfirmer > 1 ? "Elles restent listées" : "Elle reste listée"} dans Collaborateurs, sans compter dans ces montants.
      </span>
    </p>
  );
}

export function Vide({ picto = "camion", titre, texte, action }: { picto?: NomPicto; titre: string; texte?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-dashed border-line-strong bg-card px-6 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        <Picto nom={picto} taille={22} />
      </span>
      <p className="mx-auto mt-4 max-w-[46ch] text-[15px] font-semibold">{titre}</p>
      {texte && <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-soft">{texte}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Une rangée de choix exclusifs : périodes, filtres. */
export function Segments<T extends string>({ valeur, options, onChange, label }: { valeur: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex max-w-full overflow-x-auto rounded-full border border-line bg-card p-1 text-[12.5px] font-semibold">
      {options.map(([cle, texte]) => (
        <button
          key={cle}
          type="button"
          role="radio"
          aria-checked={valeur === cle}
          onClick={() => onChange(cle)}
          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 transition ${valeur === cle ? "bg-[#1b1a18] text-white" : "text-ink-mid hover:text-ink"}`}
        >
          {texte}
        </button>
      ))}
    </div>
  );
}
