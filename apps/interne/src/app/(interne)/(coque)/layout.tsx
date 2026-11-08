import Coque from "@/ui/Coque";
import { contexteCoque } from "@/ui/contexte";

export const dynamic = "force-dynamic";

/*
 * La coque commune (barre du haut, sous-barre, onglets des dossiers ouverts)
 * posée UNE fois pour toutes les pages qui l'ont : celles du CRM et celles de
 * l'espace équipe. Passer d'une page à l'autre ne la redessine pas : elle
 * reste en place, seule la page change. L'impression, la signature, la
 * connexion et l'aperçu de l'espace client sont hors de ce groupe.
 */
export default async function LayoutCoque({ children }: { children: React.ReactNode }) {
  const contexte = await contexteCoque();
  return <Coque {...contexte}>{children}</Coque>;
}
