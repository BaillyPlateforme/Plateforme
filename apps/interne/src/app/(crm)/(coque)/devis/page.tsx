import Link from "next/link";
import { tousDevis } from "@/crm/lib/data";
import { eur, nomClient, dateFr } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { brouillon: ["Brouillon", "i"], envoye: ["Envoyé", "w"], signe: ["Signé", "g"], refuse: ["Refusé", "r"] };
export default async function Devis({ searchParams }: { searchParams: Promise<{ statut?: string; dossier?: string }> }) {
  const sp = await searchParams;
  const st = sp.statut;
  // Ouvert depuis un dossier : ses seuls devis (on reste sur le dossier).
  const dossier = sp.dossier && /^\d+$/.test(sp.dossier) ? Number(sp.dossier) : null;
  const rows = (await tousDevis()).filter((r) => (!st || r.statut === st) && (!dossier || r.did === dossier));
  const refDossier = dossier ? rows[0]?.ref ?? null : null;
  return (
    <div className="view"><Bandeau surtitre={`Commercial · ${rows.length} devis`} titre="Devis" texte={dossier ? `Les devis du dossier ${refDossier ?? ""}` : "Toutes les formules établies, de l’envoi à la signature."}>{dossier && <><Link href={`/dossiers/${dossier}`} data-ton="contour">Fiche du dossier</Link><Link href="/devis" data-ton="contour">Tous les devis</Link></>}</Bandeau>
      <div className="filters"><Link href="/devis" className={!st ? "on" : ""}>Tous</Link>{Object.entries(ST).map(([k, v]) => <Link key={k} href={`/devis?statut=${k}`} className={st === k ? "on" : ""}>{v[0]}</Link>)}</div>
      <div className="card tcard"><table className="tbl"><thead><tr><th>N°</th><th>Client</th><th>Formule</th><th>Statut</th><th>Envoyé</th><th>Montant</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id} className="row"><td><Link href={`/dossiers/${r.did}`}><b>{r.numero}</b></Link></td><td>{nomClient(r)}<small> · {r.ref}</small></td><td style={{ textTransform: "capitalize" }}>{r.formule}</td><td><i className={`st ${ST[r.statut][1]}`}>{ST[r.statut][0]}</i></td><td>{dateFr(r.envoye_le)}</td><td className="num"><b>{eur(r.montant)}</b></td></tr>)}
      </tbody></table></div></div>
  );
}
