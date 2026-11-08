import Link from "next/link";
import { Icone, type NomIcone } from "@/ui/icones";
import { adresse, type Filtres, type Vue } from "./filtres";
import h from "./hub.module.css";

/*
 * Les trois vues du Parcours, en tête de la rangée du bas de la bande :
 * Colonnes (le Kanban des étapes), Liste (les dossiers, triables), Suivi des
 * leads (le tableau des demandes du site). Avec `choisir`, colonnes et liste
 * basculent sans recharger la page (mêmes données) ; sinon, des liens.
 */

const VUES: { cle: Vue; label: string; icone: NomIcone }[] = [
  { cle: "colonnes", label: "Colonnes", icone: "kanban" },
  { cle: "liste", label: "Liste", icone: "menu" },
  { cle: "leads", label: "Suivi des leads", icone: "tendance" },
];

export default function Vues({ vue, filtres, choisir }: { vue: Vue; filtres: Filtres; choisir?: (v: "colonnes" | "liste") => void }) {
  return (
    <nav className={h.vues} aria-label="Vues du Parcours">
      {VUES.map((v) => {
        const contenu = (
          <>
            <Icone nom={v.icone} taille={15} />
            {v.label}
          </>
        );
        if (choisir && v.cle !== "leads") {
          const cle = v.cle;
          return (
            <button key={v.cle} type="button" aria-pressed={vue === v.cle} onClick={() => choisir(cle)}>
              {contenu}
            </button>
          );
        }
        // Le suivi des leads a ses propres filtres : on n'y emporte pas ceux des dossiers.
        return (
          <Link key={v.cle} href={v.cle === "leads" ? "/parcours?vue=leads" : adresse(v.cle, filtres)} aria-current={vue === v.cle ? "page" : undefined}>
            {contenu}
          </Link>
        );
      })}
    </nav>
  );
}
