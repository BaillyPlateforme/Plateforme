"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SANS_BANDEAU, ongletActif, sectionDe, type Onglet } from "@/crm/sections";
import Bandeau from "@/ui/Bandeau";
import { metaDe } from "./nav-meta";
import s from "./section.module.css";

/**
 * L'en-tête des sections venues de l'espace équipe : le bandeau du CRM (nom
 * de la section en surtitre, titre et phrase de la page), puis les onglets de
 * la section en pilules.
 */
export default function EnTeteSection() {
  const chemin = usePathname();
  const section = sectionDe(chemin);
  const meta = metaDe(chemin);
  if (!section) return null;
  const actifDansPlus = section.plus?.find((o) => ongletActif(o, chemin));

  return (
    <>
      {!SANS_BANDEAU.has(chemin) && <Bandeau surtitre={section.nom} titre={meta.titre} texte={meta.sous} />}
      <nav className={s.onglets} aria-label={section.nom}>
        {section.onglets.map((o) => (
          <Link key={o.href} href={o.href} className={s.onglet} aria-current={ongletActif(o, chemin) ? "page" : undefined}>
            {o.label}
          </Link>
        ))}
        {section.plus && <Plus onglets={section.plus} actif={actifDansPlus?.label} chemin={chemin} />}
      </nav>
    </>
  );
}

/** Le menu « Plus » : les pages utiles mais moins fréquentes de la section. */
function Plus({ onglets, actif, chemin }: { onglets: Onglet[]; actif?: string; chemin: string }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);
  return (
    <div className={s.plus} ref={ref}>
      <button type="button" className={`${s.onglet} ${actif ? s.actif : ""}`} aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {actif ?? "Plus"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {ouvert && (
        <div className={s.menu} role="menu">
          {onglets.map((o) => (
            <Link key={o.href} href={o.href} role="menuitem" aria-current={ongletActif(o, chemin) ? "page" : undefined} onClick={() => setOuvert(false)}>
              {o.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
