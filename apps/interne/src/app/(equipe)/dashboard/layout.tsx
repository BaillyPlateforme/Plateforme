import Coque from "@/ui/Coque";
import { contexteCoque } from "@/ui/contexte";
import { AvecMenu } from "@/ui/MenuVertical";
import EnTeteSection, { FournisseurEnTete, MenuDeSection } from "./EnTeteSection";

export const dynamic = "force-dynamic";

/**
 * Les sections venues de l'espace équipe (questionnaires, espace client vu
 * de l'équipe, réglages), dans la coque du CRM : le bandeau de la section en
 * haut, puis ses sous-onglets en menu vertical à gauche et la page à droite.
 */
export default async function SectionsLayout({ children }: { children: React.ReactNode }) {
  const contexte = await contexteCoque();
  return (
    <Coque {...contexte}>
      <FournisseurEnTete>
        <EnTeteSection />
        <AvecMenu menu={<MenuDeSection />}>{children}</AvecMenu>
      </FournisseurEnTete>
    </Coque>
  );
}
