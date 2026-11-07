import { TEL_AGENCE } from "@/lib/messaging";
import d from "./devis.module.css";
import s from "./feuille.module.css";

/*
 * La feuille Bailly : le cadre commun des documents imprimés du CRM — logo,
 * coordonnées de l'agence, pastille jaune, titre, puis le corps et le pied.
 * Le devis et la facture ont leur mise en page propre ; la fiche de visite,
 * la lettre de voiture et la proposition de sous-traitance s'appuient sur
 * celle-ci (même jaune, même noir, mêmes marges A4).
 */
export function FeuilleBailly({
  etiquette,
  titre,
  sousTitre,
  details,
  saut = false,
  children,
}: {
  etiquette: string;
  titre: string;
  sousTitre?: string;
  /** Quelques lignes sous le titre, à droite (dossier, date, commercial…). */
  details?: (string | null | undefined | false)[];
  /** Saut de page après la feuille (documents en plusieurs feuillets). */
  saut?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={`${d.feuille} ${saut ? s.saut : ""}`}>
      <header className={d.entete}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- l'image doit s'imprimer telle quelle */}
          <img src="/marque/bailly-logo.svg" alt="Bailly Déménagement" className={d.logo} />
          <div className={d.agence}>
            <b>Bailly Déménagement</b> · BD Moving Group
            <br />
            {TEL_AGENCE} · demenagements-bailly.com
          </div>
        </div>
        <div className={d.reference}>
          <span className={d.etiquette}>{etiquette}</span>
          <h1>{titre}</h1>
          {sousTitre && <p>{sousTitre}</p>}
          {details?.filter(Boolean).map((x) => (
            <p key={x as string}>{x}</p>
          ))}
        </div>
      </header>
      {children}
      <footer className={d.pied}>
        <span>
          <b>Bailly Déménagement</b> · BD Moving Group · {TEL_AGENCE} · demenagements-bailly.com
        </span>
        <span>Membre IAM et de la Chambre Syndicale du Déménagement · ISO 9001, 14001, 45001</span>
      </footer>
    </article>
  );
}

/** Un titre de section, avec la barre jaune. */
export function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className={s.section}>
      <h2 className={d.titre}>{titre}</h2>
      {children}
    </section>
  );
}

/** Des cases « libellé / valeur », la première en noir. */
export function Cases({ items }: { items: { label: string; valeur: React.ReactNode; detail?: string; fonce?: boolean }[] }) {
  return (
    <div className={s.cases} style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}>
      {items.map((x) => (
        <div key={x.label} className={`${d.case} ${x.fonce ? d.client : ""}`}>
          <small>{x.label}</small>
          <b>{x.valeur}</b>
          {x.detail && <span>{x.detail}</span>}
        </div>
      ))}
    </div>
  );
}

/** Un tableau aux couleurs de Bailly. */
export function Tableau({ entetes, lignes, droite = [] }: { entetes: string[]; lignes: React.ReactNode[][]; droite?: number[] }) {
  return (
    <table className={s.tableau}>
      <thead>
        <tr>
          {entetes.map((e, i) => (
            <th key={e} className={droite.includes(i) ? s.droite : undefined}>
              {e}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => (
          <tr key={i}>
            {l.map((c, j) => (
              <td key={j} className={droite.includes(j) ? s.droite : undefined}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Un encadré de texte (observations, consignes), filet jaune à gauche. */
export function Encadre({ children, hauteur }: { children?: React.ReactNode; hauteur?: string }) {
  return (
    <div className={s.encadre} style={hauteur ? { minHeight: hauteur } : undefined}>
      {children}
    </div>
  );
}

/** Les cases de signature, côte à côte. */
export function Signatures({ cases }: { cases: string[] }) {
  return (
    <div className={s.signatures} style={{ gridTemplateColumns: `repeat(${cases.length}, minmax(0, 1fr))` }}>
      {cases.map((c) => (
        <div key={c}>
          <b>{c}</b>
          <span>Date et signature</span>
        </div>
      ))}
    </div>
  );
}
