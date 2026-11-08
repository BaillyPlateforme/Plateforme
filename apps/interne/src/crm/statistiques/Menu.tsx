import MenuVertical from "@/ui/MenuVertical";
import { PERIODE_PAR_DEFAUT, type Periode } from "./periodes";

/*
 * Le menu vertical du module Statistiques : ses deux sous-onglets, qui
 * gardent la période choisie d'une page à l'autre.
 */
export default function MenuStatistiques({ actif, periode }: { actif: "commerciales" | "exploitation"; periode: Periode }) {
  const suffixe = periode.cle === PERIODE_PAR_DEFAUT ? "" : `?periode=${periode.cle}`;
  return (
    <MenuVertical
      titre="Statistiques"
      groupes={[
        {
          items: [
            { href: `/statistiques/commerciales${suffixe}`, label: "Commerciales", icone: "tendance", actif: actif === "commerciales" },
            { href: `/statistiques/exploitation${suffixe}`, label: "Exploitation", icone: "camion", actif: actif === "exploitation" },
          ],
        },
      ]}
    />
  );
}
