import Link from "next/link";
import { Ic } from "@/crm/lib/icons";
import { eur, m3, nomClient, photoPour, STATUTS, TYPES } from "@/crm/lib/format";
import type { Row } from "@/crm/lib/db";

export function DossierTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <div className="card empty">Aucun dossier ne correspond.</div>;
  return (
    <div className="card tcard">
      <table className="tbl">
        <thead><tr><th>Client</th><th>Type</th><th>Trajet</th><th>Volume</th><th>Commercial</th><th>Statut</th><th>Montant</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="row">
              <td><Link className="name" href={`/dossiers/${r.id}`}><i className="thumb" style={{ backgroundImage: `url(${photoPour(r.arrivee, r.id)})` }} /><span><b>{nomClient(r)}</b><small>{r.ref}</small></span></Link></td>
              <td><i className="ty">{TYPES[r.type]}</i></td>
              <td>{r.depart ?? "—"} → {r.arrivee ?? "—"}</td>
              <td className="num">{m3(r.volume)}</td>
              <td>{r.commercial ?? "—"}</td>
              <td><i className={`st ${STATUTS[r.statut].cls}`}>{STATUTS[r.statut].label}</i></td>
              <td className="num"><b>{eur(r.montant)}</b></td>
              <td><Link href={`/dossiers/${r.id}`} className="go"><Ic n="right" /></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
