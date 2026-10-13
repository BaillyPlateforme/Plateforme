"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import SiteHeader from "./SiteHeader";
import { Icone, type NomIcone } from "./demande/ui";
import { TRANCHES_DISTANCE } from "@/lib/pricing/grille";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

// Espace fine insécable entre les milliers : toLocaleString dépend de l'ICU
// embarqué par le serveur, qui ne la met pas toujours.
const PORTEE_KM = String(TRANCHES_DISTANCE[TRANCHES_DISTANCE.length - 1].max).replace(
  /\B(?=(\d{3})+(?!\d))/g,
  " ",
);

const AGENCE = { lien: TEL_AGENCE_LIEN, numero: TEL_AGENCE };

/** Ce que choisit le visiteur : l'un des deux parcours de devis. */
export type Parcours = "express" | "complet";

/**
 * La page d'accueil du devis : le choix entre le devis express et le devis
 * complet, et rien d'autre.
 *
 * Elle a d'abord été une vitrine entière — le parcours en quatre étapes, les
 * formules, les promesses. Le devis s'affiche désormais dans le site officiel,
 * qui présente déjà Bailly : il ne reste ici que les deux portes d'entrée.
 */
export default function Vitrine({
  onChoisir,
  annee,
  integre = false,
}: {
  onChoisir: (p: Parcours) => void;
  annee: number;
  /** Affichée dans une page du site officiel : ni en-tête, ni photo, ni pied. */
  integre?: boolean;
}) {
  if (integre) return <ChoixIntegre onChoisir={onChoisir} />;
  return (
    <>
      <SiteHeader onChoisir={onChoisir} />

      <main className="flex-1">
        <Hero onChoisir={onChoisir} />
      </main>

      <Pied annee={annee} onChoisir={onChoisir} />
    </>
  );
}

/** Les deux portes, telles qu'elles s'ouvrent sur chacune des deux versions de la page. */
function Portes({ onChoisir, d = 0 }: { onChoisir: (p: Parcours) => void; d?: number }) {
  return (
    <>
      <Porte
        onClick={() => onChoisir("express")}
        d={d}
        accent
        icone="eclair"
        duree="≈ 2 minutes"
        titre="Devis express"
        desc="Une estimation rapide, sans détour. De quoi savoir tout de suite à quoi vous en tenir."
        points={["Vos coordonnées", "Votre trajet", "Volume : saisie ou photos"]}
        cta="Commencer le devis express"
      />
      <Porte
        onClick={() => onChoisir("complet")}
        d={d + 100}
        icone="liste"
        duree="Sur mesure"
        titre="Devis complet"
        desc="Le dossier détaillé, pour un devis au plus juste : vos accès, vos prestations, vos garanties."
        points={["Conditions d'accès", "Prestations et formule", "Garantie et inventaire"]}
        cta="Commencer le devis complet"
      />
    </>
  );
}

/**
 * Le choix, dans une page du site officiel.
 *
 * Le site a son menu, son titre et sa photo : ici, un titre court et les deux
 * portes côte à côte, sur le fond clair du formulaire qui suivra.
 */
function ChoixIntegre({ onChoisir }: { onChoisir: (p: Parcours) => void }) {
  return (
    <section className="relative overflow-hidden bg-paper px-4 py-9 text-ink sm:px-7 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="halo absolute -right-48 -top-56 h-[640px] w-[640px]" style={{ "--halo": "color-mix(in srgb, var(--color-brand) 22%, transparent)" } as CSSProperties} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1060px]">
        <p className="eyebrow reveal text-brand-ink">Votre devis en ligne</p>
        <h1 className="font-serif reveal mt-4 text-balance text-[32px] sm:text-[44px]" style={delay(60)}>
          Votre déménagement, <span className="gradient-text">estimé en temps réel</span>
        </h1>
        <p className="reveal mt-4 max-w-[64ch] text-[15.5px] leading-relaxed text-ink-soft sm:text-[16.5px]" style={delay(120)}>
          Décrivez votre logement en quelques minutes : volume, accès, dates. L&apos;estimation
          tombe aussitôt, calculée à partir de notre grille tarifaire et confirmée par la suite
          par notre conseiller commercial.
        </p>

        <div className="mt-8 grid items-stretch gap-4 md:grid-cols-2">
          <Portes onChoisir={onChoisir} d={200} />
        </div>

        <a href={AGENCE.lien} className="reveal mt-7 inline-flex items-center gap-2.5 text-[14px] text-ink-soft transition hover:text-ink" style={delay(380)}>
          <Icone nom="tel" taille={15} />
          Ou appelez-nous : <span className="font-semibold text-ink">{AGENCE.numero}</span>
        </a>
      </div>
    </section>
  );
}

/** La flèche d'un bouton, dans son rond. */
function Fleche({ sombre = false }: { sombre?: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 ${
        sombre ? "bg-[#1b1a18] text-brand-clair" : "bg-brand text-sur-brand"
      }`}
    >
      <Icone nom="droite" taille={16} trait={2.4} />
    </span>
  );
}

/* ─────────────────────────── Héros ─────────────────────────── */


/**
 * Le héros : une photo d'intérieur en plein cadre, nette, le titre à gauche,
 * les deux portes d'entrée à droite.
 *
 * Trois essais avant celui-ci. Un intérieur de nuit sous un voile noir : toute
 * la page semblait en mode sombre. Pas de photo : plat. Une photo claire sous
 * un voile blanc : délavée, « beaucoup trop blanc ». Ici la photo est de jour
 * et reste entière ; seul le côté du texte s'assombrit, pour que le titre se
 * lise en blanc (photo : Unsplash, licence libre).
 */
function Hero({ onChoisir }: { onChoisir: (p: Parcours) => void }) {
  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#1b1a18] text-white">
      {/* La photo de fond, en haute définition. Le voile ne couvre que le côté
          du texte et le pied du héros : à droite, la photo reste telle quelle. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Image src="/marque/hero-salon.jpg" alt="" fill priority sizes="100vw" className="ken-burns object-cover object-center" />
        <div className="hero-voile absolute inset-0" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-12 px-6 pb-12 pt-[112px] lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:gap-14 lg:px-10 lg:pb-14">
        <div>
          <div className="reveal max-w-fit" style={delay(60)}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-[12.5px] font-medium text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Déménagements particuliers et entreprises
            </span>
          </div>

          <h1 className="font-serif reveal mt-6 text-balance text-[44px] sm:text-[56px] xl:text-[66px]" style={delay(160)}>
            Votre déménagement, <span className="text-brand">estimé en temps réel</span>
          </h1>

          <p className="reveal mt-6 max-w-[52ch] text-[17px] leading-relaxed text-white/85 sm:text-[18px]" style={delay(260)}>
            Décrivez votre logement en quelques minutes : volume, accès, dates. L&apos;estimation
            tombe aussitôt, calculée à partir de notre grille tarifaire et confirmée par la suite
            par notre conseiller commercial.
          </p>

          <ul className="reveal mt-8 flex flex-wrap gap-x-7 gap-y-3" style={delay(360)}>
            {["Sans engagement", "Estimation immédiate", "Réponse sous 24 h ouvrées"].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[14.5px] font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-sur-brand">
                  <Icone nom="check" taille={11} trait={3.4} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Les deux parcours de devis, l'un sous l'autre, sur le fond clair de la
            page. Rien derrière : la photo d'intérieur, sombre, dépassait des
            cartes et salissait toute la composition. */}
        <div className="relative">
          <div className="relative space-y-4">
            <Portes onChoisir={onChoisir} d={380} />
          </div>
        </div>
      </div>

      {/* Bandeau de chiffres, au pied du héros. */}
      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6 pb-12 lg:px-10">
        <div className="reveal grid grid-cols-2 gap-x-8 gap-y-6 border-t border-white/25 pt-7 sm:grid-cols-4" style={delay(620)}>
          <Chiffre valeur="3 min" legende="pour une estimation complète" />
          <Chiffre valeur="3" legende="formules, de l'économique au premium" />
          <Chiffre valeur={`${PORTEE_KM} km`} legende="de portée, France entière" />
          <Chiffre valeur="1 grille" legende="tarifaire, pour chaque estimation en ligne" />
        </div>
      </div>
    </section>
  );
}

/**
 * Une porte d'entrée vers un devis.
 *
 * Une carte pleine, pas un verre dépoli : le texte est noir sur un aplat — la
 * couleur de marque pour le parcours rapide, blanc pour le détaillé — et
 * l'action est un vrai bouton.
 */
function Porte({
  onClick,
  accent,
  icone,
  duree,
  titre,
  desc,
  points,
  cta,
  d,
}: {
  onClick: () => void;
  accent?: boolean;
  icone: NomIcone;
  duree: string;
  titre: string;
  desc: string;
  points: string[];
  cta: string;
  d: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`reveal group relative block h-full w-full rounded-[26px] p-6 text-left shadow-[0_24px_50px_-32px_rgba(27,26,24,0.4)] transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_34px_60px_-32px_rgba(27,26,24,0.5)] active:translate-y-0 sm:p-8 ${
        accent ? "bg-brand text-sur-brand" : "border border-line bg-card text-ink"
      }`}
      style={delay(d)}
    >
      <span className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#1b1a18] text-brand-clair sm:h-12 sm:w-12 sm:rounded-2xl">
            <Icone nom={icone} taille={20} />
          </span>
          <span className="font-serif block text-[21px] leading-none sm:text-[28px]">{titre}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] sm:px-3 sm:py-1.5 sm:text-[11.5px] ${
            accent ? "bg-[#1b1a18] text-brand-clair" : "bg-subtle text-ink-mid"
          }`}
        >
          {duree}
        </span>
      </span>

      <span className="mt-5 block text-[15.5px] leading-relaxed opacity-80">{desc}</span>

      <span className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {points.map((p) => (
          <span key={p} className="flex items-center gap-2 text-[14px] font-medium">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#1b1a18] text-brand-clair">
              <Icone nom="check" taille={10} trait={3.6} />
            </span>
            {p}
          </span>
        ))}
      </span>

      <span className="mt-6 inline-flex h-12 items-center gap-3 rounded-full bg-[#1b1a18] pl-5 pr-1.5 text-[14.5px] font-semibold text-white">
        {cta}
        <Fleche />
      </span>
    </button>
  );
}

function Chiffre({ valeur, legende }: { valeur: string; legende: string }) {
  return (
    <div>
      <div className="font-serif text-[30px] leading-none sm:text-[34px]">{valeur}</div>
      <div className="mt-2.5 text-[13.5px] leading-snug text-white/70">{legende}</div>
    </div>
  );
}

/* ─────────────────────────── Pied de page ─────────────────────────── */

function Pied({ annee, onChoisir }: { annee: number; onChoisir: (p: Parcours) => void }) {
  const lien = "text-[14.5px] text-ink-soft transition hover:text-ink";
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-6 py-14 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:px-10">
        <div>
          <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} className="h-auto w-[170px]" />
          <p className="mt-5 text-[16px] font-medium text-brand-ink">Déménagez où vous voulez&nbsp;!</p>
          <p className="mt-3 max-w-[38ch] text-[13.5px] leading-relaxed text-ink-soft">
            Membre IAM, Chambre Syndicale du Déménagement, certifié ISO 9001, 14001 et 45001, norme
            Ecovadis.
          </p>
        </div>

        <div>
          <p className="eyebrow text-ink-soft">Votre devis</p>
          <ul className="mt-4 space-y-3">
            <li>
              <button type="button" onClick={() => onChoisir("express")} className={lien}>
                Devis express
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onChoisir("complet")} className={lien}>
                Devis complet
              </button>
            </li>
          </ul>
        </div>

        <div>
          <p className="eyebrow text-ink-soft">Nous joindre</p>
          <a href={AGENCE.lien} className="font-serif mt-4 block text-[26px] leading-none transition hover:text-brand-ink">
            {AGENCE.numero}
          </a>
          <a href="https://www.demenagements-bailly.com/" target="_blank" rel="noreferrer" className={`mt-4 inline-block ${lien}`}>
            demenagements-bailly.com
          </a>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[13px] text-ink-soft lg:px-10">
          <span>© {annee} Bailly Déménagement · BD Moving Group</span>
          <span>Estimations indicatives, sans valeur de devis contractuel.</span>
        </div>
      </div>
    </footer>
  );
}
