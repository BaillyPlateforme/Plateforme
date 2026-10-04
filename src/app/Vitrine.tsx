"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import Reveal from "./Reveal";
import SiteHeader from "./SiteHeader";
import { Icone, type NomIcone } from "./demande/ui";
import { FORMULES, PRESTATIONS, TRANCHES_DISTANCE, TVA_DEFAUT, type Formule } from "@/lib/pricing/grille";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/* Le nombre de gestes pris en charge par Bailly, formule par formule : il est
   lu dans la grille plutôt que recopié, pour ne jamais mentir sur la page. */
const LIGNES = PRESTATIONS.flatMap((c) => c.lignes);
const TOTAL = LIGNES.length;
const COMPTE: Record<Formule, number> = {
  eco: LIGNES.filter((l) => l.eco === "Bailly").length,
  standard: LIGNES.filter((l) => l.standard === "Bailly").length,
  luxe: LIGNES.filter((l) => l.luxe === "Bailly").length,
};
// Espace fine insécable entre les milliers : toLocaleString dépend de l'ICU
// embarqué par le serveur, qui ne la met pas toujours.
const PORTEE_KM = String(TRANCHES_DISTANCE[TRANCHES_DISTANCE.length - 1].max).replace(
  /\B(?=(\d{3})+(?!\d))/g,
  " ",
);

const AGENCE = { lien: "tel:+33169103520", numero: "01 69 10 35 20" };

/** Ce que choisit le visiteur : l'un des deux parcours de devis. */
export type Parcours = "express" | "complet";

export default function Vitrine({
  onChoisir,
  annee,
}: {
  onChoisir: (p: Parcours) => void;
  annee: number;
}) {
  return (
    <>
      <SiteHeader onChoisir={onChoisir} />

      <main className="flex-1">
        <Hero onChoisir={onChoisir} />
        <Parcours onChoisir={onChoisir} />
        <Formules onChoisir={onChoisir} />
        <Promesses onChoisir={onChoisir} />
        <Fin onChoisir={onChoisir} />
      </main>

      <Pied annee={annee} onChoisir={onChoisir} />
    </>
  );
}

/** La flèche d'un bouton, dans son rond. */
function Fleche({ sombre = false }: { sombre?: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 ${
        sombre ? "bg-[#1b1a18] text-brand" : "bg-brand text-[#1b1a18]"
      }`}
    >
      <Icone nom="droite" taille={16} trait={2.4} />
    </span>
  );
}

/* ─────────────────────────── Héros ─────────────────────────── */

/* Les noirs du héros sont écrits en dur : il reste sombre quel que soit le
   thème, là où `bg-ink` s'éclaircirait de nuit. */
function Hero({ onChoisir }: { onChoisir: (p: Parcours) => void }) {
  return (
    <section className="grain relative flex min-h-[100svh] flex-col overflow-hidden bg-[#1b1a18]">
      <Image
        src="/login-interieur.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="ken-burns object-cover object-center"
      />

      {/* Voiles : la photo reste présente, le texte se lit sans effort. Le
          voile de gauche assoit le titre ; celui du bas, les chiffres. */}
      <div className="absolute inset-0 bg-[#1b1a18]/66" />
      <div className="absolute inset-0 bg-linear-to-r from-[#1b1a18]/85 via-[#1b1a18]/35 to-transparent" />
      <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/70 via-transparent to-[#1b1a18]/95" />
      <div className="halo drift absolute -left-40 top-24 h-[520px] w-[520px]" style={{ "--halo": "rgba(245,208,51,0.18)" } as CSSProperties} />

      <div className="relative z-10 mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-12 px-6 pb-12 pt-[112px] lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] lg:gap-14 lg:px-10 lg:pb-14">
        <div>
          <div className="reveal max-w-fit" style={delay(60)}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-3.5 py-1.5 text-[12.5px] font-medium text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Déménagements particuliers et entreprises
            </span>
          </div>

          <h1
            className="font-serif reveal mt-6 text-balance text-[44px] text-white sm:text-[56px] xl:text-[66px]"
            style={delay(160)}
          >
            Votre déménagement, <span className="gradient-flow-light">chiffré tout de suite</span>
          </h1>

          <p
            className="reveal mt-6 max-w-[52ch] text-[17px] leading-relaxed text-white/85 sm:text-[18px]"
            style={delay(260)}
          >
            Décrivez votre logement en quelques minutes : volume, accès, dates. L&apos;estimation
            tombe aussitôt, calculée sur notre grille tarifaire — la même que celle du commercial,
            au centime près.
          </p>

          <ul className="reveal mt-8 flex flex-wrap gap-x-7 gap-y-3" style={delay(360)}>
            {["Sans engagement", "Estimation immédiate", "Réponse sous 24 h ouvrées"].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[14.5px] font-medium text-white">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[#1b1a18]">
                  <Icone nom="check" taille={11} trait={3.4} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Les deux parcours de devis : le rapide et le détaillé. */}
        <div>
          <p className="eyebrow reveal mb-4 text-white/70" style={delay(300)}>
            Choisissez votre devis
          </p>
          <div className="space-y-4">
            <Porte
              onClick={() => onChoisir("express")}
              d={380}
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
              d={480}
              icone="liste"
              duree="Sur mesure"
              titre="Devis complet"
              desc="Le dossier détaillé, pour un devis au plus juste : vos accès, vos prestations, vos garanties."
              points={["Conditions d'accès", "Prestations et formule", "Garantie et inventaire"]}
              cta="Commencer le devis complet"
            />
          </div>
        </div>
      </div>

      {/* Bandeau de chiffres, au pied du héros. */}
      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6 pb-12 lg:px-10">
        <div
          className="reveal grid grid-cols-2 gap-x-8 gap-y-6 border-t border-white/18 pt-7 sm:grid-cols-4"
          style={delay(620)}
        >
          <Chiffre valeur="3 min" legende="pour une estimation complète" />
          <Chiffre valeur="3" legende="formules, de l'économique au premium" />
          <Chiffre valeur={`${PORTEE_KM} km`} legende="de portée, France entière" />
          <Chiffre valeur="1 grille" legende="même tarif en ligne et au bureau" />
        </div>
      </div>
    </section>
  );
}

/**
 * Une porte d'entrée vers un devis.
 *
 * Une carte pleine, pas un verre dépoli : posé sur la photo, un fond
 * translucide laissait passer les fenêtres derrière le texte, et un reflet
 * balayait les lignes. Ici le texte est noir sur un aplat — jaune pour le
 * parcours rapide, blanc pour le détaillé — et l'action est un vrai bouton.
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
      className={`reveal group relative block w-full rounded-[26px] p-6 text-left text-[#1b1a18] shadow-[0_36px_70px_-36px_rgba(0,0,0,0.9)] transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_46px_80px_-36px_rgba(0,0,0,0.95)] active:translate-y-0 sm:p-7 ${
        accent ? "bg-linear-to-br from-[#ffe668] via-brand to-[#efc52b]" : "bg-[#fbfaf7]"
      }`}
      style={delay(d)}
    >
      <span className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#1b1a18] text-brand sm:h-12 sm:w-12 sm:rounded-2xl">
            <Icone nom={icone} taille={20} />
          </span>
          <span className="font-serif block text-[21px] leading-none sm:text-[28px]">{titre}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] sm:px-3 sm:py-1.5 sm:text-[11.5px] ${
            accent ? "bg-[#1b1a18] text-brand" : "bg-[#1b1a18]/8 text-[#1b1a18]"
          }`}
        >
          {duree}
        </span>
      </span>

      <span className="mt-5 block text-[15.5px] leading-relaxed text-[#1b1a18]/80">{desc}</span>

      <span className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {points.map((p) => (
          <span key={p} className="flex items-center gap-2 text-[14px] font-medium">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#1b1a18] text-brand">
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
      <div className="font-serif text-[30px] leading-none text-white sm:text-[34px]">{valeur}</div>
      <div className="mt-2.5 text-[13.5px] leading-snug text-white/70">{legende}</div>
    </div>
  );
}

/* ─────────────────────────── En-tête de section ─────────────────────────── */

function Entete({
  surtitre,
  titre,
  texte,
  sombre = false,
}: {
  surtitre: string;
  titre: React.ReactNode;
  texte: string;
  sombre?: boolean;
}) {
  return (
    <Reveal className="max-w-[54ch]">
      <p className={`eyebrow ${sombre ? "text-brand" : "text-brand-ink"}`}>{surtitre}</p>
      <h2 className={`font-serif mt-4 text-balance text-[36px] sm:text-[46px] ${sombre ? "text-white" : ""}`}>
        {titre}
      </h2>
      <p className={`mt-5 text-[16.5px] leading-relaxed ${sombre ? "text-white/78" : "text-ink-soft"}`}>{texte}</p>
    </Reveal>
  );
}

/* ─────────────────────────── Parcours client ─────────────────────────── */

const ETAPES: { titre: string; texte: string; icone: NomIcone }[] = [
  {
    titre: "Vous décrivez",
    texte:
      "Adresses, volume, étages, ascenseur, distance de portage. Chaque réponse pèse dans le prix — rien n'est demandé pour rien.",
    icone: "crayon",
  },
  {
    titre: "Les photos font le volume",
    texte:
      "Pièce par pièce, vos photos donnent une estimation du volume à déménager. Les doublons sont écartés.",
    icone: "photo",
  },
  {
    titre: "Le prix s'affiche",
    texte:
      "Transport, monte-meubles, portage, garanties : chaque ligne est détaillée, et les trois formules sont comparées côte à côte.",
    icone: "euro",
  },
  {
    titre: "Un commercial reprend la main",
    texte:
      "Votre demande arrive dans le poste de pilotage. Un devis ferme vous est envoyé, sur la base de ce que vous avez rempli.",
    icone: "tel",
  },
];

function Parcours({ onChoisir }: { onChoisir: (p: Parcours) => void }) {
  return (
    <section id="parcours" className="scroll-mt-20 bg-paper py-24 lg:py-32">
      <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-10">
        <Entete
          surtitre="Le parcours client"
          titre={
            <>
              Quatre étapes, et <span className="gradient-text">le prix est là</span>
            </>
          }
          texte="Pas de rappel obligatoire, pas de visite pour savoir combien ça coûte. Le calcul est le nôtre, appliqué sur place, avec le détail de chaque ligne."
        />

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((e, i) => (
            <Reveal
              as="li"
              key={e.titre}
              delay={i * 90}
              className="bloc group flex flex-col rounded-[26px] border border-line bg-card p-7"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink transition-colors duration-300 group-hover:bg-[#1b1a18] group-hover:text-brand">
                  <Icone nom={e.icone} taille={21} />
                </span>
                <span className="font-serif text-[42px] leading-none text-line-strong transition-colors duration-300 group-hover:text-brand-mid">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-7 text-[18px] font-semibold leading-snug tracking-[-0.01em]">{e.titre}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{e.texte}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={220} className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            onClick={() => onChoisir("express")}
            className="group inline-flex h-[52px] items-center gap-3 rounded-full bg-ink pl-6 pr-2 text-[15px] font-semibold text-shell shadow-[0_18px_34px_-18px_rgba(27,26,24,0.8)] transition active:scale-[0.98]"
          >
            Demander mon estimation
            <Fleche />
          </button>
          <span className="text-[14px] text-ink-soft">
            Sans engagement · réponse d&apos;un commercial sous 24 h ouvrées
          </span>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────── Formules ─────────────────────────── */

const ICONE_FORMULE: Record<Formule, NomIcone> = { eco: "carton", standard: "verre", luxe: "couronne" };

const RESUME: Record<Formule, string[]> = {
  eco: [
    "Vous emballez, nous chargeons et remontons",
    "Démontage et remontage des meubles courants",
    "Véhicule et personnel spécialisé",
  ],
  standard: [
    "Nous emballons le fragile et l'électroménager",
    "Cartons et protections fournis",
    "Démontage, remontage et mise en place",
  ],
  luxe: [
    "Nous emballons et déballons tout",
    "Meubles fixés démontés et reposés",
    "Rangement et évacuation des emballages",
  ],
};

function Formules({ onChoisir }: { onChoisir: (p: Parcours) => void }) {
  return (
    <section id="formules" className="scroll-mt-20 border-y border-line bg-card py-24 lg:py-32">
      <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-10">
        <Entete
          surtitre="Nos formules"
          titre={
            <>
              Vous choisissez ce que <span className="gradient-text">vous nous confiez</span>
            </>
          }
          texte="Trois niveaux de prise en charge, du carton que vous faites vous-même au déménagement où vous n'avez rien à toucher."
        />

        <div className="mt-16 grid items-stretch gap-5 lg:grid-cols-3">
          {FORMULES.map((f, i) => {
            // La formule la plus choisie passe en noir : elle se détache des
            // deux autres sans qu'il faille la désigner d'une flèche.
            const vedette = f.key === "standard";
            return (
              <Reveal
                key={f.key}
                delay={i * 110}
                className={`relative flex flex-col rounded-[28px] border p-7 sm:p-8 ${
                  vedette
                    ? "border-[#1b1a18] bg-[#1b1a18] text-white shadow-[0_40px_70px_-40px_rgba(27,26,24,0.9)] lg:-my-3"
                    : "bloc border-line bg-paper"
                }`}
              >
                {vedette && (
                  <span className="absolute -top-3.5 left-8 rounded-full bg-brand px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#1b1a18]">
                    Le plus choisi
                  </span>
                )}
                <div className="flex items-center gap-3.5">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                      vedette ? "bg-brand text-[#1b1a18]" : "bg-[#1b1a18] text-brand"
                    }`}
                  >
                    <Icone nom={ICONE_FORMULE[f.key]} taille={21} />
                  </span>
                  <h3 className="font-serif text-[26px] leading-none">{f.label}</h3>
                </div>
                <p className={`mt-5 min-h-[52px] text-[15.5px] leading-relaxed ${vedette ? "text-white/78" : "text-ink-soft"}`}>
                  {f.description}
                </p>

                <div className={`mt-6 border-t pt-6 ${vedette ? "border-white/15" : "border-line-strong"}`}>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-serif text-[46px] leading-none tnum ${vedette ? "text-brand" : ""}`}>
                      {COMPTE[f.key]}
                    </span>
                    <span className={`text-[14px] ${vedette ? "text-white/70" : "text-ink-soft"}`}>
                      gestes pris en charge sur {TOTAL}
                    </span>
                  </div>
                  <div className={`mt-4 h-2 overflow-hidden rounded-full ${vedette ? "bg-white/15" : "bg-line-strong"}`}>
                    <div
                      className={`draw-line h-full rounded-full ${vedette ? "bg-brand" : "bg-ink"}`}
                      style={{ width: `${(COMPTE[f.key] / TOTAL) * 100}%` }}
                    />
                  </div>
                </div>

                <ul className="mt-7 flex-1 space-y-3.5">
                  {RESUME[f.key].map((l) => (
                    <li key={l} className="flex gap-3 text-[15px] leading-snug">
                      <span
                        className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          vedette ? "bg-brand text-[#1b1a18]" : "bg-[#1b1a18] text-brand"
                        }`}
                      >
                        <Icone nom="check" taille={11} trait={3.4} />
                      </span>
                      {l}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => onChoisir("complet")}
                  className={`group mt-9 inline-flex h-[52px] items-center justify-between gap-3 rounded-full pl-6 pr-2 text-[15px] font-semibold transition active:scale-[0.98] ${
                    vedette ? "bg-brand text-[#1b1a18]" : "bg-ink text-shell"
                  }`}
                >
                  Estimer avec cette formule
                  <Fleche sombre={vedette} />
                </button>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={260} className="mt-10 max-w-[90ch] text-[14px] leading-relaxed text-ink-soft">
          Prix établis au volume et à la distance, sur notre grille. Suppléments détaillés ligne
          par ligne sur le devis : portage, monte-meubles, charges lourdes, garanties. TVA {TVA_DEFAUT} %.
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────── Ce qui change ─────────────────────────── */

const PROMESSES: { titre: string; texte: string; icone: NomIcone }[] = [
  { titre: "Un prix tout de suite", texte: "Pas d'attente, pas de rappel obligatoire pour connaître le montant.", icone: "eclair" },
  { titre: "La grille du commercial", texte: "Le calcul en ligne est le nôtre, au centime près.", icone: "reglages" },
  { titre: "Le volume par la photo", texte: "Pièce par pièce, vos photos estiment ce qu'il y a à déménager.", icone: "photo" },
  { titre: "Chaque ligne détaillée", texte: "Transport, portage, monte-meubles, garanties : rien n'est caché.", icone: "liste" },
  { titre: "Sans engagement", texte: "Vous gardez l'estimation et vous nous rappelez quand vous voulez.", icone: "bouclier" },
  { titre: "Une date tenue", texte: "Équipes et camions sont réservés dès l'accord sur le devis.", icone: "calendrier" },
];

function Promesses({ onChoisir }: { onChoisir: (p: Parcours) => void }) {
  return (
    <section id="promesses" className="grain relative scroll-mt-20 overflow-hidden bg-[#1b1a18] py-24 lg:py-32">
      <div className="halo drift absolute -right-32 top-0 h-[460px] w-[460px]" style={{ "--halo": "rgba(245,208,51,0.2)" } as CSSProperties} />
      <div
        className="halo drift absolute -left-40 bottom-0 h-[420px] w-[420px]"
        style={{ animationDuration: "22s", animationDelay: "-6s", "--halo": "rgba(255,255,255,0.08)" } as CSSProperties}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1200px] gap-14 px-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-16 lg:px-10">
        <div>
          <Entete
            sombre
            surtitre="Ce qui change"
            titre={
              <>
                Un déménagement <span className="gradient-flow-light">sans zone d&apos;ombre</span>
              </>
            }
            texte="Vous savez ce que vous payez, et pourquoi. Le devis reprend ligne par ligne ce que vous avez rempli — rien ne s'ajoute en cours de route."
          />

          <Reveal delay={120} className="mt-9 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onChoisir("express")}
              className="group inline-flex h-[52px] items-center gap-3 rounded-full bg-brand pl-6 pr-2 text-[15px] font-semibold text-[#1b1a18] transition active:scale-[0.98]"
            >
              Faire mon estimation
              <Fleche sombre />
            </button>
            <a
              href="#formules"
              className="inline-flex h-[52px] items-center rounded-full border border-white/30 px-6 text-[15px] font-semibold text-white transition hover:border-white/70 hover:bg-white/10"
            >
              Voir les formules
            </a>
          </Reveal>

          <Reveal delay={180} as="p" className="mt-7 flex items-center gap-2.5 text-[13px] text-white/65">
            <Icone nom="bouclier" taille={15} />
            Vos données restent chez nous · hébergement en Europe
          </Reveal>
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          {PROMESSES.map((o, i) => (
            <Reveal
              key={o.titre}
              delay={i * 70}
              className="rounded-[22px] border border-white/14 bg-white/[0.07] p-6 transition-colors duration-300 hover:border-brand/50 hover:bg-white/[0.11]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand text-[#1b1a18]">
                <Icone nom={o.icone} taille={20} />
              </span>
              <p className="mt-5 text-[17px] font-semibold leading-snug text-white">{o.titre}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-white/75">{o.texte}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Dernier appel ─────────────────────────── */

function Fin({ onChoisir }: { onChoisir: (p: Parcours) => void }) {
  return (
    <section className="bg-paper px-6 py-20 lg:px-10 lg:py-24">
      <Reveal className="grain relative mx-auto w-full max-w-[1200px] overflow-hidden rounded-[36px] bg-[#1b1a18] px-7 py-16 text-center sm:px-14 sm:py-20">
        <Image src="/login-interieur.jpg" alt="" fill sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-[#1b1a18]/76" />
        <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/70 via-[#1b1a18]/30 to-[#1b1a18]/92" />
        <div
          className="halo drift absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2"
          style={{ "--halo": "rgba(245,208,51,0.22)" } as CSSProperties}
        />

        <div className="relative z-10">
          <p className="eyebrow text-brand">Votre estimation</p>
          <h2 className="font-serif mx-auto mt-4 max-w-[17ch] text-balance text-[36px] text-white sm:text-[52px]">
            Combien coûte votre <span className="gradient-flow-light">déménagement</span>&nbsp;?
          </h2>
          <p className="mx-auto mt-5 max-w-[50ch] text-[17px] leading-relaxed text-white/82">
            La réponse tient en trois minutes. Vous gardez le devis, vous nous rappelez quand
            vous voulez.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => onChoisir("express")}
              className="group inline-flex h-14 items-center gap-3 rounded-full bg-brand pl-7 pr-2.5 text-[15.5px] font-semibold text-[#1b1a18] shadow-[0_22px_44px_-18px_rgba(245,208,51,0.75)] transition active:scale-[0.98]"
            >
              Faire mon estimation
              <Fleche sombre />
            </button>
            <button
              type="button"
              onClick={() => onChoisir("complet")}
              className="inline-flex h-14 items-center rounded-full border border-white/35 px-7 text-[15.5px] font-semibold text-white transition hover:border-white/80 hover:bg-white/10"
            >
              Devis complet
            </button>
          </div>
          <a
            href={AGENCE.lien}
            className="mt-8 inline-flex items-center gap-2.5 text-[14.5px] text-white/75 transition hover:text-white"
          >
            <Icone nom="tel" taille={15} />
            Ou appelez-nous : <span className="font-semibold text-white">{AGENCE.numero}</span>
          </a>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────── Pied de page ─────────────────────────── */

function Pied({ annee, onChoisir }: { annee: number; onChoisir: (p: Parcours) => void }) {
  const lien = "text-[14.5px] text-white/75 transition hover:text-white";
  return (
    <footer className="bg-[#1b1a18] text-white">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-6 py-14 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:px-10">
        <div>
          <Image
            src="/marque/bailly-logo-blanc.svg"
            alt="Bailly Déménagement"
            width={200}
            height={64}
            className="h-auto w-[170px]"
          />
          <p className="mt-5 text-[16px] font-medium text-brand">Déménagez où vous voulez&nbsp;!</p>
          <p className="mt-3 max-w-[38ch] text-[13.5px] leading-relaxed text-white/60">
            Membre FIDI et IAM, accrédité FAIM, certifié ISO 9001, 14001 et 45001.
          </p>
        </div>

        <div>
          <p className="eyebrow text-white/50">Votre devis</p>
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
            <li>
              <a href="#formules" className={lien}>
                Nos formules
              </a>
            </li>
            <li>
              <a href="#parcours" className={lien}>
                Comment ça marche
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="eyebrow text-white/50">Nous joindre</p>
          <a href={AGENCE.lien} className="font-serif mt-4 block text-[26px] leading-none text-white transition hover:text-brand">
            {AGENCE.numero}
          </a>
          <a
            href="https://www.demenagements-bailly.com/"
            target="_blank"
            rel="noreferrer"
            className={`mt-4 inline-block ${lien}`}
          >
            demenagements-bailly.com
          </a>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[13px] text-white/50 lg:px-10">
          <span>© {annee} Bailly Déménagement · BD Moving Group</span>
          <span>Estimations indicatives, sans valeur de devis contractuel.</span>
        </div>
      </div>
    </footer>
  );
}
