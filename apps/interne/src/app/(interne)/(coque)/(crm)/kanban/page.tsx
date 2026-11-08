import { redirect } from "next/navigation";

/*
 * Le Kanban des dossiers est devenu la vue « Colonnes » du Parcours
 * (simplification du 08/11/2026). Un lien d'avant y mène, avec ses filtres
 * (?segment= devient ?type=) ; ouvert sur un dossier (?dossier=), il mène à
 * la page du dossier, qui porte son parcours.
 */
export default async function AncienKanban({ searchParams }: { searchParams: Promise<{ commercial?: string; segment?: string; q?: string; dossier?: string }> }) {
  const sp = await searchParams;
  if (sp.dossier && /^\d+$/.test(sp.dossier)) redirect(`/dossiers/${sp.dossier}`);
  const p = new URLSearchParams();
  if (sp.q) p.set("q", sp.q);
  if (sp.segment) p.set("type", sp.segment);
  if (sp.commercial) p.set("commercial", sp.commercial);
  redirect(`/parcours${p.size ? `?${p}` : ""}`);
}
