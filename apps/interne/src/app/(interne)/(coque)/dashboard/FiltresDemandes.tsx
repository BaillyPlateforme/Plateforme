"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { RequestStatus } from "@/lib/types";
import { Icone } from "@/ui/icones";
import { STATUS_META, STATUS_ORDER, sourceLabel } from "./status";
import s from "./filtres.module.css";

/** D'où vient la demande : le formulaire du site, ou un mail reçu (l'ancienne « Messagerie » de la section). */
export type Origine = "all" | "form" | "email";
export type Tri = "date" | "potentiel" | "difficulte" | "volume" | "estimation";
export type Filtres = { q: string; statut: RequestStatus | "all"; origine: Origine; tri: Tri };

const TRIS: { cle: Tri; label: string }[] = [
  { cle: "date", label: "Tri : récentes" },
  { cle: "potentiel", label: "Tri : potentiel" },
  { cle: "difficulte", label: "Tri : difficulté" },
  { cle: "volume", label: "Tri : volume" },
  { cle: "estimation", label: "Tri : estimation" },
];
const VIDES: Filtres = { q: "", statut: "all", origine: "all", tri: "date" };

/** Les filtres de la liste, lus dans l'adresse : ?q=, ?statut=, ?source= (form ou email), ?tri=. */
export function lireFiltres(p: { get(nom: string): string | null }): Filtres {
  const statut = p.get("statut");
  const source = p.get("source");
  const tri = p.get("tri");
  return {
    q: p.get("q") ?? "",
    statut: statut && statut in STATUS_META ? (statut as RequestStatus) : "all",
    origine: source === "form" || source === "email" ? source : "all",
    tri: TRIS.some((t) => t.cle === tri) ? (tri as Tri) : "date",
  };
}

/** Écrit les filtres dans l'adresse, sans recharger : la liste les lit aussitôt, et l'adresse se partage. */
function ecrire(f: Filtres) {
  const u = new URL(window.location.href);
  const poser = (nom: string, valeur: string, defaut: string) => (valeur.trim() && valeur !== defaut ? u.searchParams.set(nom, valeur) : u.searchParams.delete(nom));
  poser("q", f.q, "");
  poser("statut", f.statut, "all");
  poser("source", f.origine, "all");
  poser("tri", f.tri, "date");
  // Sans état propre à Next : le routeur suit l'adresse, et useSearchParams avec lui.
  window.history.replaceState(null, "", `${u.pathname}${u.search}`);
}

/**
 * Les filtres de la liste des demandes, dans la rangée basse du bandeau
 * (les vues sont dans le menu de gauche) : une recherche, le statut,
 * l'origine et le tri. L'adresse les porte, la liste les lit là.
 *
 * La saisie vit ici, l'adresse suit à chaque frappe. Tant que le curseur est
 * dans la rangée, l'adresse qui revient ne réécrit pas la saisie (une frappe
 * rapide n'est jamais reprise) ; ensuite, une adresse changée d'ailleurs
 * — « Liste » dans le menu, un lien de l'accueil — remet les filtres.
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
  const poses = f.q.trim() !== "" || f.statut !== "all" || f.origine !== "all" || f.tri !== "date";

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
      <select className={s.choix} value={f.statut} data-actif={f.statut !== "all" ? "" : undefined} onChange={(e) => changer({ statut: e.target.value as Filtres["statut"] })} aria-label="Statut">
        <option value="all">Tous les statuts</option>
        {STATUS_ORDER.map((st) => (
          <option key={st} value={st}>
            {STATUS_META[st].label}
          </option>
        ))}
      </select>
      <select className={s.choix} value={f.origine} data-actif={f.origine !== "all" ? "" : undefined} onChange={(e) => changer({ origine: e.target.value as Origine })} aria-label="Origine de la demande">
        <option value="all">Toutes les origines</option>
        <option value="form">{sourceLabel("form")}</option>
        <option value="email">{sourceLabel("email")}</option>
      </select>
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
