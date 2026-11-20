import { PastilleEnvironnement } from "@/components/PastilleEnvironnement";
import { versExterne } from "@/lib/adresses";
import s from "./connexion.module.css";

/*
 * La mise en page des pages de connexion : la vitrine à gauche, la colonne du
 * formulaire à droite. La connexion et les pages « Mot de passe oublié » la
 * partagent.
 */

export const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const OUTILS = [
  {
    nom: "BaillyCRM",
    sous: "Dossiers, planning, devis et factures",
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="M4 7.5 12 12l8-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    nom: "Questionnaires",
    sous: "Leads, demandes, rappels et statistiques",
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="M9 4h6v3H9z" />
        <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" />
        <path d="m9 13 2 2 4-4" />
      </svg>
    ),
  },
  {
    nom: "Espace client",
    sous: "Documents, cartons et SAV de chaque dossier",
    icone: (
      <svg viewBox="0 0 24 24" {...trait}>
        <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z" />
        <circle cx="12" cy="13" r="2" />
        <path d="M8.5 18a3.5 3.5 0 0 1 7 0" />
      </svg>
    ),
  },
];

export default function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.page}>
      <aside className={s.vitrine}>
        <div className={s.marque}>
          {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel de Bailly, servi tel quel */}
          <img src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={110} height={35} className={s.logo} />
          <PastilleEnvironnement />
          <small>Plateforme de l&apos;équipe</small>
        </div>

        <div className={s.promesse}>
          <span className={s.surtitre}>Un seul compte pour tout</span>
          <h1>
            Tout votre métier,
            <br />
            au même endroit.
          </h1>
          <p>Le CRM, les demandes venues du site et l&apos;espace de chaque client partagent une même connexion.</p>
          <ul className={s.outils}>
            {OUTILS.map((o) => (
              <li key={o.nom} className={s.outil}>
                <i>{o.icone}</i>
                <span>
                  <b>{o.nom}</b>
                  <small>{o.sous}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className={s.pied}>© {new Date().getFullYear()} Bailly Déménagement · BD Moving Group</p>
      </aside>

      <main className={s.colonne}>
        <div className={s.zone}>{children}</div>
      </main>
    </div>
  );
}

/** Le renvoi vers le site, en bas de chaque page. */
export function RetourSite() {
  return (
    <a href={versExterne("/")}>
      <svg width="14" height="14" viewBox="0 0 24 24" {...trait} aria-hidden>
        <path d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
      Retour au site
    </a>
  );
}
