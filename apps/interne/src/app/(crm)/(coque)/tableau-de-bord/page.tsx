import Link from "next/link";
import { stats } from "@/crm/lib/data";
import { Ic } from "@/crm/lib/icons";
import { Line, Gauge } from "@/crm/components/charts";
import { eur, m3, nomClient, STATUTS, TYPES, photoPour } from "@/crm/lib/format";

export const dynamic = "force-dynamic";
const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export default async function Tableau() {
  const s = await stats();
  const mois = new Date().getMonth() + 1;
  const pts = Array.from({ length: mois }, (_, i) => s.serie.find((x) => x.m === i + 1)?.ca ?? 0);
  const moy = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
  const goal = pts.map(() => moy * 1.1);
  const total = pts.reduce((a, b) => a + b, 0);
  const delta = s.ca.prec ? Math.round(((s.ca.cur - s.ca.prec) / s.ca.prec) * 100) : null;
  const taux = s.t30.decides ? Math.round((s.t30.signes / s.t30.decides) * 100) : 0;
  const maxSem = Math.max(1, ...s.semaines.map((x) => x.n));
  const totRep = Math.max(1, s.repart.reduce((a, b) => a + b.n, 0));
  const tun: [string, number][] = [["Visites", s.tun.visites], ["Devis envoyés", s.tun.devis], ["Signés", s.tun.signes], ["Planifiés", s.tun.planifies]];
  const maxT = Math.max(1, ...tun.map((t) => t[1]));
  const cls = ["s1", "s2", "s3", "s4"];
  return (
    <div className="view dash">
      <div className="page-h"><div><h1>Tableau de bord</h1><p>Chiffres calculés en direct sur les dossiers et devis.</p></div></div>
      <div className="kpis five">
        <div className="kpi"><span className="ki"><Ic n="receipt" /></span><small>CA signé · mois en cours</small><b>{eur(s.ca.cur)}</b>{delta != null && <em className={delta >= 0 ? "up" : "dn"}>{delta >= 0 ? "+" : ""}{delta} %</em>}</div>
        <div className="kpi"><span className="ki"><Ic n="doc" /></span><small>Devis envoyés (60 j)</small><b>{s.t30.envoyes}</b></div>
        <div className="kpi"><span className="ki"><Ic n="check" /></span><small>Taux de signature</small><b>{taux} %</b></div>
        <div className="kpi"><span className="ki"><Ic n="eye" /></span><small>Visites cette semaine</small><b>{s.vis.n}</b>{s.vis.sans_devis > 0 && <em className="dn">{s.vis.sans_devis} sans devis</em>}</div>
        <div className="kpi"><span className="ki"><Ic n="spark" /></span><small>Arrhes encaissées (mois)</small><b>{eur(s.arr)}</b></div>
      </div>
      <div className="dg" style={{ marginTop: 16 }}>
        <section className="card c8">
          <div className="card-h"><div><h3>Chiffre d’affaires signé</h3><p className="big">{eur(total)}<small> sur {s.annee}</small></p></div><small>Rattaché à la date de déménagement, ou au mois prévu</small></div>
          <Line pts={pts} goal={goal} id="ca" />
          <div className="xl">{pts.map((_, i) => <span key={i}>{MOIS[i]}</span>)}</div>
        </section>
        <section className="card c4">
          <div className="card-h"><h3>Déménagements / semaine</h3><small>8 dernières</small></div>
          <p className="big">{s.semaines.reduce((a, b) => a + b.n, 0)}</p>
          <div className="bars">{s.semaines.map((w, i) => <div key={i} className={`bar ${i === s.semaines.length - 1 ? "hi" : ""}`}><i style={{ height: `${(w.n / maxSem) * 100}%` }} /><span>S{w.s}</span></div>)}</div>
        </section>
        <section className="card c4">
          <div className="card-h"><h3>Tunnel commercial</h3><small>30 jours</small></div>
          {tun.map(([l, v], i) => <div key={l} className={`fn f${i}`}><span>{l}</span><i style={{ width: `${Math.max(4, (v / maxT) * 100)}%` }} /><b>{v}</b></div>)}
        </section>
        <section className="card c4">
          <div className="card-h"><h3>Taux de signature</h3><small>60 derniers jours</small></div>
          <Gauge pct={taux} />
        </section>
        <section className="card c4">
          <div className="card-h"><h3>Répartition clients</h3><small>90 jours</small></div>
          <div className="split">{s.repart.map((r, i) => <i key={r.type} className={cls[i % 4]} style={{ flex: r.n }} />)}</div>
          <ul className="legend2">{s.repart.map((r, i) => <li key={r.type}><i className={cls[i % 4]} />{TYPES[r.type]}s<b>{Math.round((r.n / totRep) * 100)} %</b></li>)}</ul>
        </section>
        <section className="card c8">
          <div className="card-h"><h3>Prochains déménagements</h3><Link className="btn ghost sm" href="/commandes">Tout voir</Link></div>
          {s.prochains.length === 0 ? <div className="empty">Aucun déménagement confirmé.</div> : (
            <table className="tbl mini"><tbody>
              {s.prochains.map((r) => (
                <tr key={r.id}><td><Link className="name" href={`/dossiers/${r.id}`}><i className="thumb" style={{ backgroundImage: `url(${photoPour(r.arrivee, r.id)})` }} /><span><b>{nomClient(r)}</b><small>{r.depart} → {r.arrivee}</small></span></Link></td>
                  <td>{m3(r.volume)}</td><td><i className={`st ${STATUTS[r.statut].cls}`}>{STATUTS[r.statut].label}</i></td><td className="num"><b>{eur(r.montant)}</b></td></tr>
              ))}
            </tbody></table>
          )}
        </section>
        <section className="card c4">
          <div className="card-h"><h3>À faire aujourd’hui</h3><small>{s.relances.length}</small></div>
          {s.relances.length === 0 ? <div className="empty">Rien à relancer.</div> : (
            <ul className="todo">{s.relances.map((r) => <li key={r.id}><i /><Link href={`/dossiers/${r.id}`}>Relancer {nomClient(r)} (devis envoyé il y a {r.jours} j)</Link></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
