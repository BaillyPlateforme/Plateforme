import MenuVertical from "@/ui/MenuVertical";
import { adresse, type Filtres } from "./filtres";

/*
 * Le menu de gauche du Parcours (les vues d'une page à gauche, les filtres
 * dans la bande, choix de David) : le Tableau (les colonnes, de « Demandes »
 * à « Perdu ») et la Liste (demandes et dossiers, triables). Avec `choisir`,
 * ils basculent sans recharger la page (mêmes données) ; sinon, des liens.
 *
 * Les demandes du site, de près (Kanban détaillé, Feed, Top demandes,
 * analyse), ont leur entrée : Demandes (src/crm/demandes/MenuDemandes).
 */

export default function MenuParcours({ vue, filtres, choisir }: { vue: "colonnes" | "liste"; filtres?: Filtres; choisir?: (v: "colonnes" | "liste") => void }) {
  // Le tableau et la liste gardent les filtres en cours.
  const vers = (v: "colonnes" | "liste") => (filtres ? adresse(v, filtres) : v === "liste" ? "/parcours?vue=liste" : "/parcours");
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
      ]}
    />
  );
}
