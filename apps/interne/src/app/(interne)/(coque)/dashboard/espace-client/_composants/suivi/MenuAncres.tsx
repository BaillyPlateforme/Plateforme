"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icone, type NomIcone } from "@/ui/icones";
import m from "@/ui/menu-vertical.module.css";
import s from "./suivi.module.css";

/*
 * Le menu de gauche d'une longue page : ses rubriques, en ancres. Il prend la
 * place du menu de la section (EnTeteSection, `menu`) — la règle des vues
 * dans le menu de gauche — et suit la lecture : la rubrique à l'écran
 * s'allume. Au-dessus, le retour à la liste.
 */

export type Ancre = { id: string; label: string; icone: NomIcone; nombre?: number; ton?: "alerte" | "ok" };

/** La marge sous la barre du haut et le bandeau collants : une rubrique visée s'arrête dessous. */
const MARGE = 184;

export function MenuAncres({ titre, ancres, retour }: { titre: string; ancres: Ancre[]; retour?: { href: string; label: string } }) {
  const [actif, setActif] = useState(ancres[0]?.id ?? "");
  const ids = ancres.map((a) => a.id).join(",");

  useEffect(() => {
    // La rubrique active : la dernière dont le haut a passé la barre collante ; tout en bas d'une page qui
    // défile, la dernière (une courte rubrique finale n'atteint jamais le haut).
    const calculer = () => {
      const liste = ids.split(",");
      let courant = liste[0];
      for (const id of liste) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - MARGE - 24 <= 0) courant = id;
      }
      const page = document.documentElement.scrollHeight;
      if (window.scrollY > 0 && page > window.innerHeight + 80 && window.innerHeight + window.scrollY >= page - 4) courant = liste.at(-1)!;
      setActif(courant);
    };
    calculer();
    window.addEventListener("scroll", calculer, { passive: true });
    window.addEventListener("resize", calculer);
    // La page arrive après le menu (chargement, rubriques qui s'ouvrent) : on recalcule quand elle change de taille.
    const taille = new ResizeObserver(calculer);
    taille.observe(document.body);
    return () => {
      window.removeEventListener("scroll", calculer);
      window.removeEventListener("resize", calculer);
      taille.disconnect();
    };
  }, [ids]);

  return (
    <nav className={`${m.menu} ${s.ancres}`} aria-label={titre}>
      {retour && (
        <Link href={retour.href} className={s.ancreRetour} prefetch={false}>
          <Icone nom="gauche" taille={15} />
          {retour.label}
        </Link>
      )}
      <p className={m.titre}>{titre}</p>
      <div className={m.groupe}>
        {ancres.map((a) => (
          <a
            key={a.id}
            href={`#${a.id}`}
            className={m.item}
            aria-current={actif === a.id ? "location" : undefined}
            data-actif={actif === a.id ? "" : undefined}
            onClick={(e) => {
              const el = document.getElementById(a.id);
              if (!el) return;
              e.preventDefault();
              window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - MARGE, behavior: "smooth" });
              history.replaceState(null, "", `#${a.id}`);
              setActif(a.id);
            }}
          >
            <Icone nom={a.icone} taille={17} />
            <span>{a.label}</span>
            {a.nombre !== undefined && a.nombre > 0 && <em className={a.ton === "alerte" ? s.nombreAlerte : undefined}>{a.nombre}</em>}
          </a>
        ))}
      </div>
    </nav>
  );
}
