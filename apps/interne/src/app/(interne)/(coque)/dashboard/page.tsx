import { redirect } from "next/navigation";

/*
 * L'ancienne liste des demandes du site et ses vues (?vue=liste, focus,
 * kanban, rappels) : depuis l'unification du 08/11/2026, demandes et dossiers
 * forment un seul Parcours. Chaque adresse mène à sa place, filtres compris
 * (?q=, ?statut=, ?source=, ?tri=) :
 *
 *  - la liste → Parcours › Analyse des demandes › Demandes ;
 *  - Focus → la même liste, filtre « Fort potentiel » ;
 *  - Kanban → le Tableau du Parcours (sa colonne « Demandes ») ;
 *  - Rappels → Parcours › Analyse des demandes › À rappeler.
 *
 * La page d'une demande (/dashboard/<id>) ne bouge pas.
 */
type Params = Record<string, string | string[] | undefined>;

export default async function AnciennesDemandes({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const un = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : Array.isArray(sp[k]) ? sp[k]![0] : undefined);
  const vue = un("vue");
  if (vue === "kanban") redirect("/parcours");
  if (vue === "rappels") redirect("/parcours?vue=rappels");

  const p = new URLSearchParams({ vue: "demandes" });
  for (const k of ["q", "statut", "source", "tri"]) {
    const v = un(k);
    if (v) p.set(k, v);
  }
  if (vue === "focus") {
    p.set("potentiel", "fort");
    if (!p.has("tri")) p.set("tri", "potentiel");
  }
  redirect(`/parcours?${p}`);
}
