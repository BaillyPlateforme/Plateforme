import MenuVertical, { type ItemMenu } from "@/ui/MenuVertical";
import { VUES_DU_SITE, type VueDuSite } from "@/crm/statistiques/demandes/vues";
import { adresse, type Filtres, type Vue } from "./filtres";

/*
 * Le menu de gauche du Parcours (unification du 08/11/2026 : les demandes du
 * site et les dossiers forment un seul parcours, une seule entrée du menu).
 * Les vues d'une page à gauche, les filtres dans la bande (choix de David).
 *
 *  - Parcours : le Tableau (les colonnes, de « Demandes » à « Perdu ») et la
 *    Liste (demandes et dossiers, triables). Avec `choisir`, ils basculent
 *    sans recharger la page (mêmes données) ; sinon, des liens.
 *  - Analyse des demandes : la liste détaillée des demandes du site et ses
 *    filtres, les clients à rappeler, les statistiques (l'ancien Statistiques
 *    › Demandes du site : leurs huit analyses s'ouvrent sous l'entrée), et le
 *    suivi des leads.
 */

/** L'adresse d'une analyse des statistiques des demandes (la vue d'ensemble nommée : l'entrée « Statistiques » a l'adresse nue). */
const adresseStatistiques = (a: VueDuSite) => `/parcours?vue=statistiques&analyse=${a}`;

export default function MenuParcours({
  vue,
  filtres,
  choisir,
  analyse,
  nombres,
}: {
  vue: Vue;
  filtres?: Filtres;
  choisir?: (v: "colonnes" | "liste") => void;
  /** L'analyse ouverte des statistiques. */
  analyse?: VueDuSite;
  /** Les pastilles du menu, quand la page les a comptées : rappels ouverts. */
  nombres?: { rappels?: number };
}) {
  // Le tableau et la liste gardent les filtres en cours ; les vues d'analyse ont les leurs.
  const vers = (v: "colonnes" | "liste") => (filtres ? adresse(v, filtres) : v === "liste" ? "/parcours?vue=liste" : "/parcours");
  const statistiques: ItemMenu[] =
    vue === "statistiques"
      ? VUES_DU_SITE.map((v) => ({ href: adresseStatistiques(v.cle), label: v.label, actif: (analyse ?? "ensemble") === v.cle, sous: true }))
      : [];
  return (
    <MenuVertical
      titre="Parcours"
      groupes={[
        {
          items: [
            { href: vers("colonnes"), label: "Tableau", icone: "kanban", actif: vue === "colonnes", choisir: choisir && (() => choisir("colonnes")) },
            { href: vers("liste"), label: "Liste", icone: "menu", actif: vue === "liste", choisir: choisir && (() => choisir("liste")) },
          ],
        },
        {
          titre: "Analyse des demandes",
          items: [
            { href: "/parcours?vue=demandes", label: "Demandes", icone: "boite", actif: vue === "demandes" },
            { href: "/parcours?vue=rappels", label: "À rappeler", icone: "horloge", actif: vue === "rappels", nombre: nombres?.rappels },
            { href: "/parcours?vue=statistiques", label: "Statistiques", icone: "stats", actif: vue === "statistiques" },
            ...statistiques,
            { href: "/parcours?vue=leads", label: "Suivi des leads", icone: "tendance", actif: vue === "leads" },
          ],
        },
      ]}
    />
  );
}
