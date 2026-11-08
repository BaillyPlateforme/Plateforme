import { redirect } from "next/navigation";

/** Les devis d'un dossier : la liste des devis, filtrée sur lui (onglet Devis, création comprise). */
export default async function DevisDuDossier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nouveau?: string }> }) {
  const { id } = await params;
  const nouveau = (await searchParams).nouveau;
  redirect(`/devis?dossier=${encodeURIComponent(id)}${nouveau ? `&nouveau=${encodeURIComponent(nouveau)}` : ""}`);
}
