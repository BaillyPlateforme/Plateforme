import MenuVertical from "@/ui/MenuVertical";
import type { NomIcone } from "@/ui/icones";
import { VUES_DU_SITE, type VueDuSite } from "./demandes/vues";
import { PERIODE_PAR_DEFAUT, type Periode } from "./periodes";
import s from "./statistiques.module.css";

/*
 * Le menu de gauche des Statistiques (choix de David, 08/11/2026 : les vues à
 * gauche, les filtres dans la bande) : commerciales, exploitation, puis les
 * demandes du site (l'ancienne page /dashboard/statistiques) et leurs huit
 * analyses, en second groupe. La période choisie suit d'une vue à l'autre
 * quand la vue la connaît ; elle reste un filtre, dans la rangée du bas.
 */
export type VueStatistiques = "commerciales" | "exploitation" | "demandes";

/** La rangée du bas du bandeau des statistiques (la période) : elle défile sur un écran étroit au lieu de déborder. */
export function BasStatistiques({ children }: { children: React.ReactNode }) {
  return <div className={s.bas}>{children}</div>;
}

const ICONES_DU_SITE: Record<VueDuSite, NomIcone> = {
  ensemble: "bord",
  mails: "courrier",
  formulaire: "questionnaires",
  heatmap: "grille",
  analyse: "stats",
  formules: "caisse",
  geographie: "globe",
  conversion: "commande",
};

export default function MenuStatistiques({ actif, periode, analyse }: { actif: VueStatistiques; periode?: Periode; /** L'analyse ouverte des demandes du site. */ analyse?: VueDuSite }) {
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
        {
          titre: "Demandes du site",
          items: VUES_DU_SITE.map((v) => ({
            href: v.cle === "ensemble" ? "/statistiques/demandes" : `/statistiques/demandes?vue=${v.cle}`,
            label: v.label,
            icone: ICONES_DU_SITE[v.cle],
            actif: actif === "demandes" && (analyse ?? "ensemble") === v.cle,
          })),
        },
      ]}
    />
  );
}
