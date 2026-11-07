"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { versExterne } from "@/lib/adresses";
import s from "./Applications.module.css";

/*
 * Le menu des applications Bailly, en haut à droite du CRM comme de l'espace
 * équipe : on passe d'une app à l'autre sans chercher l'adresse.
 *
 * Deux familles. Les outils de l'équipe vivent dans cette app (le CRM à la
 * racine, l'espace équipe sous /dashboard) ; ce que voient les clients vit
 * dans l'app externe, et s'ouvre dans un nouvel onglet.
 */

type App = {
  cle: string;
  nom: string;
  sous: string;
  href: string;
  ton: "crm" | "questionnaires" | "dossiers" | "client";
  icone: ReactNode;
  externe?: boolean;
};

const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const EQUIPE: App[] = [
  {
    cle: "crm",
    nom: "BaillyCRM",
    sous: "Dossiers, planning, devis et factures",
    href: "/",
    ton: "crm",
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="M4 7.5 12 12l8-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    cle: "questionnaires",
    nom: "Questionnaires",
    sous: "Leads, demandes, rappels, statistiques",
    href: "/dashboard/tableau-de-bord",
    ton: "questionnaires",
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="M9 4h6v3H9z" />
        <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" />
        <path d="m9 13 2 2 4-4" />
      </svg>
    ),
  },
  {
    cle: "espace-client",
    nom: "Espace client",
    sous: "Dossiers clients, documents, cartons, SAV",
    href: "/dashboard/espace-client",
    ton: "dossiers",
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z" />
        <circle cx="12" cy="13" r="2" />
        <path d="M8.5 18a3.5 3.5 0 0 1 7 0" />
      </svg>
    ),
  },
];

const CLIENTS: App[] = [
  {
    cle: "site",
    nom: "Site et questionnaires",
    sous: "Les trois portes du devis en ligne",
    href: versExterne("/"),
    ton: "client",
    externe: true,
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5" />
      </svg>
    ),
  },
  {
    cle: "ec-client",
    nom: "Espace client",
    sous: "Ce que voit le client, par son lien",
    href: versExterne("/espace-client/connexion"),
    ton: "client",
    externe: true,
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="m3.5 11 8.5-7 8.5 7" />
        <path d="M6 9.5V20h12V9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    ),
  },
  {
    cle: "rh",
    nom: "Espace RH",
    sous: "Le portail des entreprises clientes",
    href: versExterne("/rh"),
    ton: "client",
    externe: true,
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V20" />
        <path d="M14 9h4.5A1.5 1.5 0 0 1 20 10.5V20M3 20h18M7.5 8h3M7.5 12h3M7.5 16h3" />
      </svg>
    ),
  },
];

/** L'app où l'on se trouve : le CRM partout, sauf dans l'espace équipe. */
function appCourante(chemin: string) {
  if (chemin.startsWith("/dashboard/espace-client")) return "espace-client";
  if (chemin.startsWith("/dashboard")) return "questionnaires";
  return "crm";
}

export default function Applications({ rond = false }: { rond?: boolean }) {
  const chemin = usePathname();
  const courante = appCourante(chemin);
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    // Le premier lien prend la main : le clavier part de là.
    panneau.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const dehors = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOuvert(false);
        bouton.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const liens = Array.from(panneau.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
      const i = liens.indexOf(document.activeElement as HTMLAnchorElement);
      const suivant = liens[(i + (e.key === "ArrowDown" ? 1 : liens.length - 1)) % liens.length];
      suivant?.focus();
      e.preventDefault();
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", touche);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", touche);
    };
  }, [ouvert]);

  const ligne = (a: App) => (
    <li key={a.cle}>
      <a
        href={a.href}
        className={s.app}
        aria-current={!a.externe && a.cle === courante ? "page" : undefined}
        {...(a.externe ? { target: "_blank", rel: "noreferrer" } : {})}
        onClick={() => setOuvert(false)}
      >
        <span className={`${s.icone} ${s[a.ton]}`}>{a.icone}</span>
        <span className={s.texte}>
          <b>{a.nom}</b>
          <small>{a.sous}</small>
        </span>
        {!a.externe && a.cle === courante ? (
          <span className={s.ici}>ICI</span>
        ) : a.externe ? (
          <svg className={s.sortie} viewBox="0 0 24 24" {...trait} aria-label="Nouvel onglet">
            <path d="M14 4h6v6M20 4l-9 9M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
          </svg>
        ) : (
          <span />
        )}
      </a>
    </li>
  );

  return (
    <div className={s.racine} ref={racine}>
      <button
        ref={bouton}
        type="button"
        className={`${s.bouton} ${rond ? s.rond : ""}`}
        aria-haspopup="true"
        aria-expanded={ouvert}
        aria-label="Applications Bailly"
        title="Applications Bailly"
        onClick={() => setOuvert((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />))}
        </svg>
      </button>

      {ouvert && (
        <div ref={panneau} className={s.panneau} role="dialog" aria-label="Applications Bailly">
          <div className={s.entete}>
            <b>Applications Bailly</b>
            <small>Un seul compte pour tout</small>
          </div>
          <div className={s.section}>L&apos;équipe</div>
          <ul className={s.liste}>{EQUIPE.map(ligne)}</ul>
          <div className={s.separateur} />
          <div className={s.section}>Côté clients</div>
          <ul className={s.liste}>{CLIENTS.map(ligne)}</ul>
        </div>
      )}
    </div>
  );
}
