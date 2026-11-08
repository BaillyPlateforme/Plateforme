import { AvecMenu } from "@/ui/MenuVertical";
import EnTeteSection, { FournisseurEnTete, MenuDeSection } from "./EnTeteSection";

/**
 * Les sections venues de l'espace équipe (questionnaires, espace client vu
 * de l'équipe, réglages), dans la coque commune ((coque)/layout.tsx) : le bandeau de la section en
 * haut, puis ses sous-onglets en menu vertical à gauche et la page à droite.
 */
export default function SectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    // .vue-equipe : les pages écrites avec Tailwind, où les règles générales de crm.css s'arrêtent.
    <div className="vue-equipe">
      <FournisseurEnTete>
        <EnTeteSection />
        <AvecMenu menu={<MenuDeSection />}>{children}</AvecMenu>
      </FournisseurEnTete>
    </div>
  );
}
