import Link from "next/link";
import { listDossiers } from "@/crm/lib/data";
import { DossierTable } from "@/crm/components/DossierTable";

export const dynamic = "force-dynamic";
export default async function Visites() {
  const rows = await listDossiers({ statuts: ["prospect", "visite"] });
  return (
    <div className="view"><div className="page-h"><div><h1>Visites techniques</h1><p>Dossiers à visiter ou à chiffrer. Ouvrez-en un pour générer ses 3 devis.</p></div><Link href="/planning/nouveau" className="btn primary">Planifier une visite</Link></div><DossierTable rows={rows} /></div>
  );
}
