import MenuVertical from "@/ui/MenuVertical";
import { adresse, type Filtres, type Vue } from "./filtres";

/*
 * Le menu de gauche du Parcours (choix de David, 08/11/2026 : les vues d'une
 * page à gauche, les filtres dans la bande) : Colonnes (le Kanban des
 * étapes), Liste (les dossiers, triables), Suivi des leads (le tableau des
 * demandes du site). Avec `choisir`, colonnes et liste basculent sans
 * recharger la page (mêmes données) ; sinon, des liens.
 */

export default function MenuParcours({ vue, filtres, choisir }: { vue: Vue; filtres?: Filtres; choisir?: (v: "colonnes" | "liste") => void }) {
  // Colonnes et liste gardent les filtres en cours ; le suivi des leads a les siens.
  const vers = (v: "colonnes" | "liste") => (filtres ? adresse(v, filtres) : v === "liste" ? "/parcours?vue=liste" : "/parcours");
  return (
    <MenuVertical
      titre="Parcours"
      groupes={[
        {
          items: [
            { href: vers("colonnes"), label: "Colonnes", icone: "kanban", actif: vue === "colonnes", choisir: choisir && (() => choisir("colonnes")) },
            { href: vers("liste"), label: "Liste", icone: "menu", actif: vue === "liste", choisir: choisir && (() => choisir("liste")) },
            { href: "/parcours?vue=leads", label: "Suivi des leads", icone: "tendance", actif: vue === "leads" },
          ],
        },
      ]}
    />
  );
}
