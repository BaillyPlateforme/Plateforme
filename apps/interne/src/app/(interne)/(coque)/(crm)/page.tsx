import Link from "next/link";
import { currentUser } from "@/crm/lib/auth";
import { journee } from "@/crm/lib/accueil";
import { dateFr, eur, ilYa, m3, nomClient, photoPour, RDV_TYPES, STATUTS } from "@/crm/lib/format";
import { aEncaisser } from "@/crm/facturation/donnees";
import { compterNouvelles, listRequests } from "@/lib/requests";
import { listRappels } from "@/lib/rappels";
import type { RequestStatus } from "@/lib/types";
import { sourceLabel } from "@/app/(interne)/(coque)/dashboard/status";
import { libelleDemande, sousStatut } from "@/crm/parcours/demandes-commun";
import Bandeau from "@/ui/Bandeau";
import { Icone, type NomIcone } from "@/ui/icones";
import s from "@/crm/accueil/accueil.module.css";

export const dynamic = "force-dynamic";

/*
 * L'accueil (simplification du 08/11/2026) : une seule page à la place de
 * trois — le Pilotage (ancienne racine), le tableau de la journée
 * (/tableau-de-bord) et la vue d'ensemble des demandes du site
 * (/dashboard/tableau-de-bord), qui répétaient les mêmes nombres.
 *
 * En haut, une rangée de six nombres, chacun lien vers sa page ; dessous, la
 * journée : l'agenda et ce qui attend un geste, les dernières demandes du site
 * et ce qui reste à encaisser, les chantiers de la semaine et l'activité.
 * Aucun nombre n'y figure deux fois. Les analyses (courbe du chiffre
 * d'affaires, tunnel, taux de signature, répartitions, flux des demandes)
 * sont dans les Statistiques.
 */

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

/** Le statut d'une demande du site, dans les pastilles du CRM. */
const TON_DEMANDE: Record<RequestStatus, string> = { new: "p", analyzing: "w", qualified: "i", quoted: "i", won: "g", lost: "r", archived: "" };

type Nombre = { libelle: string; valeur: string; href: string; icone: NomIcone; ton: string; ecart?: number | null; precision?: string };
type Tache = { cle: string; nature: "rappel" | "planifier" | "relance" | "gm"; titre: string; detail?: string; href: string };

export default async function Accueil() {
  const [u, j, nouvelles, demandes, enc, rappels] = await Promise.all([
    currentUser(),
    journee(),
    compterNouvelles().catch(() => 0),
    listRequests().catch(() => []),
    aEncaisser(5),
    listRappels().catch(() => []),
  ]);

  const ecart = j.ca.prec ? Math.round(((j.ca.cur - j.ca.prec) / j.ca.prec) * 100) : null;
  const nombres: Nombre[] = [
    { libelle: "Demandes du site à ouvrir", valeur: String(nouvelles), href: "/parcours?vue=demandes&statut=new", icone: "questionnaires", ton: s.violet },
    { libelle: "Visites aujourd’hui", valeur: String(j.visitesDuJour), href: "/planning", icone: "oeil", ton: s.ciel },
    { libelle: "Déménagements · 7 jours", valeur: String(j.nombreChantiers), href: "/exploitation", icone: "camion", ton: s.vert },
    { libelle: "Devis à relancer", valeur: String(j.nombreRelances), href: "/devis", icone: "devis", ton: s.ambre },
    { libelle: "CA signé · mois en cours", valeur: eur(j.ca.cur), href: "/statistiques", icone: "euro", ton: s.profond, ecart },
    { libelle: "Reste à encaisser", valeur: eur(enc.total), href: "/factures?etat=ouvertes", icone: "facture", ton: s.rose, precision: `${enc.nombre} dossier${enc.nombre > 1 ? "s" : ""}` },
  ];

  // L'agenda des 7 jours, groupé par jour.
  const jours: { libelle: string; rdv: typeof j.rendezVous }[] = [];
  for (const r of j.rendezVous) {
    const l = libelleJour(r.debut);
    if (jours.at(-1)?.libelle === l) jours.at(-1)!.rdv.push(r);
    else jours.push({ libelle: l, rdv: [r] });
  }

  // Ce qui attend un geste : les clients qui demandent à être rappelés d'abord (venus du site), puis le CRM.
  const ouverts = rappels.filter((r) => r.statut === "a_rappeler" || r.statut === "en_cours");
  const taches: Tache[] = [
    ...ouverts.map((r) => ({
      cle: `rap${r.id}`,
      nature: "rappel" as const,
      titre: `Rappeler ${r.client_nom || r.client_email || "un client"}`,
      detail: [r.client_tel, r.creneau && `souhaite : ${r.creneau}`].filter(Boolean).join(" · ") || "Demande de rappel du site",
      href: `/dashboard/${r.request_id}`,
    })),
    ...j.planifier.map((r) => ({ cle: `p${r.id}`, nature: "planifier" as const, titre: `Planifier ${nomClient(r)}`, detail: "Devis signé, sans date de chargement", href: `/dossiers/${r.id}` })),
    ...j.relances.map((r) => ({ cle: `r${r.id}`, nature: "relance" as const, titre: `Relancer ${nomClient(r)}`, detail: `Devis envoyé il y a ${r.jours} j`, href: `/dossiers/${r.id}` })),
    ...j.gardeMeuble.map((g) => ({ cle: `g${g.id}`, nature: "gm" as const, titre: `Facturer le garde-meuble de ${g.client}`, href: "/garde-meuble" })),
  ];
  const MAX_TACHES = 8;

  return (
    <div className="view accueil">
      <Bandeau
        surtitre={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}
        titre={`Bonjour ${u.nom.split(" ")[0]}`}
        texte="La journée de l’agence, en un coup d’œil."
        action={{ label: "Nouveau dossier", href: "/dossiers/nouveau", icone: "plus" }}
        secondaire={{ label: "Planifier une visite", href: "/planning/nouveau" }}
      />

      <nav className={`chevauche ${s.rangee}`} aria-label="Les nombres du jour">
        {nombres.map((n) => (
          <Link key={n.libelle} href={n.href} className={s.nombre}>
            <span className={`${s.pastille} ${n.ton}`}>
              <Icone nom={n.icone} taille={18} />
            </span>
            <span className={s.libelle}>{n.libelle}</span>
            <span className={s.valeur}>
              {n.valeur}
              {n.ecart != null && <em className={`${s.ecart} ${n.ecart >= 0 ? s.hausse : s.baisse}`}>{n.ecart >= 0 ? "+" : ""}{n.ecart} %</em>}
              {n.precision && <span className={s.precision}>{n.precision}</span>}
            </span>
          </Link>
        ))}
      </nav>

      <div className={s.grille}>
        <section className={`card ${s.carte} ${s.large}`}>
          <div className="card-h">
            <h3>Agenda · 7 jours</h3>
            <Link className={s.lien} href="/planning">Planning</Link>
          </div>
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

        <section className={`card ${s.carte} ${s.etroite}`}>
          <div className="card-h">
            <h3>À traiter{taches.length > 0 && <span className={s.compte}>{taches.length}</span>}</h3>
          </div>
          {taches.length === 0 ? (
            <div className="empty">Rien en attente.</div>
          ) : (
            <>
              <ul className={s.taches}>
                {taches.slice(0, MAX_TACHES).map((t) => (
                  <li key={t.cle}>
                    <Link href={t.href}>
                      <i data-nature={t.nature} />
                      <span>
                        <b>{t.titre}</b>
                        {t.detail && <small>{t.detail}</small>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {taches.length > MAX_TACHES && <p className={s.encore}>Et {taches.length - MAX_TACHES} de plus.</p>}
            </>
          )}
        </section>

        <section className={`card ${s.carte} ${s.large}`}>
          <div className="card-h">
            <h3>Dernières demandes du site</h3>
            <Link className={s.lien} href="/parcours?vue=demandes">Toutes les demandes</Link>
          </div>
          {demandes.length === 0 ? (
            <div className="empty">Aucune demande pour l’instant.</div>
          ) : (
            <ul className={s.demandes}>
              {demandes.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/dashboard/${r.id}`}>
                    <span className={s.initiale}>{(r.client_nom ?? r.client_email ?? "?").charAt(0).toUpperCase()}</span>
                    <span>
                      <b>{r.client_nom ?? r.client_email ?? "Sans nom"}</b>
                      <small>
                        {r.volume_m3 != null ? m3(r.volume_m3) : "Volume à venir"}
                        <span className={s.origine}>{sourceLabel(r.source)}</span>
                      </small>
                    </span>
                    <span className={s.trajet}>{r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}</span>
                    {/* Le statut du Parcours : « Devis envoyé » et « Gagnée » sont des étapes du dossier, pas d'une demande. */}
                    <i className={`st ${TON_DEMANDE[sousStatut(r.status)] ?? ""}`}>{libelleDemande(r.status)}</i>
                    <span className={s.quand}>{ilYa(r.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Le reste à payer réel des dossiers en cours (src/crm/facturation, vue crm.dossiers_soldes) ; le total est dans la rangée du haut. */}
        <section className={`card ${s.carte} ${s.etroite}`}>
          <div className="card-h">
            <h3>Reste à encaisser</h3>
            <Link className={s.lien} href="/factures?etat=ouvertes">Factures</Link>
          </div>
          {enc.premiers.length === 0 ? (
            <div className="empty">Tout est encaissé.</div>
          ) : (
            <ul className={s.sommes}>
              {enc.premiers.map((r) => (
                <li key={r.dossier_id}>
                  <Link href={`/dossiers/${r.dossier_id}#facturation`}>
                    <span>
                      <b>{nomClient(r)}</b>
                      <small>{r.ref}{r.date_chargement ? ` · ${dateFr(r.date_chargement)}` : ""}</small>
                    </span>
                    <strong>{eur(r.reste)}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`card ${s.carte} ${s.large}`}>
          <div className="card-h">
            <h3>Les 7 prochains jours</h3>
            <Link className={s.lien} href="/exploitation">Planning d’exploitation</Link>
          </div>
          {j.chantiers.length === 0 ? (
            <div className="empty">Aucun déménagement prévu dans les 7 jours.</div>
          ) : (
            <ul className={s.chantiers}>
              {j.chantiers.map((r) => (
                <li key={r.id}>
                  <Link href={`/dossiers/${r.id}`}>
                    <i className={s.photo} style={{ backgroundImage: `url(${photoPour(r.arrivee, r.id)})` }} />
                    <span><b>{nomClient(r)}</b><small>{r.ref}</small></span>
                    <span className={s.jour}>{dateFr(r.date_chargement, { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className={s.trajet}>{r.depart ?? "—"} → {r.arrivee ?? "—"}</span>
                    <span className={s.volume}>{m3(r.volume)}</span>
                    <i className={`st ${STATUTS[r.statut]?.cls ?? ""}`}>{STATUTS[r.statut]?.label ?? r.statut}</i>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`card ${s.carte} ${s.etroite}`}>
          <div className="card-h"><h3>Activité récente</h3></div>
          {j.activite.length === 0 ? (
            <div className="empty">Rien pour le moment.</div>
          ) : (
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
      </div>
    </div>
  );
}
