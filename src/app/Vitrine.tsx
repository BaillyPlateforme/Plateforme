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

/**
 * Ce que choisit le visiteur : l'une des trois portes, et sa branche — le
 * devis express ou complet du particulier, le petit transfert ou le projet
 * important de l'entreprise.
 */
export type Choix =
  | { parcours: "particulier"; mode: "express" | "complet" }
  | { parcours: "mutation" }
  | { parcours: "entreprise"; transfert: "simple" | "projet" };

/** Une seule porte ouverte : le bloc du site officiel dédié à un public. */
export type Filtre = "particulier" | "entreprise" | null;

/**
 * La page d'accueil des questionnaires : trois portes, une par public.
 *
 * Christian, le 4 novembre : « Vous êtes un particulier — Vous déménagez votre
 * entreprise — Vous êtes muté ». Le particulier garde son estimation en ligne,
 * en express ou en complet ; le salarié muté et l'entreprise remplissent une
 * demande sans prix, que suit une visite, une visio ou un appel.
 */
export default function Vitrine({
  onChoisir,
  annee,
  integre = false,
  filtre = null,
}: {
  onChoisir: (c: Choix) => void;
  annee: number;
  /** Affichée dans une page du site officiel : ni en-tête, ni photo, ni pied. */
  integre?: boolean;
  /** Le bloc du site n'ouvre qu'une porte : on n'en montre que les branches. */
  filtre?: Filtre;
}) {
  if (integre) return <ChoixIntegre onChoisir={onChoisir} filtre={filtre} />;
  return (
    <>
      <SiteHeader onChoisir={onChoisir} />

      <main className="flex-1">
        <Hero onChoisir={onChoisir} filtre={filtre} />
      </main>

      <Pied annee={annee} onChoisir={onChoisir} />
    </>
  );
}

/** Les deux portes du particulier : le devis express et le devis complet. */
function PortesParticulier({ onChoisir, d = 0 }: { onChoisir: (c: Choix) => void; d?: number }) {
  return (
    <>
      <Porte
        onClick={() => onChoisir({ parcours: "particulier", mode: "express" })}
        d={d}
        accent
        icone="eclair"
        duree="≈ 2 minutes"
        titre="Devis express"
        desc="Une estimation rapide, sans détour. De quoi savoir tout de suite à quoi vous en tenir."
        points={["Vos coordonnées", "Votre trajet", "Volume : saisie, photos ou logement"]}
        cta="Commencer le devis express"
      />
      <Porte
        onClick={() => onChoisir({ parcours: "particulier", mode: "complet" })}
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

/** Les deux portes de l'entreprise : le petit transfert et le projet important. */
function PortesEntreprise({ onChoisir, d = 0 }: { onChoisir: (c: Choix) => void; d?: number }) {
  return (
    <>
      <Porte
        onClick={() => onChoisir({ parcours: "entreprise", transfert: "simple" })}
        d={d}
        accent
        icone="carton"
        duree="≈ 3 minutes"
        titre="Un petit transfert"
        desc="Quelques bureaux, des armoires, un photocopieur : décrivez votre mobilier, nous établissons votre devis."
        points={["Votre société", "Vos adresses", "Votre mobilier"]}
        cta="Décrire mon transfert"
      />
      <Porte
        onClick={() => onChoisir({ parcours: "entreprise", transfert: "projet" })}
        d={d + 100}
        icone="immeuble"
        duree="Rappel rapide"
        titre="Un projet important"
        desc="Un siège, un entrepôt, des machines ou des archives : expliquez votre projet, un conseiller vous rappelle."
        points={["Votre projet en quelques lignes", "Le trajet", "Le moment pour vous joindre"]}
        cta="Présenter mon projet"
      />
    </>
  );
}

/** Les trois portes, une par public. */
function PortesParcours({ onChoisir, d = 0, clair = false }: { onChoisir: (c: Choix) => void; d?: number; clair?: boolean }) {
  return (
    <>
      <PorteParcours
        d={d}
        accent
        clair={clair}
        icone="user"
        badge="Estimation en ligne"
        qui="Vous êtes un particulier"
        titre="Votre estimation"
        desc="Calculée sur notre grille tarifaire, à l'écran en quelques minutes."
        actions={[
          { label: "Devis express · 2 min", onClick: () => onChoisir({ parcours: "particulier", mode: "express" }) },
          { label: "Devis complet", onClick: () => onChoisir({ parcours: "particulier", mode: "complet" }) },
        ]}
      />
      <PorteParcours
        d={d + 100}
        clair={clair}
        icone="immeuble"
        badge="Rappel rapide"
        qui="Vous déménagez votre entreprise"
        titre="Votre transfert"
        desc="Quelques postes ou tout un site : décrivez votre projet, un conseiller vous recontacte rapidement."
        actions={[
          { label: "Un petit transfert", onClick: () => onChoisir({ parcours: "entreprise", transfert: "simple" }) },
          { label: "Un projet important", onClick: () => onChoisir({ parcours: "entreprise", transfert: "projet" }) },
        ]}
      />
      <PorteParcours
        d={d + 200}
        clair={clair}
        icone="route"
        badge="Visite ou visio"
        qui="Vous êtes muté(e)"
        titre="Votre mutation"
        desc="Décrivez votre déménagement : votre conseiller organise la visite avec vous, selon l'accord de votre entreprise."
        actions={[{ label: "Faire ma demande", onClick: () => onChoisir({ parcours: "mutation" }) }]}
      />
    </>
  );
}

/**
 * Le choix, dans une page du site officiel.
 *
 * Le site a son menu, son titre et sa photo : ici, un titre court et les
 * portes, sur le fond clair du formulaire qui suivra. Un bloc dédié à un seul
 * public — le particulier ou l'entreprise — n'en montre que les deux branches.
 */
function ChoixIntegre({ onChoisir, filtre }: { onChoisir: (c: Choix) => void; filtre: Filtre }) {
  const entete =
    filtre === "entreprise"
      ? {
          eyebrow: "Transfert d'entreprise",
          titre: (
            <>
              Déménagez votre <span className="gradient-text">entreprise</span>
            </>
          ),
          texte: "Quelques postes ou tout un site : décrivez votre projet, un conseiller vous recontacte rapidement.",
        }
      : {
          eyebrow: "Votre devis en ligne",
          titre: (
            <>
              Votre déménagement, <span className="gradient-text">estimé en temps réel</span>
            </>
          ),
          texte:
            "Décrivez votre logement en quelques minutes : volume, accès, dates. L'estimation tombe aussitôt, calculée à partir de notre grille tarifaire et confirmée par la suite par notre conseiller commercial.",
        };

  return (
    <section className="relative overflow-hidden bg-paper px-4 py-9 text-ink sm:px-7 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="halo absolute -right-48 -top-56 h-[640px] w-[640px]" style={{ "--halo": "color-mix(in srgb, var(--color-brand) 22%, transparent)" } as CSSProperties} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1100px]">
        <p className="eyebrow reveal text-brand-ink">{entete.eyebrow}</p>
        <h1 className="font-serif reveal mt-4 text-balance text-[32px] sm:text-[44px]" style={delay(60)}>
          {entete.titre}
        </h1>
        <p className="reveal mt-4 max-w-[64ch] text-[15.5px] leading-relaxed text-ink-soft sm:text-[16.5px]" style={delay(120)}>
          {entete.texte}
        </p>

        <div className={`mt-8 grid items-stretch gap-4 ${filtre ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {filtre === "particulier" ? (
            <PortesParticulier onChoisir={onChoisir} d={200} />
          ) : filtre === "entreprise" ? (
            <PortesEntreprise onChoisir={onChoisir} d={200} />
          ) : (
            <PortesParcours onChoisir={onChoisir} d={200} clair />
          )}
        </div>

        <a href={AGENCE.lien} className="reveal mt-7 inline-flex items-center gap-2.5 text-[14px] text-ink-soft transition hover:text-ink" style={delay(480)}>
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
function Hero({ onChoisir, filtre }: { onChoisir: (c: Choix) => void; filtre: Filtre }) {
  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#1b1a18] text-white">
      {/* La photo de fond, en haute définition. Le voile ne couvre que le côté
          du texte et le pied du héros : à droite, la photo reste telle quelle. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Image src="/marque/hero-salon.jpg" alt="" fill priority sizes="100vw" className="ken-burns object-cover object-center" />
        <div className="hero-voile absolute inset-0" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center gap-12 px-6 pb-12 pt-[112px] lg:px-10 lg:pb-14">
        <div className="max-w-[780px]">
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

        {/* Les portes, côte à côte sous le titre : trois publics, trois
            cartes pleines. Rien derrière : une carte translucide sur la photo
            se salissait de ce qui passait dessous. */}
        <div id="portes" className={`grid scroll-mt-24 items-stretch gap-4 ${filtre ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          {filtre === "particulier" ? (
            <PortesParticulier onChoisir={onChoisir} d={380} />
          ) : filtre === "entreprise" ? (
            <PortesEntreprise onChoisir={onChoisir} d={380} />
          ) : (
            <PortesParcours onChoisir={onChoisir} d={380} />
          )}
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

/**
 * Une porte des trois publics : qui elle accueille, ce qu'elle offre, et ses
 * branches — chacune un vrai bouton, la première mise en avant.
 */
function PorteParcours({
  accent,
  clair = false,
  icone,
  badge,
  qui,
  titre,
  desc,
  actions,
  d,
}: {
  accent?: boolean;
  /** Sur le fond clair du site : une ombre plus légère, un filet. */
  clair?: boolean;
  icone: NomIcone;
  badge: string;
  qui: string;
  titre: string;
  desc: string;
  actions: { label: string; onClick: () => void }[];
  d: number;
}) {
  return (
    <div
      className={`reveal flex h-full flex-col rounded-[26px] p-6 sm:p-7 ${
        accent ? "bg-brand text-sur-brand" : "border border-line bg-card text-ink"
      } ${clair ? "bloc" : "shadow-[0_24px_50px_-32px_rgba(27,26,24,0.45)]"}`}
      style={delay(d)}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#1b1a18] text-brand-clair sm:h-12 sm:w-12 sm:rounded-2xl">
          <Icone nom={icone} taille={20} />
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] sm:px-3 sm:py-1.5 sm:text-[11px] ${
            accent ? "bg-[#1b1a18] text-brand-clair" : "bg-subtle text-ink-mid"
          }`}
        >
          {badge}
        </span>
      </div>
      <p className={`mt-6 text-[13.5px] font-semibold ${accent ? "opacity-75" : "text-brand-ink"}`}>{qui}</p>
      <h2 className="font-serif mt-1.5 text-[26px] leading-tight sm:text-[30px]">{titre}</h2>
      <p className={`mt-3 flex-1 text-[15px] leading-relaxed ${accent ? "opacity-80" : "text-ink-soft"}`}>{desc}</p>
      <div className="mt-6 space-y-2.5">
        {actions.map((a, i) =>
          i === 0 ? (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="group flex h-12 w-full items-center justify-between gap-3 rounded-full bg-[#1b1a18] pl-5 pr-1.5 text-left text-[14.5px] font-semibold text-white transition active:scale-[0.98]"
            >
              {a.label}
              <Fleche />
            </button>
          ) : (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={`group flex h-12 w-full items-center justify-between gap-3 rounded-full border pl-5 pr-4 text-left text-[14.5px] font-semibold transition active:scale-[0.98] ${
                accent ? "border-[#1b1a18]/30 hover:border-[#1b1a18]" : "border-line-strong hover:border-ink"
              }`}
            >
              {a.label}
              <Icone nom="droite" taille={16} trait={2.4} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          ),
        )}
      </div>
    </div>
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

function Pied({ annee, onChoisir }: { annee: number; onChoisir: (c: Choix) => void }) {
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
              <button type="button" onClick={() => onChoisir({ parcours: "particulier", mode: "express" })} className={lien}>
                Devis express
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onChoisir({ parcours: "particulier", mode: "complet" })} className={lien}>
                Devis complet
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onChoisir({ parcours: "entreprise", transfert: "simple" })} className={lien}>
                Transfert d&apos;entreprise
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onChoisir({ parcours: "mutation" })} className={lien}>
                Mutation professionnelle
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
