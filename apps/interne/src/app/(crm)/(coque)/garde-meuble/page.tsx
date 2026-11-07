import { gardeMeuble } from "@/crm/lib/data2";
import { facturerGardeMeuble } from "@/crm/actions2";
import { dateFr, eur } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
export default async function GardeMeuble() {
  const rows = await gardeMeuble();
  const aFact = rows.filter((r) => r.afacturer);
  return (
    <div className="view">
      <Bandeau surtitre={`Exploitation · ${rows.length} contrats`} titre="Garde-meuble" texte={<>{rows.reduce((a, r) => a + r.nb_caisses, 0)} caisses · {aFact.length} à facturer, soit <b>{eur(aFact.reduce((a, r) => a + r.montant, 0))}</b></>} />
      <div className="card tcard"><table className="tbl"><thead><tr><th>Client</th><th>Caisses</th><th>Numéros</th><th>Facturation</th><th>Dernière facture</th><th>Échéance</th><th>Montant</th><th /></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><b>{r.client}</b><small style={{ display: "block" }}>{r.assurance ? "Assuré" : "Non assuré"} · depuis {dateFr(r.debut, { month: "short", year: "numeric" })}</small></td>
            <td className="num">{r.nb_caisses}</td><td><small>{r.numeros}</small></td><td style={{ textTransform: "capitalize" }}>{r.periodicite}</td>
            <td>{dateFr(r.derniere_facture)}</td>
            <td>{r.afacturer ? <i className={`st ${r.retard > 20 ? "r" : "w"}`}>{r.retard > 20 ? `Non facturé depuis ${r.retard} j` : "À facturer"}</i> : <i className="st g">{dateFr(r.echeance)}</i>}</td>
            <td className="num"><b>{eur(r.montant)}</b></td>
            <td>{r.afacturer ? <form action={facturerGardeMeuble.bind(null, r.id, r.montant)}><button className="btn primary sm">Facturer</button></form> : null}</td>
          </tr>))}
      </tbody></table></div>
    </div>
  );
}
