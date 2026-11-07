"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icone } from "@/ui/icones";
import type { Evenement, Famille } from "./donnees";
import s from "./parcours.module.css";

/*
 * La frise chronologique d'un dossier : tous les événements, de la demande
 * du site à l'avis, dans l'ordre du temps, regroupés par mois. Ce qui est
 * prévu (une visite, un chargement) passe après le repère « Aujourd'hui ».
 * Des pastilles filtrent par source ; chaque événement mène là où l'on agit.
 */

const FAMILLES: { cle: Famille; label: string }[] = [
  { cle: "site", label: "Site" },
  { cle: "crm", label: "CRM" },
  { cle: "rdv", label: "Rendez-vous" },
  { cle: "devis", label: "Devis" },
  { cle: "argent", label: "Argent" },
  { cle: "exploitation", label: "Exploitation" },
  { cle: "espace", label: "Espace client" },
];
const NOM_FAMILLE = Object.fromEntries(FAMILLES.map((f) => [f.cle, f.label])) as Record<Famille, string>;

const PARIS = "Europe/Paris";
const mois = (e: Evenement) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: e.jour ? "UTC" : PARIS }).format(new Date(e.quand));
const jour = (e: Evenement) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: e.jour ? "UTC" : PARIS }).format(new Date(e.quand));
const heure = (e: Evenement) => (e.jour ? null : new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS }).format(new Date(e.quand)));
const initiales = (nom: string) =>
  nom
    .split(/[\s,]+/)
    .filter((m) => /^[A-ZÀ-Ý]/.test(m))
    .slice(0, 2)
    .map((m) => m[0])
    .join("") || nom.slice(0, 1).toUpperCase();

export default function Frise({ evenements, aujourdhui }: { evenements: Evenement[]; aujourdhui: string }) {
  const [filtre, setFiltre] = useState<Famille | null>(null);
  const presentes = useMemo(() => FAMILLES.filter((f) => evenements.some((e) => e.famille === f.cle)), [evenements]);
  const liste = filtre ? evenements.filter((e) => e.famille === filtre) : evenements;

  // Les lignes : en-têtes de mois, événements, et le repère du jour à sa place.
  const lignes: React.ReactNode[] = [];
  let moisCourant = "";
  let repere = false;
  const poserRepere = () => {
    repere = true;
    lignes.push(
      <li key="aujourdhui" className={s.aujourdhui}>
        <span>
          <i />
          Aujourd&apos;hui · {aujourdhui}
        </span>
      </li>,
    );
  };
  for (const e of liste) {
    if (e.avenir && !repere) poserRepere();
    const m = mois(e);
    if (m !== moisCourant) {
      moisCourant = m;
      lignes.push(
        <li key={`m-${m}-${e.id}`} className={s.mois}>
          <span>{m}</span>
        </li>,
      );
    }
    lignes.push(
      <li key={e.id} className={s.evenement} data-famille={e.famille} data-ton={e.ton} data-avenir={e.avenir || undefined}>
        <time className={s.quand} dateTime={e.quand}>
          <b>{jour(e)}</b>
          {heure(e) && <small>{heure(e)}</small>}
        </time>
        <span className={s.noeud} aria-hidden>
          <Icone nom={e.icone} taille={15} />
        </span>
        <div className={s.contenu}>
          <div className={s.contenuHaut}>
            <p className={s.titreEv}>{e.titre}</p>
            {e.avenir && <span className={s.prevu}>Prévu</span>}
          </div>
          {e.detail && <p className={s.detailEv}>{e.detail}</p>}
          <div className={s.meta}>
            <span className={s.auteur}>
              <i aria-hidden>{initiales(e.auteur)}</i>
              {e.auteur}
            </span>
            {e.auteur !== NOM_FAMILLE[e.famille] && (
              <span className={s.source}>
                <i aria-hidden />
                {NOM_FAMILLE[e.famille]}
              </span>
            )}
            {e.href && (
              <Link href={e.href} className={s.agir}>
                {e.lien ?? "Ouvrir"}
                <Icone nom="fleche" taille={13} />
              </Link>
            )}
          </div>
        </div>
      </li>,
    );
  }
  if (!repere && !filtre) poserRepere();

  return (
    <section className={`${s.carte} ${s.frise}`} aria-label="Chronologie du dossier">
      <header className={s.friseTete}>
        <div>
          <h2>Chronologie</h2>
          <p>Demande, CRM, devis, argent, exploitation et espace client, dans l&apos;ordre.</p>
        </div>
        <div className={s.familles} role="group" aria-label="Filtrer par source">
          <button type="button" aria-pressed={!filtre} onClick={() => setFiltre(null)}>
            Tout <em>{evenements.length}</em>
          </button>
          {presentes.map((f) => (
            <button key={f.cle} type="button" data-famille={f.cle} aria-pressed={filtre === f.cle} onClick={() => setFiltre(filtre === f.cle ? null : f.cle)}>
              <i aria-hidden />
              {f.label} <em>{evenements.filter((e) => e.famille === f.cle).length}</em>
            </button>
          ))}
        </div>
      </header>
      {liste.length === 0 ? <p className={s.videFrise}>Aucun événement pour cette source.</p> : <ol className={s.rail}>{lignes}</ol>}
    </section>
  );
}
