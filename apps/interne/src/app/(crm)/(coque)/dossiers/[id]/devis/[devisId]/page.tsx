import Link from "next/link";
import { notFound } from "next/navigation";
import { devisDetail } from "@/crm/lib/data2";
import { majContrat, majChiffrage, majPrestations } from "@/crm/actions2";
import { eur, m3, nomClient } from "@/crm/lib/format";
import type { Row } from "@/crm/lib/db";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
const ONGLETS: [string, string][] = [["contrat", "Données contractuelles"], ["chiffrage", "Chiffrage"], ["prestations", "Prestations"], ["achats", "Achats et marge"]];
const TYPES: Record<string, string> = { national: "National · forfait 5 postes", international: "International", maritime: "International maritime", aerien: "International aérien", gm: "Garde-meuble seul", bureau: "Transfert de bureau" };

export default async function DevisPage({ params, searchParams }: { params: Promise<{ id: string; devisId: string }>; searchParams: Promise<{ onglet?: string }> }) {
  const { id, devisId } = await params;
  const onglet = (await searchParams).onglet ?? "contrat";
  const v = await devisDetail(Number(devisId));
  if (!v || String(v.did) !== id) notFound();
  const lignes = v.lignes as Row[], prestations = v.prestations as Row[];
  const facturees = lignes.filter((l) => l.charge !== "client");
  const ttc = facturees.reduce((a, l) => a + l.prix, 0), ht = ttc / 1.2;
  const achats = facturees.reduce((a, l) => a + (l.achat ?? 0), 0);
  const marge = ttc - achats;
  const iso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  return (
    <div className="view">
      <Bandeau surtitre={`Devis · formule ${v.formule}`} titre={`Devis ${v.numero}`} texte={`${nomClient(v)} · ${v.depart} → ${v.arrivee} · ${m3(v.volume)} · ${v.statut}`} secondaire={{ label: "Retour au dossier", href: `/dossiers/${id}` }} />
      <div className="filters">{ONGLETS.map(([k, l]) => <Link key={k} href={`/dossiers/${id}/devis/${devisId}?onglet=${k}`} className={onglet === k ? "on" : ""}>{l}</Link>)}</div>
      <section className="card">
        {onglet === "contrat" && (
          <form action={majContrat.bind(null, v.id)} className="form-grid">
            <div className="fld w4"><label>Type de déménagement</label><select name="type_demenagement" defaultValue={v.type_demenagement}>{Object.entries(TYPES).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
            <div className="fld w4"><label>Catégorie (formule)</label><input type="text" value={v.formule} readOnly style={{ textTransform: "capitalize" }} /></div>
            <div className="fld w4"><label>Volume (m³)</label><input type="text" value={v.volume} readOnly /></div>
            <div className="fld w4"><label>Distance (km)</label><input type="number" name="distance_km" defaultValue={v.distance_km ?? ""} /></div>
            <div className="fld w4"><label>Type de déplacement</label><select name="deplacement" defaultValue={v.deplacement}><option value="route">Route</option><option value="urbain">Urbain</option></select></div>
            <div className="fld w4"><label>Validité de l’offre</label><input type="date" name="validite" defaultValue={iso(v.validite)} /></div>
            <div className="fld w12"><label className="chk"><input type="checkbox" name="groupage" defaultChecked={v.groupage} />Déménagement groupé avec d’autres clients (sinon camion dédié)</label></div>
            <div className="fld w4"><label>Arrhes à verser</label><input type="text" value={`30 % soit ${eur(Math.round(v.montant * 0.3))}`} readOnly /></div>
            <div className="fld w8"><label>Conditions particulières</label><textarea name="conditions" defaultValue={v.conditions ?? ""} placeholder="Solde à la livraison, accès camion, monte-meubles…" /></div>
            <div className="fld w12"><button className="btn primary sm">Enregistrer</button></div>
          </form>)}
        {(onglet === "chiffrage" || onglet === "achats") && (
          <form action={majChiffrage.bind(null, v.id)}>
            <table className="tbl"><thead><tr><th>Prestation</th><th>À charge</th><th className="num">Prix client (TTC)</th>{onglet === "achats" && <><th className="num">Coût d’achat</th><th className="num">Marge</th></>}</tr></thead><tbody>
              {lignes.map((l, i) => (
                <tr key={i}><td>{l.libelle}</td>
                  <td><select name={`charge_${i}`} defaultValue={l.charge} style={{ maxWidth: 130 }}><option value="bailly">Bailly</option><option value="client">Client</option></select></td>
                  <td className="num"><input type="number" name={`prix_${i}`} defaultValue={l.prix} style={{ maxWidth: 120, textAlign: "right" }} /></td>
                  {onglet === "achats" && <><td className="num"><input type="number" name={`achat_${i}`} defaultValue={l.achat ?? 0} style={{ maxWidth: 120, textAlign: "right" }} /></td>
                    <td className="num" style={{ color: l.charge === "client" ? "var(--muted)" : (l.prix - (l.achat ?? 0)) >= 0 ? "var(--ok)" : "var(--warn)" }}><b>{l.charge === "client" ? "—" : eur(l.prix - (l.achat ?? 0))}</b></td></>}
                </tr>))}
            </tbody></table>
            <div className="minil" style={{ marginTop: 18 }}>
              <div className="kpi"><small>Total HT</small><b>{eur(ht)}</b></div><div className="kpi"><small>TVA 20 %</small><b>{eur(ttc - ht)}</b></div>
              <div className="kpi"><small>Total TTC</small><b>{eur(ttc)}</b></div>
              {onglet === "achats" ? <div className="kpi ok"><small>Marge prévue</small><b>{eur(marge)} · {ttc ? Math.round((marge / ttc) * 100) : 0} %</b></div> : <div className="kpi"><small>Arrhes 30 %</small><b>{eur(Math.round(ttc * 0.3))}</b></div>}
            </div>
            <div className="form-actions"><button className="btn primary sm">Enregistrer</button></div>
          </form>)}
        {onglet === "prestations" && (
          <form action={majPrestations.bind(null, v.id)}>
            <p className="sub" style={{ marginBottom: 12 }}>Ce que Bailly réalise, et ce qui reste à la charge du client. Ces lignes apparaissent sur le devis envoyé.</p>
            <table className="tbl"><tbody>{prestations.map((p, i) => (
              <tr key={i}><td>{p.libelle}</td>
                <td><label className="chk"><input type="radio" name={`p_${i}`} value="bailly" defaultChecked={p.charge === "bailly"} />Bailly</label></td>
                <td><label className="chk"><input type="radio" name={`p_${i}`} value="client" defaultChecked={p.charge !== "bailly"} />Client</label></td></tr>))}</tbody></table>
            <div className="form-actions"><button className="btn primary sm">Enregistrer</button></div>
          </form>)}
      </section>
    </div>
  );
}
