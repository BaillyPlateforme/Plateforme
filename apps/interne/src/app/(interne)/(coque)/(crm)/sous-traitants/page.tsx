import { redirect } from "next/navigation";
import { estCategorie } from "@/crm/partenaires/categories";

/*
 * L'ancien annuaire des sous-traitants : il fait partie des Partenaires
 * (simplification du 08/11/2026). Les filtres de l'adresse suivent ; une
 * famille devient la vue du même nom.
 */
export default async function SousTraitants({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const x = new URLSearchParams();
  const un = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const categorie = un("categorie");
  if (estCategorie(categorie)) x.set("vue", categorie);
  for (const k of ["q", "zone", "inactifs", "ok"]) {
    const v = un(k);
    if (v) x.set(k, v);
  }
  redirect(`/partenaires${x.size ? `?${x}` : ""}`);
}
