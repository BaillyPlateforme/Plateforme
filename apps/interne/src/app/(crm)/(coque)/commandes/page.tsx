import { listDossiers } from "@/crm/lib/data";
import { DossierTable } from "@/crm/components/DossierTable";

export const dynamic = "force-dynamic";
export default async function Commandes() {
  const rows = await listDossiers({ statuts: ["commande", "planifie"] });
  return (
    <div className="view"><div className="page-h"><div><h1>Commandes</h1><p>Devis signés, avec ou sans date : le chiffre d’affaires se rattache à la date ou au mois prévu.</p></div></div><DossierTable rows={rows} /></div>
  );
}
