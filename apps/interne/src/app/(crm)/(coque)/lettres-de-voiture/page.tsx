import Link from "next/link";
import { toutesLettres } from "@/crm/lib/data";
import { eur, nomClient, dateFr } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { a_planifier: ["À planifier", "i"], planifiee: ["Planifiée", "p"], en_cours: ["En cours", "w"], livree: ["Livrée", "g"] };
export default async function Lettres() {
  const rows = await toutesLettres();
  return (
    <div className="view"><Bandeau surtitre="Exploitation" titre="Lettres de voiture" texte="Une lettre par rupture de charge. Seule la première porte le montant, pour ne compter le CA qu’une fois." />
      <div className="card tcard"><table className="tbl"><thead><tr><th>N°</th><th>Client</th><th>Trajet</th><th>Chargement</th><th>Prestataire</th><th>Statut</th><th>Montant</th></tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="empty">Aucune lettre de voiture.</td></tr>}
        {rows.map((r) => <tr key={r.id} className="row"><td><Link href={`/dossiers/${r.did}`}><b>{r.numero}</b></Link></td><td>{nomClient(r)}<small> · {r.ref}</small></td><td>{r.trajet}</td><td>{dateFr(r.date_chargement)}</td><td>{r.prestataire}</td><td><i className={`st ${ST[r.statut][1]}`}>{ST[r.statut][0]}</i></td><td className="num"><b>{eur(r.montant)}</b></td></tr>)}
      </tbody></table></div></div>
  );
}
