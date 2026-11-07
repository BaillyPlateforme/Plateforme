import Link from "next/link";
import { tousDevis } from "@/crm/lib/data";
import { eur, nomClient, dateFr } from "@/crm/lib/format";

export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { brouillon: ["Brouillon", "i"], envoye: ["Envoyé", "w"], signe: ["Signé", "g"], refuse: ["Refusé", "r"] };
export default async function Devis({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const st = (await searchParams).statut;
  const rows = (await tousDevis()).filter((r) => !st || r.statut === st);
  return (
    <div className="view"><div className="page-h"><div><h1>Devis</h1><p>{rows.length} devis · toutes formules</p></div></div>
      <div className="filters"><Link href="/devis" className={!st ? "on" : ""}>Tous</Link>{Object.entries(ST).map(([k, v]) => <Link key={k} href={`/devis?statut=${k}`} className={st === k ? "on" : ""}>{v[0]}</Link>)}</div>
      <div className="card tcard"><table className="tbl"><thead><tr><th>N°</th><th>Client</th><th>Formule</th><th>Statut</th><th>Envoyé</th><th>Montant</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id} className="row"><td><Link href={`/dossiers/${r.did}`}><b>{r.numero}</b></Link></td><td>{nomClient(r)}<small> · {r.ref}</small></td><td style={{ textTransform: "capitalize" }}>{r.formule}</td><td><i className={`st ${ST[r.statut][1]}`}>{ST[r.statut][0]}</i></td><td>{dateFr(r.envoye_le)}</td><td className="num"><b>{eur(r.montant)}</b></td></tr>)}
      </tbody></table></div></div>
  );
}
