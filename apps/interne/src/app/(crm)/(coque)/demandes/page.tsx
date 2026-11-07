import Link from "next/link";
import { demandesWeb } from "@/crm/lib/data2";
import { importerDemande, importerToutes } from "@/crm/actions2";
import { dateFr, m3 } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
export default async function Demandes() {
  const rows = await demandesWeb();
  const restantes = rows.filter((r) => !r.importee).length;
  return (
    <div className="view">
      <Bandeau surtitre={`Site et leads · ${restantes} à importer`} titre="Demandes reçues par Internet" texte="Une fiche client et un dossier se créent en un clic, sans ressaisie.">
        <form action={importerToutes}><button disabled={restantes === 0}>Importer les {restantes} demandes</button></form>
      </Bandeau>
      <div className="card tcard"><table className="tbl"><thead><tr><th>Reçue le</th><th>Origine</th><th>Client</th><th>Chargement</th><th>Livraison</th><th>Période</th><th>Volume</th><th /></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id} style={r.importee ? { opacity: 0.55 } : undefined}>
            <td>{dateFr(r.recue_le)}</td><td><i className="ty">{r.origine}</i></td><td><b>{r.client}</b><small style={{ display: "block" }}>{r.email}</small></td>
            <td>{r.ville_chargement}</td><td>{r.ville_livraison}</td><td>{r.date_souhaitee}</td><td className="num">{m3(r.volume)}</td>
            <td>{r.importee ? <Link className="btn ghost sm" href={`/dossiers/${r.dossier_id}`}>Importée</Link> : <form action={importerDemande.bind(null, r.id)}><button className="btn primary sm">Importer</button></form>}</td>
          </tr>))}
      </tbody></table></div>
    </div>
  );
}
