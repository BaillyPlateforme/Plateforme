import { redirect } from "next/navigation";

/*
 * L'ancienne liste des demandes du site et ses vues (?vue=liste, focus,
 * kanban, rappels) : chaque adresse mène à sa place dans Demandes, filtres
 * compris (?q=, ?statut=, ?source=, ?tri=) :
 *
 *  - la liste → Demandes › Liste ;
 *  - Focus → Demandes › Top demandes, filtre « Fort potentiel » ;
 *  - Kanban → Demandes › Kanban ;
 *  - Rappels → Demandes › À rappeler.
 *
 * La page d'une demande (/dashboard/<id>) ne bouge pas.
 */
type Params = Record<string, string | string[] | undefined>;

export default async function AnciennesDemandes({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const un = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : Array.isArray(sp[k]) ? sp[k]![0] : undefined);
  const vue = un("vue");
  if (vue === "kanban") redirect("/demandes");
  if (vue === "rappels") redirect("/demandes?vue=rappels");
  if (vue === "focus") redirect("/demandes?vue=top&potentiel=fort");

  const p = new URLSearchParams({ vue: "liste" });
  for (const k of ["q", "statut", "source", "tri"]) {
    const v = un(k);
    if (v) p.set(k, v);
  }
  redirect(`/demandes?${p}`);
}
