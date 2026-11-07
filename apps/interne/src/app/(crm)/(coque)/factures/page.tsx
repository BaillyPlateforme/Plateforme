import Link from "next/link";
import { toutesFactures } from "@/crm/lib/data";
import { eur, nomClient, dateFr } from "@/crm/lib/format";

export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { emise: ["Émise", "w"], payee: ["Payée", "g"], retard: ["En retard", "r"] };
export default async function Factures({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const st = (await searchParams).statut;
  const rows = (await toutesFactures()).filter((r) => !st || (st === "impayees" ? r.statut !== "payee" : r.statut === st));
  return (
    <div className="view"><div className="page-h"><div><h1>Factures</h1><p>{rows.length} factures · reste à payer : <b>{eur(rows.filter((r) => r.statut !== "payee").reduce((a, r) => a + r.montant, 0))}</b></p></div></div>
      <div className="filters"><Link href="/factures" className={!st ? "on" : ""}>Toutes</Link><Link href="/factures?statut=impayees" className={st === "impayees" ? "on" : ""}>Impayées</Link><Link href="/factures?statut=payee" className={st === "payee" ? "on" : ""}>Payées</Link></div>
      <div className="card tcard"><table className="tbl"><thead><tr><th>N°</th><th>Client</th><th>Objet</th><th>Émise le</th><th>Statut</th><th>Montant</th><th>Reste à payer</th></tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="empty">Aucune facture.</td></tr>}
        {rows.map((r) => <tr key={r.id} className="row"><td><Link href={`/dossiers/${r.did}`}><b>{r.numero}</b></Link></td><td>{nomClient(r)}<small> · {r.ref}</small></td><td>{r.objet}</td><td>{dateFr(r.emise_le)}</td><td><i className={`st ${ST[r.statut][1]}`}>{ST[r.statut][0]}</i></td><td className="num"><b>{eur(r.montant)}</b></td><td className="num" style={{ color: r.statut === "payee" ? "var(--muted)" : "#be123c", fontWeight: 700 }}>{r.statut === "payee" ? "0 €" : eur(r.montant)}</td></tr>)}
      </tbody></table></div></div>
  );
}
