import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { demanderAutresCreneaux, choisirCreneau } from "@/lib/actions/espace-client-visite";
import { chargerEspace } from "@/lib/espace-client/espace";
import { lienFichier } from "@/lib/espace-client/fichiers";
import { dateLongue, pluriel } from "@/lib/espace-client/format";
import { creneauxAChoisir, dernierCompteRendu, visiteAVenir } from "@/lib/espace-client/progression";
import { duree, empreinteLisible, heureParis, jourVisite, m3, momentVisite, plageVisite } from "@/lib/visite/regles";
import { PageHero } from "../../../_ui/PageHero";
import { Icone } from "../../../_ui/Icone";
import "./visite.css";

export const metadata: Metadata = { title: "Ma visite technique" };

const d = (n: number) => ({ "--d": n }) as CSSProperties;
const PARIS = "Europe/Paris";
const numeroJour = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "numeric" }).format(new Date(iso));
const moisCourt = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, month: "short" }).format(new Date(iso)).replace(".", "");
const jourSemaine = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long" }).format(new Date(iso));

/*
 * « Ma visite technique » (cahier des charges, §3.2) : les créneaux que le
 * conseiller propose — un clic réserve —, la visite réservée, puis le
 * compte-rendu signé sur la tablette du conseiller, en PDF. Tout vient du
 * CRM par la projection (migration 0013) : le client ne lit que ses lignes.
 */
export default async function MaVisite({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ indisponible?: string }> }) {
  const { ref } = await params;
  const sp = await searchParams;
  const e = await chargerEspace(ref);
  const choix = creneauxAChoisir(e);
  const prevue = visiteAVenir(e);
  const cr = dernierCompteRendu(e);
  const demandeLe = e.creneaux.find((c) => c.autres_demandes_le)?.autres_demandes_le ?? null;
  const doc = cr?.document_id ? e.documents.find((x) => x.id === cr.document_id) : null;
  const passees = e.visites.filter((v) => v !== prevue && v !== cr && (v.statut === "realisee" || v.statut === "signee"));

  return (
    <>
      <PageHero
        e={e}
        titre="Ma visite technique"
        sous={
          choix.length
            ? "Votre conseiller vient relever le volume de votre déménagement : choisissez le moment qui vous convient."
            : prevue
              ? "Votre conseiller vient relever le volume de votre déménagement."
              : cr
                ? "Le compte-rendu de votre visite, signé, et son PDF."
                : "Votre conseiller vient relever le volume de votre déménagement."
        }
        active="visite"
      />
      <main className="section">
        <div className="wrap split">
          <div className="vt">
            {sp.indisponible && (
              <p className="flash info apparait" role="alert">
                Ce créneau n&apos;est plus disponible. Choisissez-en un autre parmi ceux qui restent, ou demandez-en de nouveaux.
              </p>
            )}

            {choix.length > 0 && (
              <section className="apparait">
                <p className="kicker">À choisir</p>
                <h2 className="h-section">
                  {pluriel(choix.length, "créneau proposé", "créneaux proposés")}
                  <br />
                  par {choix[0].conseiller.split(" ")[0] || "votre conseiller"}
                </h2>
                <div className="vt-creneaux">
                  {choix.map((c, i) => (
                    <form key={c.id} action={choisirCreneau.bind(null, ref, c.id)} className="vt-creneau apparait" style={d(i)}>
                      <div className="vt-date">
                        <b>{numeroJour(c.debut)}</b>
                        <small>{moisCourt(c.debut)}</small>
                      </div>
                      <div className="vt-infos">
                        <strong>{jourSemaine(c.debut)}</strong>
                        <span>
                          {plageVisite(c.debut, c.duree_min)} · {duree(c.duree_min)}
                        </span>
                        <span className="vt-mode">
                          <Icone nom={c.mode === "visio" ? "eye" : "home"} /> {c.mode === "visio" ? "En visio" : "Chez vous"}
                          {c.conseiller ? ` · ${c.conseiller}` : ""}
                        </span>
                      </div>
                      <button className="btn btn-primary">
                        Choisir <Icone nom="arrow" />
                      </button>
                    </form>
                  ))}
                </div>

                {demandeLe ? (
                  <p className="note mt-m">
                    <Icone nom="check" /> Votre demande d&apos;autres créneaux a été transmise le {dateLongue(demandeLe)}.
                  </p>
                ) : (
                  <details className="card vt-autres mt-m">
                    <summary>
                      Aucun créneau ne vous convient ? <span>Demander d&apos;autres créneaux</span>
                    </summary>
                    <form action={demanderAutresCreneaux.bind(null, ref)}>
                      <label className="field">
                        <span>Vos disponibilités (facultatif)</span>
                        <textarea name="message" className="textarea" rows={3} maxLength={600} placeholder="Par exemple : plutôt en fin de journée, ou le samedi matin." />
                      </label>
                      <button className="btn btn-dark mt-s">
                        Envoyer ma demande <Icone nom="arrow" />
                      </button>
                    </form>
                  </details>
                )}
              </section>
            )}

            {choix.length === 0 && prevue?.debut && (
              <section className="card confirm vt-reservee apparait">
                <span className="vt-ico">
                  <Icone nom="calendar" />
                </span>
                <p className="kicker">{prevue.statut === "en_cours" ? "Visite en cours" : "Visite réservée"}</p>
                <h2>{jourVisite(prevue.debut)}</h2>
                <p>
                  {prevue.mode === "visio"
                    ? `Votre conseiller vous retrouve en visio à ${heureParis(prevue.debut)}.`
                    : `Votre conseiller vient chez vous à ${heureParis(prevue.debut)}. La veille, un rappel vous parvient par SMS et par e-mail.`}
                </p>
                <div className="ticket">
                  <div>
                    <small>Heure</small>
                    <b>{prevue.duree_min ? plageVisite(prevue.debut, prevue.duree_min) : heureParis(prevue.debut)}</b>
                  </div>
                  <div>
                    <small>Durée</small>
                    <b>{prevue.duree_min ? duree(prevue.duree_min) : "—"}</b>
                  </div>
                  <div>
                    <small>Conseiller</small>
                    <b>{prevue.conseiller || `${e.conseiller.prenom} ${e.conseiller.nom}`}</b>
                  </div>
                </div>
                {prevue.mode !== "visio" && (
                  <dl className="kv" style={{ maxWidth: 520, margin: "26px auto 0", textAlign: "left" }}>
                    <dt>Adresse</dt>
                    <dd>{e.dossier.adresse_depart}</dd>
                  </dl>
                )}
                <p className="note mt-m" style={{ justifyContent: "center" }}>
                  Un empêchement ? Prévenez votre conseiller au {e.conseiller.telephone}.
                </p>
              </section>
            )}

            {cr && (
              <section className="card vt-cr apparait" style={d(1)}>
                <div className="vt-cr-tete">
                  <span className="vt-ico ok">
                    <Icone nom="check" />
                  </span>
                  <div>
                    <p className="kicker">Compte-rendu signé</p>
                    <h2>Visite du {cr.debut ? jourVisite(cr.debut) : dateLongue(cr.signe_le!)}</h2>
                    <p className="muted">
                      Signé par {cr.signataire} le {momentVisite(cr.signe_le!, true)}
                    </p>
                  </div>
                </div>
                <div className="ticket">
                  <div>
                    <small>Volume relevé</small>
                    <b>{m3(cr.volume_m3)}</b>
                  </div>
                  <div>
                    <small>Pièces</small>
                    <b>{cr.pieces ?? "—"}</b>
                  </div>
                  <div>
                    <small>Photos</small>
                    <b>{cr.photos ?? 0}</b>
                  </div>
                </div>
                <div className="vt-cr-bas">
                  {doc ? (
                    <a className="btn btn-primary" href={lienFichier("doc", doc.id)} target="_blank" rel="noopener">
                      <Icone nom="download" /> Le compte-rendu en PDF
                    </a>
                  ) : (
                    <span className="badge plain">Le PDF arrive dans vos documents</span>
                  )}
                  {cr.empreinte && (
                    <span className="vt-empreinte" title={cr.empreinte}>
                      Empreinte du contenu signé : {empreinteLisible(cr.empreinte, 4)}
                    </span>
                  )}
                </div>
              </section>
            )}

            {choix.length === 0 && !prevue && !cr && (
              <div className="empty-slot apparait">
                {demandeLe
                  ? `Votre demande d'autres créneaux a été transmise le ${dateLongue(demandeLe)}. Les nouveaux créneaux apparaîtront ici.`
                  : "Les créneaux proposés par votre conseiller apparaîtront ici."}
              </div>
            )}

            {passees.length > 0 && (
              <section className="mt-l apparait">
                <p className="kicker">Visites précédentes</p>
                <ul className="vt-historique">
                  {passees.map((v) => (
                    <li key={v.id}>
                      <Icone nom={v.statut === "signee" ? "check" : "clock"} />
                      <span>
                        {v.debut ? jourVisite(v.debut, true) : "—"} · {v.statut === "signee" ? `compte-rendu signé par ${v.signataire}` : "visite réalisée"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="aside-sticky apparait">
            <div className="card vt-deroule">
              <p className="kicker">Comment se passe la visite</p>
              <ol>
                <li>
                  <span>
                    <b>Vous choisissez un créneau</b> parmi ceux que propose votre conseiller.
                  </span>
                </li>
                <li>
                  <span>
                    <b>La veille</b>, un rappel vous parvient par SMS et par e-mail.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Sur place</b>, votre conseiller relève le volume pièce par pièce, prend quelques photos et note les accès.
                  </span>
                </li>
                <li>
                  <span>
                    <b>En fin de visite</b>, vous signez le compte-rendu sur sa tablette : il est ensuite ici et dans vos documents.
                  </span>
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
