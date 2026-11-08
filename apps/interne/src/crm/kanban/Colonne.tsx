import Link from "next/link";
import { Icone } from "@/ui/icones";
import { eur } from "@/crm/lib/format";
import { TEINTES, type Teinte } from "./etapes";
import k from "./kanban.module.css";

/*
 * L'en-tête d'une colonne, le même sur tous les tableaux (Demandes, Parcours,
 * Relances) : la pastille de l'étape, son nom, son compte, et, quand la
 * colonne continue ailleurs, le lien vers l'autre tableau (« Demandes » du
 * Parcours → Demandes › Kanban ; « Dossier » de Demandes → Parcours ; une
 * étape qui a ses relances → Relances, filtrées). Dessous, une ligne : ce
 * que veut dire l'étape, ou ce qu'elle pèse.
 *
 * La couleur vient de la colonne (`styleEtape`, posé sur la <section>).
 */

/** La couleur d'une colonne, et de ses cartes. */
export const styleEtape = (t: Teinte) => ({ ["--c" as string]: TEINTES[t] }) as React.CSSProperties;

export type LienColonne = { href: string; label: string; titre: string };

/** Ce que pèse une colonne : son montant, ou rien encore. */
export function Somme({ total, mot }: { total: number; mot: string }) {
  return (
    <p className={k.somme}>
      {total > 0 ? (
        <>
          <b>{eur(total)}</b>
          <span>{mot}</span>
        </>
      ) : (
        <span className={k.sansMontant}>Pas encore de montant</span>
      )}
    </p>
  );
}

/** Ce que veut dire une étape, sous son nom. */
export const Sens = ({ children }: { children: React.ReactNode }) => <p className={k.sens}>{children}</p>;

export default function TeteColonne({
  label,
  nombre,
  sous,
  lien,
  bouton,
}: {
  label: string;
  nombre: number;
  /** La ligne du dessous : le sens de l'étape, ou son montant. */
  sous?: React.ReactNode;
  lien?: LienColonne | null;
  /** Un bouton de plus, à droite (replier une colonne). */
  bouton?: React.ReactNode;
}) {
  return (
    <header className={k.tete}>
      <div className={k.teteHaut}>
        <i className={k.pastille} aria-hidden />
        <h2 title={label}>{label}</h2>
        <span className={k.nombre}>{nombre}</span>
        {lien && (
          <Link href={lien.href} className={k.lienColonne} title={lien.titre}>
            {lien.label}
            <Icone nom="fleche" taille={12} />
          </Link>
        )}
        {bouton}
      </div>
      {sous != null && <div className={k.sous}>{sous}</div>}
    </header>
  );
}
