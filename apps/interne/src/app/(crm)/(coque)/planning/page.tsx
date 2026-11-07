import Link from "next/link";
import { semaine, commerciaux, lundiDe, semaineCourante } from "@/crm/lib/data";
import { Ic } from "@/crm/lib/icons";
import { heure, RDV_TYPES, dateFr } from "@/crm/lib/format";
import { terminerRdv } from "@/crm/actions";
import { EtatSmsRdv } from "@/crm/rdv/EtatSmsRdv";
import { etatsRdv } from "@/crm/rdv/sms";

export const dynamic = "force-dynamic";
const H0 = 8, H1 = 19;
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default async function Planning({ searchParams }: { searchParams: Promise<{ semaine?: string; com?: string }> }) {
  const sp = await searchParams;
  const lun = sp.semaine ? lundiDe(new Date(sp.semaine)) : semaineCourante();
  const com = sp.com ? Number(sp.com) : null;
  const [rdvs, coms] = await Promise.all([semaine(lun, com), commerciaux()]);
  // L'état des SMS de rendez-vous (src/crm/rdv) : une pastille par rendez-vous, rien d'autre ne change ici.
  const etatsSms = await etatsRdv(rdvs.map((r) => r.id));
  const jour = (i: number) => { const d = new Date(lun); d.setDate(d.getDate() + i); return d; };
  const nav = (delta: number) => { const d = new Date(lun); d.setDate(d.getDate() + delta); return `/planning?semaine=${d.toISOString().slice(0, 10)}${com ? `&com=${com}` : ""}`; };
  const today = new Date().toDateString();
  const nb = (t: string[]) => rdvs.filter((r) => t.includes(r.type)).length;
  const sansDevis = rdvs.filter((r) => ["phys", "visio"].includes(r.type) && !r.devis_etabli).length;
  const num = (d: Date) => Math.ceil(((+d - +new Date(d.getFullYear(), 0, 1)) / 864e5 + 1) / 7);
  const lanes = new Map<number, [number, number]>();
  for (let i = 0; i < 7; i++) {
    const evs = rdvs.filter((r) => new Date(r.debut).toDateString() === jour(i).toDateString()).map((r) => ({ id: r.id, s: +new Date(r.debut), e: +new Date(r.debut) + r.duree_min * 60000 }));
    let cluster: typeof evs = [], end = 0;
    const flush = () => { const n = Math.max(1, ...cluster.map((c) => (lanes.get(c.id)![0] + 1))); cluster.forEach((c) => lanes.set(c.id, [lanes.get(c.id)![0], n])); cluster = []; };
    for (const e of evs) {
      if (cluster.length && e.s >= end) { flush(); end = 0; }
      const used = new Set(cluster.filter((c) => c.e > e.s).map((c) => lanes.get(c.id)![0]));
      let l = 0; while (used.has(l)) l++;
      lanes.set(e.id, [l, 1]); cluster.push(e); end = Math.max(end, e.e);
    }
    if (cluster.length) flush();
  }
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  return (
    <div className="view planning">
      <div className="pl-bar">
        <div className="pl-title"><h2>Semaine du {dateFr(lun, { day: "numeric", month: "long" })}</h2><p>Semaine {num(lun)} · {com ? coms.find((c) => c.id === com)?.nom : "toute l’équipe commerciale"}</p></div>
        <div className="pl-tools">
          <div className="seg">
            <Link className={!com ? "on" : ""} href={`/planning?semaine=${lun.toISOString().slice(0, 10)}`}><button className={!com ? "on" : ""}>Tous</button></Link>
            {coms.map((c) => <Link key={c.id} href={`/planning?semaine=${lun.toISOString().slice(0, 10)}&com=${c.id}`}><button className={com === c.id ? "on" : ""}>{c.nom.split(" ")[0]}</button></Link>)}
          </div>
          <div className="nav-arrows"><Link href={nav(-7)} className="btn ghost" style={{ padding: 0, width: 36, justifyContent: "center" }}><Ic n="left" /></Link><Link href={nav(7)} className="btn ghost" style={{ padding: 0, width: 36, justifyContent: "center" }}><Ic n="right" /></Link></div>
          <Link href="/planning/nouveau" className="btn primary"><Ic n="plus" />Nouveau RDV</Link>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><small>Visites physiques</small><b>{nb(["phys"])}</b></div>
        <div className="kpi"><small>Visios</small><b>{nb(["visio"])}</b></div>
        <div className="kpi"><small>Devis à établir</small><b>{sansDevis}</b></div>
        <div className="kpi ok"><small>Devis établis</small><b>{rdvs.filter((r) => r.devis_etabli).length}</b></div>
      </div>
      <div className="legend"><span><i className="dot t-phys" />Visite physique</span><span><i className="dot t-visio" />Visio</span><span><i className="dot t-tache" />Tâche</span><span><i className="dot t-perso" />Perso / règle</span><span><i className="tag tk">Devis établi</i></span></div>
      <div className="cal">
        <div className="cal-head" style={{ gridTemplateColumns: "52px repeat(6,1fr)" }}><span />{JOURS.map((j, i) => <div key={j} className={`dh ${jour(i).toDateString() === today ? "today" : ""}`}><small>{j}</small><b>{jour(i).getDate()}</b></div>)}</div>
        <div className="cal-body" style={{ gridTemplateColumns: "52px repeat(6,1fr)" }}>
          <div className="hours">{hours.map((h) => <span key={h}>{h}h</span>)}</div>
          {JOURS.map((_, i) => (
            <div key={i} className={`col ${jour(i).toDateString() === today ? "today" : ""}`}>
              {rdvs.filter((r) => new Date(r.debut).toDateString() === jour(i).toDateString()).map((r) => {
                const d = new Date(r.debut), s = d.getHours() + d.getMinutes() / 60, l = r.duree_min / 60, [lane, nl] = lanes.get(r.id) ?? [0, 1];
                return (
                  <article key={r.id} className={`ev t-${r.type} ${r.termine ? "done" : ""} ${nl > 1 ? "compact" : ""}`} title={`${r.titre} · ${r.lieu ?? ""} · ${r.commercial}`} style={{ top: `${((s - H0) / (H1 - H0)) * 100}%`, height: `${(l / (H1 - H0)) * 100}%`, left: `calc(${(lane / nl) * 100}% + 3px)`, right: "auto", width: `calc(${100 / nl}% - 6px)` }}>
                    <div className="ev-top"><span className="ev-time">{heure(s)}–{heure(s + l)}<EtatSmsRdv etat={etatsSms.get(r.id)} compact /></span><span className="ev-ty">{RDV_TYPES[r.type]}</span></div>
                    {r.dossier_id ? <Link href={`/dossiers/${r.dossier_id}`} className="ev-n">{r.titre}</Link> : <strong className="ev-n">{r.titre}</strong>}
                    <span className="ev-a">{r.lieu}{!com && ` · ${r.initiales}`}</span>
                    <span className="ev-tags">{r.devis_etabli && <i className="tag tk">Devis établi</i>}{r.dernier && <i className="tag fl">Passer en dernier</i>}</span>
                    {["phys", "visio"].includes(r.type) && !r.termine && (
                      <form action={terminerRdv.bind(null, r.id, false)} style={{ marginTop: "auto" }}><button className="tag" style={{ background: "#fff", color: "#555" }}>Terminé ✓</button></form>
                    )}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
