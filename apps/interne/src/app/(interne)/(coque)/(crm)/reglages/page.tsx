import Link from "next/link";
import Bandeau from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuReglages from "@/crm/reglages/MenuReglages";
import { GROUPES_REGLAGES } from "@/crm/reglages/pages";
import s from "@/crm/reglages/reglages.module.css";

export const metadata = { title: "Réglages" };

/*
 * Réglages, la vue d'ensemble (simplification du 08/11/2026) : chaque page de
 * réglage en une carte, rangée dans son groupe, sans chiffres. Le menu de
 * gauche est le même sur toutes les pages de Réglages.
 */
export default function Reglages() {
  return (
    <div className="view">
      <Bandeau surtitre="Réglages" titre="Réglages" texte="Tout ce qui règle l'outil, au même endroit." />
      <AvecMenu menu={<MenuReglages />}>
        <div className={s.ensemble}>
          {GROUPES_REGLAGES.map((g) => (
            <section key={g.titre} className={s.groupe} aria-labelledby={`reglages-${g.titre}`}>
              <h2 id={`reglages-${g.titre}`} className={s.groupeTitre}>{g.titre}</h2>
              <div className={s.cartes}>
                {g.pages.map((p) => (
                  <Link key={p.href} href={p.href} className={s.carte}>
                    <span className={s.picto}>
                      <Icone nom={p.icone} taille={19} />
                    </span>
                    <span className={s.corps}>
                      <b>{p.titre ?? p.label}</b>
                      <small>{p.texte}</small>
                    </span>
                    <i className={s.fleche} aria-hidden>
                      <Icone nom="fleche" taille={16} />
                    </i>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </AvecMenu>
    </div>
  );
}
