"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icone } from "@/ui/icones";
import s from "./panneau.module.css";

/*
 * La bande des dossiers, à droite du Parcours : des cartes illustrées (la
 * photo de la destination), que l'on fait défiler, filtre et cherche ; un
 * clic affiche le parcours du dossier à gauche. La bande se referme en un
 * rail fin, et le navigateur se souvient de son état.
 */

export type CarteDossier = {
  id: number;
  ref: string;
  client: string;
  segment: string;
  statut: string;
  statutLabel: string;
  trajet: string;
  volume: string | null;
  montant: string | null;
  initiales: string | null;
  photo: string;
  etapes: { label: string; etat: string }[];
  enCours: string;
};

const STOCKAGE = "bailly-parcours-panneau";

export default function PanneauDossiers({
  cartes,
  actif,
  vue,
  vues,
}: {
  cartes: CarteDossier[];
  actif: number | null;
  vue: string;
  vues: { cle: string; label: string }[];
}) {
  const [ouvert, setOuvert] = useState(true);
  const [cherche, setCherche] = useState("");
  const liste = useRef<HTMLDivElement>(null);

  // L'état ouvert ou fermé, gardé dans ce navigateur (lu après le premier rendu).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(STOCKAGE) === "ferme") setOuvert(false);
      } catch {
        // stockage indisponible : la bande reste ouverte
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const basculer = (v: boolean) => {
    setOuvert(v);
    try {
      localStorage.setItem(STOCKAGE, v ? "ouvert" : "ferme");
    } catch {
      // sans stockage, l'état vaut pour cette page seulement
    }
  };

  // La carte active, ramenée dans la vue.
  useEffect(() => {
    if (!ouvert) return;
    liste.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView({ block: "nearest" });
  }, [ouvert, actif]);

  const visibles = useMemo(() => {
    const t = cherche.trim().toLowerCase();
    if (!t) return cartes;
    return cartes.filter((c) => `${c.client} ${c.ref} ${c.trajet} ${c.segment}`.toLowerCase().includes(t));
  }, [cartes, cherche]);

  const suffixe = vue ? `?vue=${vue}` : "";

  if (!ouvert)
    return (
      <aside className={`${s.panneau} ${s.ferme}`} aria-label="Dossiers">
        <button type="button" className={s.rail} onClick={() => basculer(true)} title="Afficher les dossiers">
          <Icone nom="chevron" taille={16} />
          <span>Dossiers · {cartes.length}</span>
        </button>
      </aside>
    );

  return (
    <aside className={s.panneau} aria-label="Dossiers">
      <div className={s.tete}>
        <div className={s.titre}>
          <b>Dossiers</b>
          <small>{visibles.length}</small>
          <button type="button" className={s.fermer} onClick={() => basculer(false)} aria-label="Refermer la bande des dossiers" title="Refermer">
            <Icone nom="chevron" taille={16} />
          </button>
        </div>
        <label className={s.cherche}>
          <Icone nom="recherche" taille={15} />
          <input type="search" value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Client, référence, ville…" aria-label="Chercher un dossier" />
        </label>
        <nav className={s.vues} aria-label="Dossiers à afficher">
          {vues.map((v) => (
            <Link key={v.cle} href={`${actif ? `/parcours/${actif}` : "/parcours"}${v.cle ? `?vue=${v.cle}` : ""}`} aria-current={v.cle === vue ? "page" : undefined}>
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className={s.liste} ref={liste}>
        {visibles.length === 0 && <p className={s.vide}>Aucun dossier ne correspond.</p>}
        {visibles.map((c) => {
          const faites = c.etapes.filter((e) => e.etat === "fait" || e.etat === "manque" || e.etat === "sansobjet").length;
          return (
            <Link key={c.id} href={`/parcours/${c.id}${suffixe}`} className={s.carte} aria-current={c.id === actif ? "page" : undefined}>
              <span className={s.image} style={{ backgroundImage: `url(${c.photo})` }}>
                <span className={s.statut} data-statut={c.statut}>
                  {c.statutLabel}
                </span>
                {c.initiales && <span className={s.avatar}>{c.initiales}</span>}
                <span className={s.surImage}>
                  <b>{c.client}</b>
                  <small>
                    {c.ref} · {c.segment}
                  </small>
                </span>
              </span>
              <span className={s.corps}>
                <span className={s.trajet}>
                  {c.trajet}
                  {c.volume && <em> · {c.volume}</em>}
                </span>
                <span className={s.progression} aria-label={`${faites} étapes sur ${c.etapes.length}`}>
                  {c.etapes.map((e) => (
                    <i key={e.label} data-etat={e.etat} title={e.label} />
                  ))}
                </span>
                <span className={s.pied}>
                  <span>
                    En cours : <b>{c.enCours}</b>
                  </span>
                  {c.montant && <strong>{c.montant}</strong>}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
