import Link from "next/link";
import { Icone, type NomIcone } from "./icones";
import s from "./bandeau.module.css";

/**
 * Le bandeau en tête d'une page : surtitre chiffré, titre, phrase, action
 * principale, et à droite quelques repères. Sert aux pages du CRM comme aux
 * sections venues de l'espace équipe.
 */
export default function Bandeau({
  surtitre,
  titre,
  texte,
  action,
  secondaire,
  reperes,
  etiquettes,
  fixe = false,
  children,
}: {
  surtitre: string;
  titre: string;
  texte?: React.ReactNode;
  action?: { label: string; href: string; icone?: NomIcone };
  secondaire?: { label: string; href: string };
  reperes?: { label: string; valeur: string }[];
  /** Quelques pastilles sous la phrase : référence, statut, segment… */
  etiquettes?: (string | false | null | undefined)[];
  /**
   * Hauteur unique, quel que soit le contenu : le texte à gauche, les boutons
   * à droite (deux lignes au plus), sans repères. Les sections de l'équipe
   * l'emploient pour que l'en-tête ne change pas de taille d'une page à l'autre.
   */
  fixe?: boolean;
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
    <section className={`${s.bandeau} ${fixe ? s.fixe : ""}`}>
      <div className={s.gauche}>
        <p className={s.surtitre}>{surtitre}</p>
        <h1 className={s.titre}>{titre}</h1>
        {texte && <p className={s.texte}>{texte}</p>}
        {etiquettes && etiquettes.some(Boolean) && (
          <p className={s.etiquettes}>
            {etiquettes.filter(Boolean).map((e) => (
              <span key={e as string}>{e}</span>
            ))}
          </p>
        )}
        {!fixe && boutons}
      </div>
      {fixe && boutons}
      {!fixe && reperes && reperes.length > 0 && (
        <div className={s.reperes}>
          {reperes.map((r) => (
            <div key={r.label} className={s.repere}>
              <small>{r.label}</small>
              <b>{r.valeur}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
