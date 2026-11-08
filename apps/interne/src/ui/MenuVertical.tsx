"use client";

import Link from "next/link";
import { useState } from "react";
import { Icone, type NomIcone } from "./icones";
import s from "./menu-vertical.module.css";

/*
 * Le menu vertical d'une section, à gauche du contenu : les vues de la page
 * (exigence de David : jamais dans le bandeau). Une colonne fine et collante,
 * en groupes, la vue active en indigo.
 *
 * Changer de vue ne doit pas « changer de page » (David) : la page ne remonte
 * pas en haut (scroll={false}) et la vue cliquée s'allume tout de suite, sans
 * attendre la réponse du serveur ; le bandeau, lui, reste celui de la page.
 */

export type ItemMenu = {
  href: string;
  label: string;
  icone?: NomIcone;
  actif?: boolean;
  nombre?: number;
  /**
   * Une vue qui bascule sans recharger la page (les colonnes et la liste du
   * Parcours, mêmes données) : le clic simple l'appelle, l'adresse reste pour
   * un nouvel onglet. Seulement depuis un composant client.
   */
  choisir?: () => void;
  /** Une sous-vue, en retrait sous sa vue (les analyses des Statistiques du Parcours). */
  sous?: boolean;
};
export type GroupeMenu = { titre?: string; items: ItemMenu[] };

/** Un clic simple (ni Ctrl, ni Cmd, ni Maj, ni bouton du milieu) : celui qu'une vue peut prendre pour elle. */
const clicSimple = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export default function MenuVertical({ titre, groupes, dense = false }: { titre: string; groupes: GroupeMenu[]; /** Des lignes plus serrées, pour un long menu (Réglages). */ dense?: boolean }) {
  // La vue cliquée, en attendant que la page dise laquelle est active ; oubliée dès qu'elle le dit.
  const actifHref = groupes.flatMap((g) => g.items).find((it) => it.actif)?.href ?? null;
  const [vise, setVise] = useState<string | null>(null);
  const [vu, setVu] = useState(actifHref);
  if (vu !== actifHref) {
    setVu(actifHref);
    setVise(null);
  }
  return (
    <nav className={dense ? `${s.menu} ${s.dense}` : s.menu} aria-label={titre}>
      <p className={s.titre}>{titre}</p>
      {groupes.map((g, i) => (
        <div key={g.titre ?? i} className={s.groupe}>
          {g.titre && <p className={s.sousTitre}>{g.titre}</p>}
          {g.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={it.sous ? `${s.item} ${s.sousItem}` : s.item}
              scroll={false}
              aria-current={(vise ? vise === it.href : it.actif) ? "page" : undefined}
              onClick={(e) => {
                if (!clicSimple(e)) return;
                if (it.choisir) {
                  e.preventDefault();
                  it.choisir();
                  return;
                }
                setVise(it.href);
              }}
            >
              {it.icone && <Icone nom={it.icone} taille={17} />}
              <span>{it.label}</span>
              {it.nombre !== undefined && it.nombre > 0 && <em>{it.nombre}</em>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** La mise en page d'une section : le menu vertical à gauche, le contenu à droite. */
export function AvecMenu({ menu, children }: { menu: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={s.grille}>
      <aside className={s.colonne}>{menu}</aside>
      <div className={s.contenu}>{children}</div>
    </div>
  );
}
