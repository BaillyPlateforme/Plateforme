"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Icone } from "./ui";

/*
 * La coque des parcours de devis : le panneau à gauche, la progression, le
 * titre, la barre d'action. Le formulaire de devis, la page de complétion et
 * les espaces pro s'en servent tous — un client qui revient compléter sa
 * demande retrouve exactement l'écran qu'il a quitté.
 *
 * Tout y est clair. La couleur d'accent vient des jetons de marque : un espace
 * pro les redéfinit sur la racine du cadre, et le panneau, la progression et
 * les boutons suivent sans rien savoir de l'espace.
 */

export const AGENCE = { lien: "tel:+33169103520", numero: "01 69 10 35 20" };

export const delai = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** Le halo d'un coin de page : la couleur de marque, très diluée. */
export const halo = (force: number) =>
  ({ "--halo": `color-mix(in srgb, var(--color-brand) ${force}%, transparent)` }) as CSSProperties;

/** L'enseigne d'un espace pro, posée à côté de celle de Bailly. */
export type Marque = { nom: string; logo: string | null };

const RETOUR =
  "group inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-card px-3.5 text-[12.5px] font-medium text-ink-mid transition hover:border-ink hover:text-ink";

/**
 * Le logo de Bailly — seul, ou précédé de l'enseigne de l'entreprise quand on
 * est dans son espace. Sans logo fourni, le nom de l'entreprise en tient lieu.
 */
export function Enseigne({ marque, compact = false }: { marque?: Marque | null; compact?: boolean }) {
  const bailly = (
    <Image
      src="/marque/bailly-logo.svg"
      alt="Bailly Déménagement"
      width={200}
      height={64}
      priority
      className={`h-auto shrink-0 ${marque ? (compact ? "w-[84px]" : "w-[104px]") : compact ? "w-[110px]" : "w-[150px] xl:w-[170px]"}`}
    />
  );
  if (!marque) return bailly;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {marque.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo téléversé, servi par notre API
        <img
          src={marque.logo}
          alt={marque.nom}
          className={`w-auto shrink object-contain ${compact ? "h-7 max-w-[96px]" : "h-10 max-w-[124px]"}`}
        />
      ) : (
        <span
          className={`min-w-0 truncate rounded-[10px] bg-brand font-bold text-sur-brand ${
            compact ? "px-2 py-1 text-[11.5px]" : "px-2.5 py-1.5 text-[13.5px]"
          }`}
        >
          {marque.nom}
        </span>
      )}
      <span aria-hidden className="h-6 w-px shrink-0 bg-line-strong" />
      {bailly}
    </div>
  );
}

/**
 * Le panneau de gauche : l'enseigne, une phrase, le parcours au milieu, et en
 * bas la demande qui se remplit sous les yeux du client.
 *
 * Il est blanc. Sa première version reprenait la photo d'intérieur sous un
 * voile noir : un tiers de l'écran en sombre, et le formulaire donnait
 * l'impression d'être en mode nuit.
 */
export function BrandPanel({
  milieu,
  recap,
  marque,
}: {
  milieu: ReactNode;
  recap: [string, string | null][];
  marque?: Marque | null;
}) {
  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-card lg:sticky lg:top-0 lg:block lg:h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="halo absolute -left-44 -top-36 h-[480px] w-[480px]" style={halo(30)} />
        <div className="halo absolute -bottom-48 -right-32 h-[440px] w-[440px]" style={halo(16)} />
      </div>

      <div className="relative z-10 flex h-full flex-col overflow-y-auto px-7 py-8 [scrollbar-width:none] xl:px-9">
        <Enseigne marque={marque} />
        <p className="font-serif mt-6 max-w-xs text-[19px] leading-snug xl:text-[21px] [@media(max-height:840px)]:hidden">
          Une question, un projet ? Nous vous{" "}
          <span className="gradient-text">accompagnons</span> à chaque étape.
        </p>

        <div className="my-auto py-6">{milieu}</div>

        <div className="shrink-0 rounded-[22px] border border-line bg-paper p-4 xl:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow text-ink-soft">Votre demande</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
              en direct
            </span>
          </div>
          <dl className="mt-3.5 space-y-2.5">
            {recap.map(([cle, valeur]) => (
              <div key={cle} className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[12.5px] text-ink-soft">{cle}</dt>
                <dd
                  key={valeur ?? "vide"}
                  className={`min-w-0 truncate text-right text-[13.5px] font-semibold ${
                    valeur ? "animate-step-in text-ink" : "text-line-strong"
                  }`}
                >
                  {valeur ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
          <a
            href={AGENCE.lien}
            className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5 text-[12.5px] text-ink-soft transition hover:text-ink"
          >
            <span>Une question ?</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <Icone nom="tel" taille={13} />
              {AGENCE.numero}
            </span>
          </a>
        </div>
      </div>
    </aside>
  );
}

/**
 * Le cadre commun aux deux parcours : le panneau à gauche, la progression en
 * haut, le contenu, et la barre d'action qui reste collée en bas de l'écran.
 */
export function Cadre({
  panneau,
  etiquette,
  progression,
  onBack,
  large = false,
  barre,
  children,
  marque,
  theme,
  onRemplir,
}: {
  panneau: ReactNode;
  /** Où l'on en est, pour le bandeau du téléphone. */
  etiquette: string;
  progression: number;
  /** Retour à la vitrine sans changer de page ; sans lui, un simple lien vers l'accueil. */
  onBack?: () => void;
  /** Le comparateur de formules demande plus de place que les autres étapes. */
  large?: boolean;
  barre: ReactNode;
  children: ReactNode;
  /** L'enseigne de l'espace pro, pour le bandeau du téléphone. */
  marque?: Marque | null;
  /** Les jetons de marque redéfinis par un espace pro. */
  theme?: CSSProperties;
  /** Remplir le formulaire avec un exemple : le raccourci de démonstration. */
  onRemplir?: () => void;
}) {
  const largeur = large ? "max-w-[1060px]" : "max-w-[860px]";
  return (
    <div
      className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]"
      style={theme}
    >
      {panneau}

      <main className="relative flex min-h-dvh min-w-0 flex-col">
        <div className="sticky top-0 z-40 h-[3px] w-full bg-line">
          <div
            className="h-full rounded-r-full bg-brand transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${progression}%` }}
          />
        </div>

        {/* Une lueur dans l'angle, comme sur la vitrine. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px] overflow-hidden">
          <div className="halo absolute -right-48 -top-56 h-[640px] w-[640px]" style={halo(22)} />
        </div>

        {/* Sur téléphone, le panneau disparaît : il en reste l'enseigne et l'étape. */}
        <div className="relative z-10 flex items-center justify-between gap-3 border-b border-line bg-card px-5 py-3 lg:hidden">
          <Enseigne marque={marque} compact />
          <span className="shrink-0 text-[12px] font-medium text-ink-soft">{etiquette}</span>
        </div>

        <div className={`relative z-10 mx-auto w-full flex-1 px-5 pb-14 pt-6 sm:px-8 lg:px-12 lg:pt-9 ${largeur}`}>
          <div className="flex items-center justify-between gap-4">
            {onBack ? (
              <button type="button" onClick={onBack} className={RETOUR}>
                <Icone nom="gauche" taille={14} trait={2.2} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
                Accueil
              </button>
            ) : (
              <Link href="/" className={RETOUR}>
                <Icone nom="gauche" taille={14} trait={2.2} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
                Accueil
              </Link>
            )}
            <div className="flex items-center gap-2.5">
              {/* Le raccourci de démonstration : un éclair sans libellé, à peine
                  visible, pour qui présente l'outil sans tout saisir. */}
              {onRemplir && (
                <button
                  type="button"
                  onClick={onRemplir}
                  title="Remplir avec un exemple"
                  aria-label="Remplir avec un exemple"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft opacity-40 transition hover:bg-card hover:text-ink hover:opacity-100 active:scale-90"
                >
                  <Icone nom="eclair" taille={13} />
                </button>
              )}
              <a href={AGENCE.lien} className="inline-flex items-center gap-2 text-[12.5px] text-ink-soft transition hover:text-ink">
                <Icone nom="tel" taille={14} />
                <span className="hidden sm:inline">Besoin d&apos;aide ?</span>
                <span className="font-semibold text-ink">{AGENCE.numero}</span>
              </a>
            </div>
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
export function Titre({
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
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-bold text-sur-brand">
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

/** Le bouton d'action : noir, avec sa flèche dans un rond à la couleur de marque. */
export function Bouton({
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
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sur-brand transition-transform duration-300 group-hover:translate-x-0.5 group-disabled:translate-x-0">
        <Icone nom="droite" taille={16} trait={2.4} />
      </span>
    </button>
  );
}

export function Erreur({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex items-start gap-2.5 rounded-[18px] border border-danger/30 bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
      <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
      {children}
    </div>
  );
}

/** Ce qui manque pour avancer, dit en clair au lieu d'un bouton grisé muet. */
export function Manque({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-end gap-2 text-right text-[12.5px] leading-snug text-ink-soft sm:justify-start sm:text-left">
      <Icone nom="info" taille={15} className="hidden shrink-0 sm:block" />
      {children}
    </p>
  );
}
