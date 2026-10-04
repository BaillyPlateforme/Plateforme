"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Icone } from "./ui";

/*
 * La coque des parcours de devis : le panneau sombre à gauche, la progression,
 * le titre, la barre d'action. Le formulaire de devis et la page de
 * complétion s'en servent tous les deux — un client qui revient compléter sa
 * demande retrouve exactement l'écran qu'il a quitté.
 */

export const AGENCE = { lien: "tel:+33169103520", numero: "01 69 10 35 20" };

export const delai = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const RETOUR =
  "group inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-card px-3.5 text-[12.5px] font-medium text-ink-mid transition hover:border-ink hover:text-ink";

/**
 * Le panneau de gauche, dans le langage de la vitrine : la photo d'intérieur
 * assombrie, le halo doré, le texte en blanc. Le milieu est laissé au
 * parcours ; en bas, la demande se remplit sous les yeux du client.
 *
 * Les noirs sont écrits en dur : le panneau reste sombre quel que soit le
 * thème, là où `bg-ink` s'éclaircirait de nuit.
 */
export function BrandPanel({
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
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[#1b1a18] transition-transform duration-300 group-hover:translate-x-0.5 group-disabled:translate-x-0">
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
