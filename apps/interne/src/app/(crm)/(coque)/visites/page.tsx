import { listDossiers } from "@/crm/lib/data";
import { DossierTable } from "@/crm/components/DossierTable";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
export default async function Visites() {
  const rows = await listDossiers({ statuts: ["prospect", "visite"] });
  return (
    <div className="view"><Bandeau surtitre="Commercial" titre="Visites techniques" texte="Dossiers à visiter ou à chiffrer. Ouvrez-en un pour générer ses 3 devis." action={{ label: "Planifier une visite", href: "/planning/nouveau", icone: "plus" }} /><DossierTable rows={rows} /></div>
  );
}
