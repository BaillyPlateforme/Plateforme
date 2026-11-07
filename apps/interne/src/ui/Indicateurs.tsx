import Link from "next/link";
import { Icone, type NomIcone } from "./icones";
import s from "./indicateurs.module.css";

export type Indicateur = {
  libelle: string;
  /** La précision, après le point médian : « Devis · en attente de signature ». */
  precision?: string;
  valeur: string;
  icone: NomIcone;
  ton?: "violet" | "ambre" | "ciel" | "vert" | "rose";
  href?: string;
};

/** La rangée d'indicateurs sous un bandeau. */
export default function Indicateurs({ items }: { items: Indicateur[] }) {
  return (
    <div className={s.rangee}>
      {items.map((i) => {
        const corps = (
          <>
            <span className={`${s.pastille} ${s[i.ton ?? "violet"]}`}>
              <Icone nom={i.icone} taille={21} />
            </span>
            <span>
              <span className={s.libelle}>
                {i.libelle}
                {i.precision ? ` · ${i.precision}` : ""}
              </span>
              <span className={s.valeur}>{i.valeur}</span>
            </span>
          </>
        );
        return i.href ? (
          <Link key={i.libelle} href={i.href} className={s.carte}>
            {corps}
          </Link>
        ) : (
          <div key={i.libelle} className={s.carte}>
            {corps}
          </div>
        );
      })}
    </div>
  );
}
