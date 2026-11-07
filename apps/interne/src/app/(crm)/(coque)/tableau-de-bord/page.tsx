import Link from "next/link";
import { currentUser } from "@/crm/lib/auth";
import { journee } from "@/crm/lib/accueil";
import { Ic } from "@/crm/lib/icons";
import { Line } from "@/crm/components/charts";
import { dateFr, eur, ilYa, m3, nomClient, photoPour, RDV_TYPES, STATUTS } from "@/crm/lib/format";
import { compterNouvelles, listRequests } from "@/lib/requests";
import { STATUS_META } from "@/app/(equipe)/dashboard/status";
import Bandeau from "@/ui/Bandeau";

export const dynamic = "force-dynamic";

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const heureFr = (d: Date | string) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const jourParis = (d: Date | string) => new Date(d).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
/** « Aujourd'hui », « Demain », ou le jour de la semaine. */
function libelleJour(d: Date | string) {
  const j = jourParis(d), auj = jourParis(new Date()), dem = jourParis(new Date(Date.now() + 86_400_000));
  if (j === auj) return "Aujourd’hui";
  if (j === dem) return "Demain";
  const t = new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/*
 * Le tableau de bord de la journée (deuxième page de l'Accueil, après le
 * Pilotage). En tête, les
 * cinq chiffres qui appellent une action (posés à cheval sur la bande) ; puis
 * l'agenda du jour, ce qui attend, les demandes du site, le chiffre
 * d'affaires, les chantiers de la semaine et l'activité. Les analyses plus
 * longues restent sur le Pilotage (la page d'accueil, /).
 */
export default async function TableauDuJour() {
  const u = await currentUser();
  const [j, nouvelles, demandes] = await Promise.all([journee(), compterNouvelles().catch(() => 0), listRequests().catch(() => [])]);
  const { chiffres: s } = j;

  const mois = new Date().getMonth() + 1;
  const pts = Array.from({ length: mois }, (_, i) => s.serie.find((x) => x.m === i + 1)?.ca ?? 0);
  const moy = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
  const delta = s.ca.prec ? Math.round(((s.ca.cur - s.ca.prec) / s.ca.prec) * 100) : null;
  const auj = jourParis(new Date());
  const visites = j.rendezVous.filter((r) => (r.type === "phys" || r.type === "visio") && jourParis(r.debut) === auj);
  // L'agenda des 7 jours, groupé par jour.
  const jours: { libelle: string; rdv: typeof j.rendezVous }[] = [];
  for (const r of j.rendezVous) {
    const l = libelleJour(r.debut);
    if (jours.at(-1)?.libelle === l) jours.at(-1)!.rdv.push(r);
    else jours.push({ libelle: l, rdv: [r] });
  }
  const tun: [string, number][] = [["Visites", s.tun.visites], ["Devis envoyés", s.tun.devis], ["Signés", s.tun.signes], ["Planifiés", s.tun.planifies]];
  const maxT = Math.max(1, ...tun.map((t) => t[1]));
  const aTraiter = [
    ...(nouvelles > 0 ? [{ cle: "site", texte: `Ouvrir ${nouvelles} demande${nouvelles > 1 ? "s" : ""} du site`, href: "/dashboard?statut=new" }] : []),
    ...j.planifier.map((r) => ({ cle: `p${r.id}`, texte: `Planifier ${nomClient(r)} (devis signé)`, href: `/dossiers/${r.id}` })),
    ...j.relances.map((r) => ({ cle: `r${r.id}`, texte: `Relancer ${nomClient(r)} (devis envoyé il y a ${r.jours} j)`, href: `/dossiers/${r.id}` })),
    ...j.gardeMeuble.map((g) => ({ cle: `g${g.id}`, texte: `Facturer le garde-meuble de ${g.client}`, href: "/garde-meuble" })),
  ];

  return (
    <div className="view accueil">
      <Bandeau
        surtitre={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}
        titre={`Bonjour ${u.nom.split(" ")[0]}`}
        texte="La journée de l’agence, en un coup d’œil."
        action={{ label: "Nouveau dossier", href: "/dossiers/nouveau", icone: "plus" }}
        secondaire={{ label: "Planifier une visite", href: "/planning/nouveau" }}
      />

      <div className="kpis five chevauche">
        <Link href="/dashboard?statut=new" className="kpi lien"><span className="ki"><Ic n="inbox" /></span><small>Demandes du site à ouvrir</small><b>{nouvelles}</b></Link>
        <Link href="/planning" className="kpi lien"><span className="ki"><Ic n="eye" /></span><small>Visites aujourd’hui</small><b>{visites.length}</b></Link>
        <Link href="/commandes" className="kpi lien"><span className="ki"><Ic n="truck" /></span><small>Déménagements · 7 jours</small><b>{j.chantiers.length}</b></Link>
        <Link href="/devis" className="kpi lien"><span className="ki"><Ic n="doc" /></span><small>Devis à relancer</small><b>{j.relances.length}</b></Link>
        <Link href="/" className="kpi lien"><span className="ki"><Ic n="receipt" /></span><small>CA signé · mois en cours</small><b>{eur(s.ca.cur)}</b>{delta != null && <em className={delta >= 0 ? "up" : "dn"}>{delta >= 0 ? "+" : ""}{delta} %</em>}</Link>
      </div>

      <div className="dg" style={{ marginTop: 16 }}>
        <section className="card c8">
          <div className="card-h"><h3>Agenda</h3><Link className="btn ghost sm" href="/planning">Planning</Link></div>
          {jours.length === 0 ? (
            <div className="empty">Aucun rendez-vous dans les 7 prochains jours.</div>
          ) : (
            jours.map((g) => (
              <div key={g.libelle} className="jour">
                <p className="jour-titre">{g.libelle}</p>
                <ul className="agenda">
                  {g.rdv.map((r) => (
                    <li key={r.id} className={r.termine ? "fait" : ""}>
                      <time>{heureFr(r.debut)}</time>
                      <i className={`dot t-${r.type}`} />
                      <span>
                        {r.dossier_id ? <Link href={`/dossiers/${r.dossier_id}`}><b>{r.titre}</b></Link> : <b>{r.titre}</b>}
                        <small>{RDV_TYPES[r.type] ?? r.type}{r.lieu ? ` · ${r.lieu}` : ""}</small>
                      </span>
                      <i className="av sm" title={r.commercial}>{r.initiales}</i>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <section className="card c4">
          <div className="card-h"><h3>À traiter</h3><small>{aTraiter.length}</small></div>
          {aTraiter.length === 0 ? <div className="empty">Rien en attente.</div> : (
            <ul className="todo">{aTraiter.slice(0, 8).map((t) => <li key={t.cle}><i /><Link href={t.href}>{t.texte}</Link></li>)}</ul>
          )}
        </section>

        <section className="card c8">
          <div className="card-h"><h3>Dernières demandes du site</h3><Link className="btn ghost sm" href="/dashboard">Toutes les demandes</Link></div>
          {demandes.length === 0 ? <div className="empty">Aucune demande pour l’instant.</div> : (
            <table className="tbl mini"><tbody>
              {demandes.slice(0, 6).map((r) => (
                <tr key={r.id}>
                  <td><Link className="name" href={`/dashboard/${r.id}`}><span><b>{r.client_nom ?? "Sans nom"}</b><small>{r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}</small></span></Link></td>
                  <td>{r.volume_m3 != null ? m3(r.volume_m3) : "—"}</td>
                  <td><i className="st">{STATUS_META[r.status]?.label ?? r.status}</i></td>
                  <td className="num"><small>{ilYa(r.created_at)}</small></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </section>

        <section className="card c4">
          <div className="card-h"><h3>Tunnel commercial</h3><small>30 jours</small></div>
          {tun.map(([l, v], i) => <div key={l} className={`fn f${i}`}><span>{l}</span><i style={{ width: `${Math.max(4, (v / maxT) * 100)}%` }} /><b>{v}</b></div>)}
        </section>

        <section className="card c8">
          <div className="card-h"><div><h3>Chiffre d’affaires signé</h3><p className="big">{eur(pts.reduce((a, b) => a + b, 0))}<small> sur {s.annee}</small></p></div><Link className="btn ghost sm" href="/">Pilotage</Link></div>
          <Line pts={pts} goal={pts.map(() => moy * 1.1)} id="ca-accueil" />
          <div className="xl">{pts.map((_, i) => <span key={i}>{MOIS[i]}</span>)}</div>
        </section>

        <section className="card c4">
          <div className="card-h"><h3>Activité récente</h3></div>
          {j.activite.length === 0 ? <div className="empty">Rien pour le moment.</div> : (
            <ul className="fil">
              {j.activite.map((a, i) => (
                <li key={i}>
                  <i className="av sm">{a.initiales ?? "·"}</i>
                  <span>{a.dossier_id ? <Link href={`/dossiers/${a.dossier_id}`}><b>{a.nom ? nomClient(a) : "Agence"}</b></Link> : <b>Agence</b>}<small>{a.libelle}</small></span>
                  <em>{ilYa(a.cree_le)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card c12">
          <div className="card-h"><h3>Les 7 prochains jours</h3><Link className="btn ghost sm" href="/exploitation">Planning d’exploitation</Link></div>
          {j.chantiers.length === 0 ? <div className="empty">Aucun déménagement prévu dans les 7 jours.</div> : (
            <table className="tbl mini"><tbody>
              {j.chantiers.map((r) => (
                <tr key={r.id}>
                  <td><Link className="name" href={`/dossiers/${r.id}`}><i className="thumb" style={{ backgroundImage: `url(${photoPour(r.arrivee, r.id)})` }} /><span><b>{nomClient(r)}</b><small>{r.ref}</small></span></Link></td>
                  <td>{dateFr(r.date_chargement, { weekday: "long", day: "numeric", month: "long" })}</td>
                  <td>{r.depart ?? "—"} → {r.arrivee ?? "—"}</td>
                  <td>{m3(r.volume)}</td>
                  <td><i className={`st ${STATUTS[r.statut]?.cls ?? ""}`}>{STATUTS[r.statut]?.label ?? r.statut}</i></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </section>
      </div>
    </div>
  );
}
