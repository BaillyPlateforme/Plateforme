import type { Metadata } from "next";
import { currentUser } from "@/crm/lib/auth";
import { cartesKanban, commerciauxKanban } from "@/crm/kanban/donnees";
import TableauKanban from "@/crm/kanban/Tableau";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kanban des dossiers" };

/*
 * Le Kanban des dossiers : toutes les étapes d'un coup d'œil, et le dépôt
 * d'un dossier dans une colonne déclenche l'action du métier (src/crm/kanban).
 * Les filtres arrivent par l'adresse (?commercial=, ?segment=, ?q=) ; le
 * tableau les applique ensuite sans recharger la page.
 */
export default async function Kanban({ searchParams }: { searchParams: Promise<{ commercial?: string; segment?: string; q?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const [cartes, commerciaux] = await Promise.all([cartesKanban(), commerciauxKanban()]);
  const commercial = Number(sp.commercial);
  return (
    <TableauKanban
      cartes={cartes}
      commerciaux={commerciaux}
      initiaux={{
        commercial: commerciaux.some((c) => c.id === commercial) ? commercial : null,
        segment: sp.segment && cartes.some((c) => c.segment === sp.segment) ? sp.segment : null,
        q: (sp.q ?? "").slice(0, 80),
      }}
    />
  );
}
