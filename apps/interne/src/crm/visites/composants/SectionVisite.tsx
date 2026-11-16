import Link from "next/link";
import { espacesDesDossiersCrm } from "@/lib/espace-client/crm";
import { duree, empreinteLisible, jourVisite, m3, momentVisite, plageVisite } from "@/lib/visite/regles";
import { Ic } from "@/crm/lib/icons";
import type { Row } from "@/crm/lib/db";
import { abandonnerVisite, commencerVisite, regenererDocument, retirerProposition } from "../actions";
import { suggestions } from "../creneaux";
import { etatVisites } from "../donnees";
import { rappelPrevu } from "../rappels";
import { texteRappels } from "@/crm/rdv/calendrier";
import PanneauCreneaux from "./PanneauCreneaux";
import s from "./visites.module.css";

/*
 * La visite technique sur la fiche d'un dossier (cahier des charges, §3.2) :
 * où elle en est — créneaux proposés au client, rendez-vous pris (et le
 * rappel de la veille), saisie en cours sur la tablette, comptes-rendus
 * signés — et, à droite, de quoi proposer des créneaux ou en réserver un.
 */

const MESSAGES: Record<string, { ton: "ok" | "info" | "ko"; texte: string }> = {
  propose: { ton: "ok", texte: "Créneaux proposés : le client les voit dans son espace et choisit." },
  reserve: { ton: "ok", texte: "Visite réservée : le rendez-vous est au planning du commercial." },
  retire: { ton: "info", texte: "Proposition retirée : ses créneaux sont de nouveau libres." },
  document: { ton: "ok", texte: "Le PDF du compte-rendu est produit et rangé dans le dossier." },
  abandon: { ton: "info", texte: "Visite abandonnée. L'inventaire saisi reste celui du dossier." },
  annulee: { ton: "info", texte: "Visite annulée : elle a quitté le planning et l'espace du client. Aucun message n'est parti au client." },
};

export default async function SectionVisite({ d, commerciaux, sp }: { d: Row; commerciaux: Row[]; sp: { visite?: string; vm?: string; vc?: string; vd?: string; vt?: string } }) {
  const etat = await etatVisites(d.id);
  const espace = (await espacesDesDossiersCrm([d.id]).catch(() => new Map())).has(d.id);
  const commercialId = Number(sp.vc) || d.commercial_id || commerciaux[0]?.id || null;
  const dureeMin = [60, 90, 120].includes(Number(sp.vd)) ? Number(sp.vd) : 60;
  const libres = commercialId ? await suggestions(commercialId, dureeMin, { sauf: d.id }) : [];

  const maintenant = new Date();
  const aVenir = etat.rdvs.filter((r) => new Date(r.debut).getTime() + r.duree * 60_000 > maintenant.getTime() && !r.termine).reverse();
  const enCours = etat.visites.find((v) => v.statut === "en_cours");
  const signes = etat.visites.filter((v) => v.statut === "signee");
  const p = etat.proposition;
  const flash = sp.visite ? (MESSAGES[sp.visite] ?? (sp.vm ? { ton: "ko" as const, texte: sp.vm } : null)) : null;
  const precision = sp.visite && MESSAGES[sp.visite] && sp.vm ? sp.vm : null;
  const etiquette = enCours ? ["w", "Saisie en cours"] : aVenir.length ? ["i", "Réservée"] : p ? ["w", "En attente du client"] : signes.length ? ["g", "Compte-rendu signé"] : null;

  return (
    <section className={`card ${s.section}`} id="visite" style={{ gridColumn: "span 12" }}>
      <div className="card-h">
        <h3>
          <Ic n="cal" />
          Visite technique {etiquette && <i className={`st ${etiquette[0]}`}>{etiquette[1]}</i>}
        </h3>
        {!enCours && (
          <form action={commencerVisite.bind(null, d.id, aVenir[0]?.id ?? null)}>
            <button className="btn ghost sm">
              <Ic n="pen" />
              {aVenir[0] ? "Commencer la visite sur la tablette" : "Visite sans rendez-vous"}
            </button>
          </form>
        )}
      </div>
      {flash && (
        <p className={`${s.flash} ${s[flash.ton]}`} role="status">
          {flash.texte}
          {precision && <small>{precision}</small>}
        </p>
      )}

      <div className={s.grille}>
        <div className={s.etat}>
          {enCours && (
            <div className={`${s.ligne} ${s.ligneEnCours}`}>
              <i className={s.pastille}>
                <Ic n="pen" />
              </i>
              <div>
                <b>Saisie en cours sur la tablette</b>
                <small>
                  Commencée le {momentVisite(enCours.commenceeLe)}
                  {enCours.commercial ? ` par ${enCours.commercial}` : ""}
                </small>
              </div>
              <div className={s.actions}>
                <Link className="btn primary sm" href={`/tablette/${enCours.id}`}>
                  Reprendre
                </Link>
                <form action={abandonnerVisite.bind(null, enCours.id)}>
                  <button className="btn ghost sm">Abandonner</button>
                </form>
              </div>
            </div>
          )}

          {aVenir.map((r) => {
            const rappel = rappelPrevu({ type: r.type, dossier_id: d.id, debut: r.debut, termine: r.termine }, etat.client, maintenant);
            return (
              <div key={r.id} className={s.ligne}>
                <i className={s.pastille}>
                  <Ic n="cal" />
                </i>
                <div>
                  <b>
                    {jourVisite(r.debut)} · {plageVisite(r.debut, r.duree)}
                  </b>
                  <small>
                    {r.type === "visio" ? "Visio" : "Sur place"} avec {r.commercial}
                  </small>
                  {rappel ? (
                    <span className={`${s.rappel} ${rappel.canaux.length ? "" : s.rappelKo}`}>
                      {rappel.canaux.length
                        ? `Rappels prévus : ${texteRappels(rappel)} (veille : ${jourVisite(`${rappel.veille}T12:00:00Z`)})`
                        : "Pas de rappel possible : ni téléphone ni e-mail au dossier"}
                      {rappel.fictif && " · client fictif, rien n'est envoyé"}
                    </span>
                  ) : null}
                </div>
                <div className={s.actions}>
                  <Link className="btn primary sm" href={`/planning/${r.id}`}>
                    Modifier
                  </Link>
                  <Link className="btn ghost sm" href={`/planning?semaine=${r.debut.slice(0, 10)}`}>
                    Planning
                  </Link>
                </div>
              </div>
            );
          })}

          {p && (
            <div className={`${s.ligne} ${p.autresDemandesLe ? s.ligneAlerte : ""}`}>
              <i className={s.pastille}>
                <Ic n="bell" />
              </i>
              <div>
                <b>
                  {p.creneaux.filter((c) => c.statut === "propose").length} créneaux proposés au client
                </b>
                <small>
                  Le {momentVisite(p.proposeLe)} · {p.type === "visio" ? "visio" : "sur place"}, {duree(p.duree)} avec {p.commercial}
                </small>
                <div className={s.puces}>
                  {p.creneaux
                    .filter((c) => c.statut === "propose")
                    .map((c) => (
                      <span key={c.id} className={new Date(c.debut) < maintenant ? s.pucePassee : undefined}>
                        {jourVisite(c.debut)} · {plageVisite(c.debut, p.duree)}
                      </span>
                    ))}
                </div>
                {p.autresDemandesLe && (
                  <p className={s.demande}>
                    <b>Le client demande d&apos;autres créneaux</b> ({momentVisite(p.autresDemandesLe)})
                    {p.message ? ` : « ${p.message} »` : "."} Proposez-en de nouveaux à droite.
                  </p>
                )}
              </div>
              <div className={s.actions}>
                <form action={retirerProposition.bind(null, d.id)}>
                  <button className="btn ghost sm">Retirer</button>
                </form>
              </div>
            </div>
          )}

          {signes.map((v) => (
            <div key={v.id} className={`${s.ligne} ${s.ligneSignee}`}>
              <i className={s.pastille}>
                <Ic n="check" />
              </i>
              <div>
                <b>Compte-rendu signé par {v.signataire}</b>
                <small>
                  Le {momentVisite(v.signeLe!)} · {m3(v.volume)}
                  {v.commercial ? ` · ${v.commercial}` : ""} · empreinte {empreinteLisible(v.empreinte ?? "", 3)}
                </small>
              </div>
              <div className={s.actions}>
                <a className="btn primary sm" href={`/api/visites/${v.id}/compte-rendu`} target="_blank" rel="noopener">
                  <Ic n="pdf" />
                  Compte-rendu
                </a>
                <Link className="btn ghost sm" href={`/tablette/${v.id}/signature`}>
                  Détail
                </Link>
                {!v.document && (
                  <form action={regenererDocument.bind(null, v.id)}>
                    <button className="btn ghost sm">Produire le PDF</button>
                  </form>
                )}
              </div>
            </div>
          ))}

          {!enCours && !aVenir.length && !p && !signes.length && (
            <p className={s.vide}>
              Pas encore de visite. Proposez des créneaux au client{espace ? " : il choisira dans son espace" : ""}, ou réservez directement celui que vous avez convenu.
            </p>
          )}
        </div>

        <PanneauCreneaux
          key={`${commercialId}-${dureeMin}`}
          dossierId={d.id}
          commerciaux={commerciaux.map((c) => ({ id: c.id, nom: c.nom }))}
          commercialId={commercialId}
          duree={dureeMin}
          type={sp.vt === "visio" ? "visio" : "phys"}
          suggestions={libres}
          espace={espace}
          replie={aVenir.length > 0 || !!enCours || signes.length > 0}
        />
      </div>
    </section>
  );
}
