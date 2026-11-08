"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/ui/icones";
import s from "./filtres.module.css";

/*
 * Les filtres du Kanban de Demandes, dans la rangée du bas du bandeau : une
 * recherche, l'origine (formulaire ou e-mail), et « Perdues et archivées »,
 * cachées par défaut. L'adresse les porte (?q=, ?source=, ?sorties=1) ; le
 * tableau les lit là, sans recharger la page.
 */

export type FiltresKanban = { q: string; origine: "all" | "form" | "email"; sorties: boolean };

export function lireFiltresKanban(p: { get(nom: string): string | null }): FiltresKanban {
  const source = p.get("source");
  return { q: p.get("q") ?? "", origine: source === "form" || source === "email" ? source : "all", sorties: p.get("sorties") === "1" };
}

function ecrire(f: FiltresKanban) {
  const u = new URL(window.location.href);
  const poser = (nom: string, v: string | null) => (v ? u.searchParams.set(nom, v) : u.searchParams.delete(nom));
  poser("q", f.q.trim() ? f.q : null);
  poser("source", f.origine === "all" ? null : f.origine);
  poser("sorties", f.sorties ? "1" : null);
  window.history.replaceState(null, "", `${u.pathname}${u.search}`);
}

export default function FiltresKanban() {
  const params = useSearchParams();
  const cle = params.toString();
  const [f, setF] = useState(() => lireFiltresKanban(params));
  const [connue, setConnue] = useState(cle);
  const [dedans, setDedans] = useState(false);
  // Une adresse changée d'ailleurs (le menu) remet les filtres ; pas pendant la frappe.
  if (cle !== connue) {
    setConnue(cle);
    if (!dedans) setF(lireFiltresKanban(params));
  }
  const changer = (p: Partial<FiltresKanban>) => {
    const suivant = { ...f, ...p };
    setF(suivant);
    ecrire(suivant);
  };
  const poses = f.q.trim() !== "" || f.origine !== "all" || f.sorties;
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
        <input type="search" value={f.q} onChange={(e) => changer({ q: e.target.value })} placeholder="Client, ville, e-mail, téléphone…" aria-label="Rechercher une demande" />
      </label>
      <select className={s.choix} value={f.origine} data-actif={f.origine !== "all" ? "" : undefined} onChange={(e) => changer({ origine: e.target.value as FiltresKanban["origine"] })} aria-label="Origine de la demande">
        <option value="all">Toutes les origines</option>
        <option value="form">Formulaire</option>
        <option value="email">Mail</option>
      </select>
      <button type="button" className={s.bascule} aria-pressed={f.sorties} onClick={() => changer({ sorties: !f.sorties })} title="Montrer aussi les demandes perdues et archivées, en deux colonnes à la fin">
        <Icone nom="archive" taille={15} />
        Perdues et archivées
      </button>
      {poses && (
        <button type="button" className={s.effacer} onMouseDown={(e) => e.preventDefault()} onClick={() => changer({ q: "", origine: "all", sorties: false })}>
          Effacer
        </button>
      )}
    </div>
  );
}
