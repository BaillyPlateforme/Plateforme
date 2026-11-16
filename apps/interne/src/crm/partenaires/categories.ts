/*
 * Les familles de l'annuaire des sous-traitants et partenaires : les sociétés
 * avec qui Bailly travaille, telles que les nomme l'audit Créagidem (société
 * exécutante, sous-traitant, confrère, transitaire, compagnie, groupeur et
 * dégroupeur). Un simple classement : aucune règle n'en dépend.
 */
export const CATEGORIES = {
  sous_traitant: { libelle: "Sous-traitant", pluriel: "Sous-traitants", ton: "indigo" },
  agence: { libelle: "Agence", pluriel: "Agences", ton: "violet" },
  partenaire: { libelle: "Partenaire / confrère", pluriel: "Partenaires", ton: "vert" },
  transitaire: { libelle: "Transitaire", pluriel: "Transitaires", ton: "ciel" },
  compagnie: { libelle: "Compagnie maritime", pluriel: "Compagnies", ton: "ciel" },
  groupeur: { libelle: "Groupeur / dégroupeur", pluriel: "Groupeurs", ton: "ambre" },
  autre: { libelle: "Autre", pluriel: "Autres", ton: "gris" },
} as const;

export type Categorie = keyof typeof CATEGORIES;
// Object.hasOwn, pas « in » : « toString » ou « constructor », hérités d'Object, ne passent pas.
export const estCategorie = (v: unknown): v is Categorie => typeof v === "string" && Object.hasOwn(CATEGORIES, v);

/** Les zones saisies (« Bretagne, 29, Martinique ») : une liste propre, sans doublon. */
export function zonesDe(v: string | null | undefined): string[] {
  const vues = new Set<string>();
  const out: string[] = [];
  for (const z of String(v ?? "").split(/[,;\n]/)) {
    const t = z.replace(/\s+/g, " ").trim().slice(0, 60);
    if (t && !vues.has(t.toLowerCase())) {
      vues.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, 40);
}
