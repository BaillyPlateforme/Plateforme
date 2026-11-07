import Coque from "@/ui/Coque";
import { contexteCoque } from "@/ui/contexte";
import EnTeteSection from "./EnTeteSection";

export const dynamic = "force-dynamic";

/**
 * Les sections venues de l'espace équipe (questionnaires, espace client vu
 * de l'équipe, réglages), dans la coque du CRM : son menu, sa barre du haut,
 * et le bandeau de section.
 */
export default async function SectionsLayout({ children }: { children: React.ReactNode }) {
  const contexte = await contexteCoque();
  return (
    <Coque {...contexte}>
      <EnTeteSection />
      {children}
    </Coque>
  );
}
