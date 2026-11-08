import Link from "next/link";
import { Icone, type NomIcone } from "./icones";
import s from "./menu-vertical.module.css";

/*
 * Le menu vertical d'une section, à gauche du contenu : les sous-onglets de
 * la section (exigence de David : plus de sous-onglets dans le bandeau). Une
 * colonne fine et collante, en groupes, l'onglet actif en indigo.
 */

export type ItemMenu = { href: string; label: string; icone?: NomIcone; actif?: boolean; nombre?: number };
export type GroupeMenu = { titre?: string; items: ItemMenu[] };

export default function MenuVertical({ titre, groupes }: { titre: string; groupes: GroupeMenu[] }) {
  return (
    <nav className={s.menu} aria-label={titre}>
      <p className={s.titre}>{titre}</p>
      {groupes.map((g, i) => (
        <div key={g.titre ?? i} className={s.groupe}>
          {g.titre && <p className={s.sousTitre}>{g.titre}</p>}
          {g.items.map((it) => (
            <Link key={it.href} href={it.href} className={s.item} aria-current={it.actif ? "page" : undefined}>
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
