import { redirect } from "next/navigation";

/*
 * La liste « Clients et dossiers » est devenue la vue « Liste » du Parcours
 * (simplification du 08/11/2026). Un lien d'avant y mène, avec sa recherche
 * et son type de client — la recherche de la barre du haut aussi.
 */
export default async function AncienneListe({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ vue: "liste" });
  if (sp.q) p.set("q", sp.q);
  if (sp.type) p.set("type", sp.type);
  redirect(`/parcours?${p}`);
}
