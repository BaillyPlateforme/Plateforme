import { redirect } from "next/navigation";

/* La fiche d'une société vit désormais dans l'annuaire des partenaires (simplification du 08/11/2026). */
export default async function AncienneFiche({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/partenaires/${encodeURIComponent(id)}`);
}
