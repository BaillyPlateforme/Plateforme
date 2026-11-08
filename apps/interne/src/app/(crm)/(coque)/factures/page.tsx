import Link from "next/link";
import { toutesFactures } from "@/crm/lib/data";
import { eur, nomClient, dateFr } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { emise: ["Émise", "w"], payee: ["Payée", "g"], retard: ["En retard", "r"] };
export default async function Factures({ searchParams }: { searchParams: Promise<{ statut?: string; dossier?: string }> }) {
  const sp = await searchParams;
  const st = sp.statut;
  // Ouvert depuis un dossier : ses seules factures (on reste sur le dossier).
  const dossier = sp.dossier && /^\d+$/.test(sp.dossier) ? Number(sp.dossier) : null;
  const rows = (await toutesFactures()).filter((r) => (!st || (st === "impayees" ? r.statut !== "payee" : r.statut === st)) && (!dossier || r.did === dossier));
  return (
    <div className="view"><Bandeau surtitre={`Commercial · ${rows.length} factures`} titre="Factures" texte={<>{dossier ? `Dossier ${rows[0]?.ref ?? ""} · ` : ""}Reste à payer : <b>{eur(rows.filter((r) => r.statut !== "payee").reduce((a, r) => a + r.montant, 0))}</b></>}>{dossier && <><Link href={`/dossiers/${dossier}`} data-ton="contour">Fiche du dossier</Link><Link href="/factures" data-ton="contour">Toutes les factures</Link></>}</Bandeau>
      <div className="filters"><Link href="/factures" className={!st ? "on" : ""}>Toutes</Link><Link href="/factures?statut=impayees" className={st === "impayees" ? "on" : ""}>Impayées</Link><Link href="/factures?statut=payee" className={st === "payee" ? "on" : ""}>Payées</Link></div>
      <div className="card tcard"><table className="tbl"><thead><tr><th>N°</th><th>Client</th><th>Objet</th><th>Émise le</th><th>Statut</th><th>Montant</th><th>Reste à payer</th></tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="empty">Aucune facture.</td></tr>}
        {rows.map((r) => {
          // Toute la ligne ouvre la facture ; le client mène au dossier.
          const doc = r.did ? `/imprimer/${r.did}?doc=facture&f=${r.id}` : "/garde-meuble";
          return <tr key={r.id} className="row lien-ligne"><td><Link href={doc} className="etendu"><b>{r.numero}</b></Link></td><td>{r.did ? <Link href={`/dossiers/${r.did}`} className="dessus">{nomClient(r)}</Link> : r.affiche}<small> · {r.ref ?? "garde-meuble"}</small></td><td>{r.objet}</td><td>{dateFr(r.emise_le)}</td><td><i className={`st ${ST[r.statut][1]}`}>{ST[r.statut][0]}</i></td><td className="num"><b>{eur(r.montant)}</b></td><td className="num" style={{ color: r.statut === "payee" ? "var(--muted)" : "#be123c", fontWeight: 700 }}>{r.statut === "payee" ? "0 €" : eur(r.montant)}</td></tr>;
        })}
      </tbody></table></div></div>
  );
}
