import Link from "next/link";
import { Icone, type NomIcone } from "./icones";
import s from "./bandeau.module.css";

/**
 * L'en-tête d'une page, posé sur la bande indigo du design « Quantum » :
 * surtitre, titre, phrase, pastilles, boutons à droite, et en bas les onglets
 * d'une section. Sert aux pages du CRM comme aux sections venues de l'espace
 * équipe — la même forme partout. Pas de chiffres ici : la place va aux données.
 */
export default function Bandeau({
  surtitre,
  titre,
  texte,
  action,
  secondaire,
  etiquettes,
  bas,
  children,
}: {
  surtitre: string;
  titre: string;
  texte?: React.ReactNode;
  action?: { label: string; href: string; icone?: NomIcone };
  secondaire?: { label: string; href: string };
  /** Sans effet depuis le 07/11/2026 : plus de chiffres dans l'en-tête. */
  reperes?: { label: string; valeur: string }[];
  /** Quelques pastilles sous la phrase : référence, statut, segment… */
  etiquettes?: (string | false | null | undefined)[];
  /** Sans effet : l'en-tête a désormais la même forme partout. */
  fixe?: boolean;
  /** Sous le titre, dans la bande : les onglets d'une section. */
  bas?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const boutons = (action || secondaire || children) && (
    <div className={s.actions}>
      {action && (
        <Link href={action.href} className={s.bouton}>
          {action.label}
          <i>
            <Icone nom={action.icone ?? "fleche"} taille={17} />
          </i>
        </Link>
      )}
      {secondaire && (
        <Link href={secondaire.href} className={s.secondaire}>
          {secondaire.label}
        </Link>
      )}
      {children}
    </div>
  );
  return (
    <section className={s.bandeau}>
      <div className={s.decor} aria-hidden />
      <div className={s.tete}>
        <div className={s.gauche}>
          <p className={s.surtitre}>{surtitre}</p>
          <h1 className={s.titre}>{titre}</h1>
          {(texte || (etiquettes && etiquettes.some(Boolean))) && (
            <div className={s.ligne}>
              {texte && <p className={s.texte}>{texte}</p>}
              {etiquettes?.filter(Boolean).map((e) => (
                <span key={e as string} className={s.etiquette}>
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>
        {boutons}
      </div>
      <div className={s.bas}>{bas}</div>
    </section>
  );
}

/** Des pilules de verre, dans la bande (le bas du bandeau) : filtres et sous-vues d'une page. */
export function Pilules({ items, label }: { items: { href: string; label: string; actif?: boolean }[]; label: string }) {
  return (
    <nav className={s.pilules} aria-label={label}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={s.pilule} aria-current={i.actif ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Les étapes d'un dossier, dans la rangée du bas de la bande : faites, en cours, à venir. */
export function Etapes({ items, label }: { items: { label: string; etat: "fait" | "encours" | "avenir" }[]; label: string }) {
  return (
    <ol className={s.etapes} aria-label={label}>
      {items.map((e, i) => (
        <li key={e.label} data-etat={e.etat} aria-current={e.etat === "encours" ? "step" : undefined}>
          <i>{e.etat === "fait" ? <Icone nom="coche" taille={13} /> : i + 1}</i>
          {e.label}
        </li>
      ))}
    </ol>
  );
}
