import MenuVertical from "@/ui/MenuVertical";
import { PERIODE_PAR_DEFAUT, type Periode } from "./periodes";
import s from "./statistiques.module.css";

/*
 * Le menu de gauche des Statistiques (choix de David, 08/11/2026 : les vues à
 * gauche, les filtres dans la bande) : commerciales et exploitation. La
 * période choisie suit d'une vue à l'autre ; elle reste un filtre, dans la
 * rangée du bas. Les statistiques des demandes du site (leurs huit analyses)
 * sont dans Parcours › Analyse des demandes depuis l'unification du
 * 08/11/2026 (src/crm/parcours/MenuParcours.tsx).
 */
export type VueStatistiques = "commerciales" | "exploitation";

/** La rangée du bas du bandeau des statistiques (la période) : elle défile sur un écran étroit au lieu de déborder. */
export function BasStatistiques({ children }: { children: React.ReactNode }) {
  return <div className={s.bas}>{children}</div>;
}

export default function MenuStatistiques({ actif, periode }: { actif: VueStatistiques; periode?: Periode }) {
  const suffixe = periode && periode.cle !== PERIODE_PAR_DEFAUT ? `?periode=${periode.cle}` : "";
  return (
    <MenuVertical
      titre="Statistiques"
      groupes={[
        {
          items: [
            { href: `/statistiques/commerciales${suffixe}`, label: "Commercial", icone: "tendance", actif: actif === "commerciales" },
            { href: `/statistiques/exploitation${suffixe}`, label: "Exploitation", icone: "camion", actif: actif === "exploitation" },
          ],
        },
      ]}
    />
  );
}
