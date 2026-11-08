import Link from "next/link";
import { listDossiers } from "@/crm/lib/data";
import { nomClient } from "@/crm/lib/format";
import { DossierTable } from "@/crm/components/DossierTable";
import { tableauVisites } from "@/crm/visites/donnees";
import { rappelPrevu } from "@/crm/visites/rappels";
import { etatVisite, ETATS_VISITE } from "@/crm/visites/cycle";
import { changerEtatVisite } from "@/crm/planning/actions";
import { duree, empreinteLisible, heureParis, jourParis, jourVisite, m3, momentVisite } from "@/lib/visite/regles";
import Bandeau from "@/ui/Bandeau";
import VuesPlanning from "@/crm/planning/Vues";
import s from "@/crm/visites/composants/visites.module.css";

/*
 * Les visites techniques (cahier des charges, §3.2), vue « Visites
 * techniques » du planning commercial (/planning?vue=visites ; c'était la
 * page /visites jusqu'à la simplification du 08/11/2026) : celles des quinze
 * prochains jours, les créneaux qui attendent la réponse du client, les
 * visites des trente derniers jours, les saisies en cours sur la tablette,
 * les derniers comptes-rendus signés, puis les dossiers à planifier.
 *
 * Chaque visite montre où elle en est de son cycle (audit Créagidem) : à
 * planifier, planifiée, effectuée, devis établi, sans suite.
 */
export default async function VueVisites() {
  const [t, tous] = await Promise.all([tableauVisites(), listDossiers({ statuts: ["prospect", "visite"] })]);
  // « À planifier » : un dossier à visiter qui n'a ni visite à venir ni créneaux proposés.
  const rows = tous.filter((d) => !t.dejaPrevus.has(d.id));
  const pastille = (r: Parameters<typeof etatVisite>[0]) => {
    const e = ETATS_VISITE[etatVisite(r)];
    return <i className={`st ${e.ton}`}>{e.libelle}</i>;
  };
  const maintenant = new Date();

  return (
    <div className="view">
      <Bandeau
        surtitre="Commercial · Planning"
        titre="Visites techniques"
        texte="Proposez des créneaux depuis la fiche d'un dossier, faites la visite sur la tablette, et faites signer le compte-rendu au client."
        action={{ label: "Ouvrir la tablette", href: "/tablette", icone: "fleche" }}
        bas={<VuesPlanning actif="visites" />}
      />
      <div className={s.page}>
        <div className={s.rangee}>
          <section className="card">
            <div className={s.titreBloc}>
              <h3>À venir</h3>
              <span>15 prochains jours</span>
            </div>
            {t.aVenir.length === 0 ? (
              <p className={s.vide}>Aucune visite au planning.</p>
            ) : (
              <div className={s.liste}>
                {t.aVenir.map((r) => {
                  const rappel = rappelPrevu(r as { type: string; dossier_id: number; debut: Date; termine: boolean }, r as { email: string | null; telephone: string | null; notes: string | null }, maintenant);
                  const auj = jourParis(r.debut) === t.jour;
                  return (
                    <Link key={r.id} href={`/dossiers/${r.dossier_id}#visite`} className={`${s.ligne} ${r.visite_statut === "signee" ? s.ligneSignee : ""}`}>
                      <span className={s.heure}>{auj ? "Auj." : new Date(r.debut).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "numeric" })}</span>
                      <div>
                        <b>
                          {nomClient(r)} · {heureParis(r.debut)}
                        </b>
                        <small>
                          {jourVisite(r.debut)} · {r.type === "visio" ? "visio" : "sur place"}, {duree(r.duree_min)} · {r.commercial} · {r.ref}
                        </small>
                        {rappel && rappel.canaux.length > 0 && (
                          <span className={s.rappel}>Rappel la veille : {rappel.canaux.map((c) => (c === "sms" ? "SMS" : "e-mail")).join(" + ")}</span>
                        )}
                      </div>
                      {r.visite_statut === "en_cours" ? <i className="st w">Saisie en cours</i> : pastille(r as Parameters<typeof etatVisite>[0])}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className={s.titreBloc}>
              <h3>En attente du client</h3>
              <span>Créneaux proposés</span>
            </div>
            {t.propositions.length === 0 ? (
              <p className={s.vide}>Aucune proposition en attente.</p>
            ) : (
              <div className={s.liste}>
                {t.propositions.map((p) => {
                  const ouverts = ((p.creneaux ?? []) as { debut: string; statut: string }[]).filter((c) => c.statut === "propose");
                  return (
                    <Link key={p.id} href={`/dossiers/${p.dossier_id}#visite`} className={`${s.ligne} ${p.autres_demandes_le ? s.ligneAlerte : ""}`}>
                      <span className={s.heure}>{ouverts.length}</span>
                      <div>
                        <b>
                          {nomClient(p)} · {p.ref}
                        </b>
                        <small>
                          Proposés le {momentVisite(p.propose_le)} · {p.commercial}
                        </small>
                        <div className={s.puces}>
                          {ouverts.map((c) => (
                            <span key={c.debut}>
                              {jourVisite(c.debut)} · {heureParis(c.debut)}
                            </span>
                          ))}
                        </div>
                        {p.autres_demandes_le && (
                          <p className={s.demande}>
                            <b>Le client demande d&apos;autres créneaux</b>
                            {p.message_client ? ` : « ${p.message_client} »` : "."}
                          </p>
                        )}
                      </div>
                      <i className={`st ${p.autres_demandes_le ? "w" : "i"}`}>{p.autres_demandes_le ? "À reprendre" : "En attente"}</i>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className={s.rangee}>
          <section className="card">
            <div className={s.titreBloc}>
              <h3>Visites passées</h3>
              <span>30 derniers jours</span>
            </div>
            {t.passees.length === 0 ? (
              <p className={s.vide}>Aucune visite ces trente derniers jours.</p>
            ) : (
              <div className={s.liste}>
                {t.passees.map((r) => {
                  const etat = etatVisite(r as Parameters<typeof etatVisite>[0]);
                  return (
                    <div key={r.id} className={s.ligne}>
                      <span className={s.heure}>{new Date(r.debut).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "numeric" })}</span>
                      <div>
                        <b>
                          <Link href={`/planning/${r.id}`}>
                            {nomClient(r)} · {r.ref}
                          </Link>
                        </b>
                        <small>
                          {jourVisite(r.debut)} à {heureParis(r.debut)} · {r.type === "visio" ? "visio" : "sur place"} · {r.commercial}
                        </small>
                      </div>
                      <div className={s.actions}>
                        {pastille(r as Parameters<typeof etatVisite>[0])}
                        {etat === "planifiee" && (
                          <form action={changerEtatVisite.bind(null, r.id, "effectuee")}>
                            <button className="btn ghost sm">Effectuée</button>
                          </form>
                        )}
                        {(etat === "planifiee" || etat === "effectuee") && (
                          <form action={changerEtatVisite.bind(null, r.id, "sans_suite")}>
                            <button className="btn ghost sm">Sans suite</button>
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className={s.titreBloc}>
              <h3>Comptes-rendus signés</h3>
              <span>Les plus récents</span>
            </div>
            {t.comptesRendus.length === 0 ? (
              <p className={s.vide}>Aucun compte-rendu signé pour l&apos;instant.</p>
            ) : (
              <div className={s.liste}>
                {t.comptesRendus.map((v) => (
                  <div key={v.id} className={`${s.ligne} ${s.ligneSignee}`}>
                    <i className={s.pastille}>✓</i>
                    <div>
                      <b>
                        <Link href={`/dossiers/${v.dossier_id}#visite`}>
                          {nomClient(v)} · {v.ref}
                        </Link>
                      </b>
                      <small>
                        Signé par {v.signataire} le {momentVisite(v.signe_le)} · {m3(v.volume)} · {v.pieces} pièce{v.pieces > 1 ? "s" : ""} · {v.photos ?? 0} photo
                        {(v.photos ?? 0) > 1 ? "s" : ""}
                      </small>
                      <small>Empreinte {empreinteLisible(v.empreinte ?? "", 4)}</small>
                    </div>
                    <div className={s.actions}>
                      <a className="btn ghost sm" href={`/api/visites/${v.id}/compte-rendu`} target="_blank" rel="noopener">
                        PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <div className={s.rangee}>
          <section className="card">
            <div className={s.titreBloc}>
              <h3>Saisies en cours</h3>
              <span>Sur la tablette</span>
            </div>
            {t.enCours.length === 0 ? (
              <p className={s.vide}>Aucune saisie en cours.</p>
            ) : (
              <div className={s.liste}>
                {t.enCours.map((v) => (
                  <Link key={v.id} href={`/tablette/${v.id}`} className={`${s.ligne} ${s.ligneEnCours}`}>
                    <i className={s.pastille}>…</i>
                    <div>
                      <b>
                        {nomClient(v)} · {v.ref}
                      </b>
                      <small>
                        Commencée le {momentVisite(v.commencee_le)}
                        {v.commercial ? ` par ${v.commercial}` : ""} · dernier enregistrement {heureParis(v.maj_le)}
                      </small>
                    </div>
                    <i className="st w">Reprendre</i>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className={s.tableau}>
          <div className={s.titreBloc} style={{ margin: "4px 4px 10px" }}>
            <h3>
              À planifier <i className={`st ${ETATS_VISITE.a_planifier.ton}`}>{rows.length}</i>
            </h3>
            <span>Dossiers à visiter sans visite prévue ni créneaux proposés · ouvrez-en un pour proposer des créneaux</span>
          </div>
          <DossierTable rows={rows} />
        </section>
      </div>
    </div>
  );
}
