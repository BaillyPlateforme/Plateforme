"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { aEnTetePropre, ongletActif, sectionDe, type Onglet } from "@/crm/sections";
import Bandeau from "@/ui/Bandeau";
import type { NomIcone } from "@/ui/icones";
import { metaDe } from "./nav-meta";
import s from "./section.module.css";

type Contenu = {
  surtitre?: string;
  titre?: string;
  texte?: React.ReactNode;
  action?: { label: string; href: string; icone?: NomIcone };
  etiquettes?: (string | false | null | undefined)[];
  /** Les boutons de la page (statut, envoi…), posés dans le bandeau. */
  children?: React.ReactNode;
};

/**
 * L'en-tête des sections venues de l'espace équipe (questionnaires, espace
 * client, réglages) : TOUJOURS le bandeau du CRM (la bande indigo), avec les
 * onglets de la section en verre sous le titre — même forme sur chaque page.
 *
 * Posé sans réglage par la mise en page des sections, il prend le nom de la
 * section et le titre de la page (nav-meta.ts). Les pages qui ont mieux à dire
 * (la vue d'ensemble et ses chiffres, la fiche d'une demande, celle d'un
 * dossier client) le posent elles-mêmes, en tête, avec leur contenu : la mise
 * en page s'efface alors pour elles (voir `aEnTetePropre`), si bien qu'il n'y
 * a jamais deux en-têtes l'un sous l'autre.
 */
export default function EnTeteSection({ propre = false, ...contenu }: Contenu & { propre?: boolean }) {
  const chemin = usePathname();
  const section = sectionDe(chemin);
  if (!propre && (!section || aEnTetePropre(chemin))) return null;
  const meta = metaDe(chemin);

  return (
    <Bandeau
      surtitre={contenu.surtitre ?? section?.nom ?? ""}
      titre={contenu.titre ?? meta.titre}
      texte={propre ? contenu.texte : meta.sous}
      action={contenu.action}
      etiquettes={contenu.etiquettes}
      bas={section && <Onglets chemin={chemin} section={section} />}
    >
      {contenu.children}
    </Bandeau>
  );
}

function Onglets({ chemin, section }: { chemin: string; section: NonNullable<ReturnType<typeof sectionDe>> }) {
  const actifDansPlus = section.plus?.find((o) => ongletActif(o, chemin));
  return (
    <nav className={s.onglets} aria-label={section.nom}>
      {section.onglets.map((o) => (
        <Link key={o.href} href={o.href} className={s.onglet} aria-current={ongletActif(o, chemin) ? "page" : undefined}>
          {o.label}
        </Link>
      ))}
      {section.plus && <Plus onglets={section.plus} actif={actifDansPlus?.label} chemin={chemin} />}
    </nav>
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
