import type { NomIcone } from "@/ui/icones";
import MenuVertical from "@/ui/MenuVertical";
import { CATEGORIES, type Categorie } from "./categories";
import type { filtresAnnuaire } from "./donnees";

/** Les vues de l'annuaire : tout, les déménageurs (leurs comptes de l'outil terrain), ou une famille de sociétés. */
export type VuePartenaires = "tous" | "demenageurs" | Categorie;

const ICONES: Record<Categorie, NomIcone> = {
  sous_traitant: "camion",
  agence: "entrepot",
  partenaire: "clients",
  transitaire: "globe",
  compagnie: "bateau",
  groupeur: "caisse",
  autre: "grille",
};

/* Dans une page nommée « Partenaires », la famille du même nom garde son libellé complet (« Partenaires / confrères »). */
const libelle = (k: Categorie) => (k === "partenaire" ? "Partenaires / confrères" : CATEGORIES[k].pluriel);

/**
 * Le menu de gauche de l'annuaire (les vues vont dans le menu, jamais dans
 * le bandeau, décision de David du 08/11/2026) : « Tous », les déménageurs,
 * puis une entrée par famille de sociétés qui en compte, avec leurs nombres.
 * Sur la fiche d'une société, sa famille est allumée.
 */
export default function MenuPartenaires({
  actif,
  filtres,
  href,
}: {
  actif: VuePartenaires | null;
  filtres: Awaited<ReturnType<typeof filtresAnnuaire>>;
  /** L'adresse d'une vue : la liste garde sa recherche. */
  href: (v: VuePartenaires) => string;
}) {
  const societes = [...filtres.categories.values()].reduce((a, b) => a + b, 0);
  const familles = (Object.keys(CATEGORIES) as Categorie[]).filter((k) => filtres.categories.get(k) || actif === k);
  return (
    <MenuVertical
      titre="Partenaires"
      groupes={[
        {
          items: [
            { href: href("tous"), label: "Tous", icone: "partenaires", actif: actif === "tous", nombre: societes + filtres.demenageurs },
            { href: href("demenageurs"), label: "Déménageurs", icone: "equipe", actif: actif === "demenageurs", nombre: filtres.demenageurs },
          ],
        },
        ...(familles.length
          ? [{ titre: "Sociétés", items: familles.map((k) => ({ href: href(k), label: libelle(k), icone: ICONES[k], actif: actif === k, nombre: filtres.categories.get(k) ?? 0 })) }]
          : []),
      ]}
    />
  );
}
