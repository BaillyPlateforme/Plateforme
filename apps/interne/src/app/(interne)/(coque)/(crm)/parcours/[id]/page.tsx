import { redirect } from "next/navigation";

/*
 * Le parcours d'un dossier est désormais en tête de sa page (simplification
 * du 08/11/2026) : un lien d'avant y mène.
 */
export default async function AncienParcoursDossier({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  redirect(/^\d+$/.test(id) ? `/dossiers/${id}` : "/parcours");
}
