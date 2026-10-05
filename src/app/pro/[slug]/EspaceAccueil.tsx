"use client";

import Image from "next/image";
import { useState } from "react";
import DemandeForm, { parcoursDe } from "@/app/demande/DemandeForm";
import { AGENCE, Enseigne, delai, halo } from "@/app/demande/cadre";
import { Icone, type NomIcone } from "@/app/demande/ui";
import type { LibraryPhoto } from "@/components/PhotoAnalyzer";
import { messageDe, nomEnseigne, themeEspace, titreDe, type EspacePublic } from "@/lib/espaces";

/**
 * La porte d'entrée d'un espace pro.
 *
 * Le salarié arrive par le lien que son entreprise lui a transmis : il doit
 * reconnaître son employeur avant de reconnaître Bailly. L'enseigne, la
 * couleur, le titre et le mot d'accueil sont ceux de l'espace ; la mise en
 * page, elle, reste celle du site — on est chez Bailly, pour le compte de
 * l'entreprise.
 *
 * L'accueil et le formulaire tiennent sur la même adresse : commencer ne
 * recharge rien, et la flèche de retour ramène ici.
 */
export default function EspaceAccueil({
  espace,
  library,
  direct = false,
}: {
  espace: EspacePublic;
  library: LibraryPhoto[];
  /** Ouvrir directement le formulaire, sans passer par l'accueil. */
  direct?: boolean;
}) {
  const [ouvert, setOuvert] = useState(direct);

  const aller = (versFormulaire: boolean) => {
    setOuvert(versFormulaire);
    window.scrollTo({ top: 0 });
  };

  if (ouvert) return <DemandeForm library={library} espace={espace} onQuitter={() => aller(false)} />;

  const etapes = parcoursDe(espace);
  const express = espace.parcours === "express";
  const marque = { nom: nomEnseigne(espace), logo: espace.logo };
  const standard = espace.slug === "standard";

  const promesses: [NomIcone, string, string][] = [
    ["user", "Un conseiller dédié", "Il connaît votre entreprise et reprend votre dossier."],
    espace.afficher_estimation
      ? ["euro", "Votre estimation aussitôt", "Calculée sur notre grille tarifaire."]
      : ["horloge", "Une réponse rapide", "Nos équipes reviennent vers vous sous 24 h ouvrées."],
    ["bouclier", "En toute confidentialité", "Vos informations ne servent qu'à votre déménagement."],
  ];

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-paper text-ink" style={themeEspace(espace.couleur)}>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="halo absolute -right-40 -top-48 h-[720px] w-[720px]" style={halo(34)} />
        <div className="halo absolute -left-56 bottom-[-260px] h-[620px] w-[620px]" style={halo(18)} />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-6 pt-7 lg:px-10">
        <Enseigne marque={marque} />
        <a
          href={AGENCE.lien}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong bg-card px-4 text-[13.5px] font-semibold transition hover:border-ink"
        >
          <Icone nom="tel" taille={15} />
          <span className="hidden sm:inline">{AGENCE.numero}</span>
          <span className="sm:hidden">Appeler</span>
        </a>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-12 px-6 pb-14 pt-12 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:gap-14 lg:px-10 lg:pt-10">
        <div>
          <div className="reveal max-w-fit" style={delai(60)}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-3.5 py-1.5 text-[12.5px] font-medium text-ink-mid">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-mid" />
              {standard ? "Espace réservé aux entreprises" : `Espace réservé aux collaborateurs de ${espace.nom}`}
            </span>
          </div>

          <h1 className="font-serif reveal mt-6 text-balance text-[40px] sm:text-[52px] xl:text-[60px]" style={delai(160)}>
            <TitreAccentue titre={titreDe(espace)} nom={espace.nom} />
          </h1>

          <p className="reveal mt-6 max-w-[54ch] whitespace-pre-line text-[17px] leading-relaxed text-ink-soft sm:text-[18px]" style={delai(260)}>
            {messageDe(espace)}
          </p>

          <div className="reveal mt-9 flex flex-wrap items-center gap-x-5 gap-y-4" style={delai(360)}>
            <button
              type="button"
              onClick={() => aller(true)}
              className="group inline-flex h-14 items-center gap-3.5 rounded-full bg-ink pl-7 pr-2 text-[15.5px] font-semibold text-shell shadow-[0_22px_44px_-22px_rgba(27,26,24,0.7)] transition-[translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_50px_-22px_rgba(27,26,24,0.8)] active:translate-y-0"
            >
              Commencer ma demande
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sur-brand transition-transform duration-300 group-hover:translate-x-0.5">
                <Icone nom="droite" taille={17} trait={2.4} />
              </span>
            </button>
            <span className="flex items-center gap-2 text-[14px] text-ink-soft">
              <Icone nom="horloge" taille={15} />
              {express ? "Deux minutes, sans engagement" : "Cinq minutes, sans engagement"}
            </span>
          </div>

          <ul className="reveal mt-12 grid gap-5 border-t border-line-strong pt-8 sm:grid-cols-3" style={delai(460)}>
            {promesses.map(([icone, titre, texte]) => (
              <li key={titre}>
                <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-brand-soft text-brand-ink">
                  <Icone nom={icone} taille={18} />
                </span>
                <span className="mt-3.5 block text-[14.5px] font-semibold">{titre}</span>
                <span className="mt-1 block text-[13px] leading-snug text-ink-soft">{texte}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Le parcours annoncé, posé sur la photo encadrée — comme sur la vitrine. */}
        <div className="relative">
          <div
            aria-hidden
            className="reveal absolute -bottom-7 -right-5 -top-9 left-10 overflow-hidden rounded-[36px] shadow-[0_40px_80px_-40px_rgba(27,26,24,0.55)] sm:left-16"
            style={delai(240)}
          >
            <Image src="/login-interieur.jpg" alt="" fill priority sizes="(min-width: 1024px) 560px, 100vw" className="ken-burns object-cover" />
          </div>

          <div
            className="reveal relative my-2 mr-6 overflow-hidden rounded-[28px] border border-line bg-card shadow-[0_30px_60px_-34px_rgba(27,26,24,0.6)] sm:mr-12"
            style={delai(380)}
          >
            <div className="flex items-center justify-between gap-4 bg-brand px-6 py-5 text-sur-brand sm:px-7">
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] opacity-70">Votre parcours</p>
                <p className="font-serif mt-1.5 text-balance text-[22px] leading-[1.05] sm:text-[27px]">
                  {express ? "Demande express" : "Demande détaillée"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#1b1a18] px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-brand-clair">
                {etapes.length} étapes
              </span>
            </div>

            <ol className="px-6 py-3 sm:px-7">
              {etapes.map((e, i) => (
                <li key={e.label} className="flex items-center gap-4 border-b border-line py-3.5 last:border-0">
                  <span className="font-serif flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-[15px] tnum">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold leading-tight">{e.label}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-soft">{e.sous}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="border-t border-line bg-subtle px-6 py-5 sm:px-7">
              <button
                type="button"
                onClick={() => aller(true)}
                className="group flex h-12 w-full items-center justify-between rounded-full bg-brand pl-6 pr-1.5 text-[14.5px] font-semibold text-sur-brand transition active:scale-[0.99]"
              >
                Commencer
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1b1a18] text-brand-clair transition-transform duration-300 group-hover:translate-x-0.5">
                  <Icone nom="droite" taille={16} trait={2.4} />
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-[1200px] px-6 pb-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-line-strong pt-6 text-[12.5px] text-ink-soft">
          <span>
            Un service <span className="font-semibold text-ink">Bailly Déménagement</span>
            {standard ? " pour les entreprises." : ` pour ${espace.nom}.`}
          </span>
          <span>
            Une question ?{" "}
            <a href={AGENCE.lien} className="font-semibold text-ink underline-offset-4 hover:underline">
              {AGENCE.numero}
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Le titre, avec son mot mis en avant : le nom de l'entreprise s'il y figure,
 * sinon le dernier mot. Le titre est libre — l'équipe l'écrit comme elle
 * veut — et l'accent doit tomber juste sans qu'elle ait à y penser.
 */
function TitreAccentue({ titre, nom }: { titre: string; nom: string }) {
  const i = nom ? titre.toLowerCase().lastIndexOf(nom.toLowerCase()) : -1;
  if (i >= 0)
    return (
      <>
        {titre.slice(0, i)}
        <span className="gradient-text">{titre.slice(i, i + nom.length)}</span>
        {titre.slice(i + nom.length)}
      </>
    );
  const mots = titre.split(/\s+/);
  if (mots.length < 2) return <span className="gradient-text">{titre}</span>;
  const coupe = mots.length - 1;
  return (
    <>
      {mots.slice(0, coupe).join(" ")} <span className="gradient-text">{mots.slice(coupe).join(" ")}</span>
    </>
  );
}
