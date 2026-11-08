"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { sourceLabel } from "@/app/(interne)/(coque)/dashboard/status";
import { Icone } from "@/ui/icones";
import s from "./filtres.module.css";

/** D'où vient la demande : le formulaire du site, ou un mail reçu (l'ancienne « Messagerie » de la section). */
export type Origine = "all" | "form" | "email";
export type Tri = "date" | "potentiel" | "difficulte" | "volume" | "estimation";
/**
 * L'étape d'une demande, celle du Parcours : une sous-étape de « Demande »
 * (nouvelle, en analyse, qualifiée), acceptée (elle a son dossier), ou sortie
 * du parcours (perdue, archivée). Voir parcours/demandes-commun.ts.
 */
export type EtapeDemande = "all" | "new" | "analyzing" | "qualified" | "dossier" | "lost" | "archived";
export type Filtres = { q: string; etape: EtapeDemande; origine: Origine; tri: Tri; potentiel: boolean };

export const ETAPES: { cle: Exclude<EtapeDemande, "all">; label: string }[] = [
  { cle: "new", label: "Nouvelle" },
  { cle: "analyzing", label: "En analyse" },
  { cle: "qualified", label: "Qualifiée" },
  { cle: "dossier", label: "Acceptée" },
  { cle: "lost", label: "Perdue" },
  { cle: "archived", label: "Archivée" },
];

const TRIS: { cle: Tri; label: string }[] = [
  { cle: "date", label: "Tri : récentes" },
  { cle: "potentiel", label: "Tri : potentiel" },
  { cle: "difficulte", label: "Tri : difficulté" },
  { cle: "volume", label: "Tri : volume" },
  { cle: "estimation", label: "Tri : estimation" },
];
const VIDES: Filtres = { q: "", etape: "all", origine: "all", tri: "date", potentiel: false };

/**
 * Les filtres de la liste, lus dans l'adresse : ?q=, ?statut= (l'étape),
 * ?source= (form ou email), ?tri=, ?potentiel=fort. Les anciens statuts
 * « Devis envoyé » et « Gagnée » d'une demande se lisent « Qualifiée ».
 */
export function lireFiltres(p: { get(nom: string): string | null }): Filtres {
  const brut = p.get("statut");
  const statut = brut === "quoted" || brut === "won" ? "qualified" : brut;
  const source = p.get("source");
  const tri = p.get("tri");
  return {
    q: p.get("q") ?? "",
    etape: ETAPES.some((e) => e.cle === statut) ? (statut as EtapeDemande) : "all",
    origine: source === "form" || source === "email" ? source : "all",
    tri: TRIS.some((t) => t.cle === tri) ? (tri as Tri) : "date",
    potentiel: p.get("potentiel") === "fort",
  };
}

/** Écrit les filtres dans l'adresse, sans recharger : la liste les lit aussitôt, et l'adresse se partage. */
function ecrire(f: Filtres) {
  const u = new URL(window.location.href);
  const poser = (nom: string, valeur: string, defaut: string) => (valeur.trim() && valeur !== defaut ? u.searchParams.set(nom, valeur) : u.searchParams.delete(nom));
  poser("q", f.q, "");
  poser("statut", f.etape, "all");
  poser("source", f.origine, "all");
  poser("tri", f.tri, "date");
  poser("potentiel", f.potentiel ? "fort" : "", "");
  // Sans état propre à Next : le routeur suit l'adresse, et useSearchParams avec lui.
  window.history.replaceState(null, "", `${u.pathname}${u.search}`);
}

/**
 * Les filtres de la liste des demandes, dans la rangée basse du bandeau
 * (les vues sont dans le menu de gauche) : une recherche, l'étape, l'origine,
 * le tri, et « Fort potentiel » (l'ancienne vue Focus : 70/100 et plus,
 * demandes encore ouvertes, les plus prometteuses d'abord). L'adresse les
 * porte, la liste les lit là.
 *
 * La saisie vit ici, l'adresse suit à chaque frappe. Tant que le curseur est
 * dans la rangée, l'adresse qui revient ne réécrit pas la saisie (une frappe
 * rapide n'est jamais reprise) ; ensuite, une adresse changée d'ailleurs
 * — « Demandes » dans le menu, un lien de l'accueil — remet les filtres.
 */
export default function FiltresDemandes() {
  const params = useSearchParams();
  const cle = params.toString();
  const [f, setF] = useState(() => lireFiltres(params));
  const [connue, setConnue] = useState(cle);
  const [dedans, setDedans] = useState(false);
  if (cle !== connue) {
    setConnue(cle);
    if (!dedans) setF(lireFiltres(params));
  }

  const changer = (p: Partial<Filtres>) => {
    const suivant = { ...f, ...p };
    setF(suivant);
    ecrire(suivant);
  };
  const poses = f.q.trim() !== "" || f.etape !== "all" || f.origine !== "all" || f.tri !== "date" || f.potentiel;

  return (
    <div
      className={s.rangee}
      onFocus={() => setDedans(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDedans(false);
      }}
    >
      <label className={s.recherche}>
        <Icone nom="recherche" taille={16} />
        <input type="search" value={f.q} onChange={(e) => changer({ q: e.target.value })} placeholder="Rechercher un client, une ville…" aria-label="Rechercher un client, une ville" />
      </label>
      <select className={s.choix} value={f.etape} data-actif={f.etape !== "all" ? "" : undefined} onChange={(e) => changer({ etape: e.target.value as EtapeDemande })} aria-label="Étape de la demande">
        <option value="all">Tous les statuts</option>
        {ETAPES.map((e) => (
          <option key={e.cle} value={e.cle}>
            {e.label}
          </option>
        ))}
      </select>
      <select className={s.choix} value={f.origine} data-actif={f.origine !== "all" ? "" : undefined} onChange={(e) => changer({ origine: e.target.value as Origine })} aria-label="Origine de la demande">
        <option value="all">Toutes les origines</option>
        <option value="form">{sourceLabel("form")}</option>
        <option value="email">{sourceLabel("email")}</option>
      </select>
      {/* L'ancienne vue Focus : un filtre ; posé, il range d'abord les plus prometteuses. */}
      <button
        type="button"
        className={s.bascule}
        aria-pressed={f.potentiel}
        onClick={() => changer({ potentiel: !f.potentiel, tri: !f.potentiel && f.tri === "date" ? "potentiel" : f.tri })}
        title="Potentiel de 70/100 et plus, demandes ni perdues ni archivées"
      >
        <Icone nom="etoile" taille={15} />
        Fort potentiel
      </button>
      <select className={s.choix} value={f.tri} data-actif={f.tri !== "date" ? "" : undefined} onChange={(e) => changer({ tri: e.target.value as Tri })} aria-label="Tri">
        {TRIS.map((t) => (
          <option key={t.cle} value={t.cle}>
            {t.label}
          </option>
        ))}
      </select>
      {poses && (
        // Le bouton ne prend pas le curseur : il disparaît aussitôt cliqué.
        <button type="button" className={s.effacer} onMouseDown={(e) => e.preventDefault()} onClick={() => changer(VIDES)}>
          Effacer
        </button>
      )}
    </div>
  );
}
