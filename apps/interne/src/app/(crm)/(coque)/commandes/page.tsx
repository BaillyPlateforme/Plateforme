import { listDossiers } from "@/crm/lib/data";
import { DossierTable } from "@/crm/components/DossierTable";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
export default async function Commandes() {
  const rows = await listDossiers({ statuts: ["commande", "planifie"] });
  return (
    <div className="view"><Bandeau surtitre="Exploitation" titre="Commandes" texte="Devis signés, avec ou sans date : le chiffre d’affaires se rattache à la date ou au mois prévu." /><DossierTable rows={rows} /></div>
  );
}
