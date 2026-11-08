import { Pilules } from "@/ui/Bandeau";
import { PERIODE_PAR_DEFAUT, type Periode } from "./periodes";
import s from "./statistiques.module.css";

/*
 * Les trois vues des Statistiques, en pilules dans la rangée du bas du
 * bandeau (simplification du 08/11/2026 : plus de menu à gauche) :
 * commerciales, exploitation, et les demandes du site (l'ancienne page
 * /dashboard/statistiques). La période choisie suit d'une vue à l'autre
 * quand la vue la connaît.
 */
export type VueStatistiques = "commerciales" | "exploitation" | "demandes";

/** La rangée du bas du bandeau des statistiques : elle défile sur un écran étroit au lieu de déborder. */
export function BasStatistiques({ children }: { children: React.ReactNode }) {
  return <div className={s.bas}>{children}</div>;
}

export default function VuesStatistiques({ actif, periode }: { actif: VueStatistiques; periode?: Periode }) {
  const suffixe = periode && periode.cle !== PERIODE_PAR_DEFAUT ? `?periode=${periode.cle}` : "";
  return (
    <>
      <Pilules
        label="Statistiques"
        items={[
          { href: `/statistiques/commerciales${suffixe}`, label: "Commercial", actif: actif === "commerciales" },
          { href: `/statistiques/exploitation${suffixe}`, label: "Exploitation", actif: actif === "exploitation" },
          { href: "/statistiques/demandes", label: "Demandes du site", actif: actif === "demandes" },
        ]}
      />
      <i className={s.separateurBas} aria-hidden />
    </>
  );
}
