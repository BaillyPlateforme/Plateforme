import Coque from "@/ui/Coque";
import { contexteCoque } from "@/ui/contexte";

export const dynamic = "force-dynamic";

/*
 * Les pages du CRM dans la coque commune de l'app interne (src/ui) : le même
 * menu, la même barre du haut que les sections venues de l'espace équipe.
 * L'impression (/imprimer) et la signature (/signature) sont rangées hors de
 * ce groupe : elles s'affichent sans coque.
 */
export default async function CoqueCrm({ children }: { children: React.ReactNode }) {
  const contexte = await contexteCoque();
  return (
    <Coque {...contexte}>
      <div id="view" className="vue-crm">
        {children}
      </div>
    </Coque>
  );
}
