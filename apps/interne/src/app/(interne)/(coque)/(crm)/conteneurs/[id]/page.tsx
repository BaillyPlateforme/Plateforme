import Link from "next/link";
import { notFound } from "next/navigation";
import Bandeau, { Pilules } from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import { dateFr, eur, ilYa, m3, nomClient } from "@/crm/lib/format";
import type { Row } from "@/crm/lib/db";
import { dispatchDuConteneur } from "@/crm/dispatch/donnees";
import { ficheConteneur, intervenants } from "@/crm/conteneurs/donnees";
import { majCouts, majFicheConteneur, majJalons, supprimerConteneur } from "@/crm/conteneurs/actions";
import { JALONS, STATUTS, estStatut, totaux, type Alerte } from "@/crm/conteneurs/regles";
import ChampsConteneur from "@/crm/conteneurs/ChampsConteneur";
import GrilleJalons from "@/crm/conteneurs/GrilleJalons";
import LignesCouts from "@/crm/conteneurs/LignesCouts";
import ContenuConteneur from "@/crm/conteneurs/ContenuConteneur";
import Commentaires from "@/crm/conteneurs/Commentaires";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import BoutonConfirme from "@/crm/exploitation/ui/BoutonConfirme";
import u from "@/crm/exploitation/ui/ui.module.css";
import s from "@/crm/conteneurs/conteneurs.module.css";

export const dynamic = "force-dynamic";

/*
 * La fiche d'un conteneur. Simplification du 08/11/2026 : les sept onglets du
 * menu vertical (repris de la fenêtre de Créagidem) deviennent quatre vues,
 * en pilules dans la rangée basse du bandeau :
 *   - Fiche et jalons : le contrôle des incohérences (s'il relève quelque
 *     chose), la fiche (identification, transport, trajet) et les jalons
 *     prévus et réels, dont la frise du bandeau redisait l'avancement ;
 *   - Contenu : les clients dans l'ordre de chargement, n° FE, et le dispatch ;
 *   - Coûts et marge ;
 *   - Commentaires et historique, côte à côte.
 * Chaque vue rappelle en tête les alertes qui la concernent. Les anciennes
 * adresses (?onglet=jalons, controle, historique) mènent à la bonne vue.
 */
const VUES = {
  fiche: "Fiche et jalons",
  contenu: "Contenu",
  couts: "Coûts et marge",
  suivi: "Commentaires et historique",
} as const;
type Vue = keyof typeof VUES;
const ANCIENS: Record<string, Vue> = { jalons: "fiche", controle: "fiche", historique: "suivi" };
/** La vue où se corrige une alerte du contrôle. */
const vueDe = (a: Alerte): Vue => (a.onglet === "jalons" ? "fiche" : a.onglet);
const quand = (d: Date | string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

export default async function FicheConteneur({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string; ok?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const c = await ficheConteneur(id);
  if (!c) notFound();
  const demandee = sp.onglet ? (ANCIENS[sp.onglet] ?? sp.onglet) : "fiche";
  const vue: Vue = demandee in VUES ? (demandee as Vue) : "fiche";
  const [annuaire, dispatch] = await Promise.all([intervenants(), vue === "contenu" ? dispatchDuConteneur(id) : Promise.resolve([] as Row[])]);
  const statut = estStatut(c.statut) ? STATUTS[c.statut] : STATUTS.preparation;
  const t = totaux(c.couts as never);
  const dernierFait = JALONS.reduce((k, j, i) => (c.jalons[j.cle]?.reel ? i : k), -1);
  const adresse = (v: Vue, ancre = "") => `/conteneurs/${id}${v === "fiche" ? "" : `?onglet=${v}`}${ancre}`;
  // Sur la fiche, tout le contrôle ; ailleurs, les seules alertes de la vue.
  const alertes = vue === "fiche" ? c.alerteListe : c.alerteListe.filter((a) => vueDe(a) === vue);

  return (
    <div className="view">
      <Bandeau
        surtitre={`Conteneur · ${c.sens === "export" ? "Export" : "Import"} · ${c.taille}`}
        titre={c.numero}
        texte={`${c.lieu_depart ?? "Départ à préciser"} → ${c.destination}${c.navire ? ` · ${c.navire}` : ""}${c.depart_prevu ? ` · départ ${dateFr(c.depart_prevu, { day: "numeric", month: "short" })}` : ""}`}
        etiquettes={[
          statut.libelle,
          dernierFait >= 0 && `Dernier jalon : ${JALONS[dernierFait].libelle.toLowerCase()}`,
          c.plomb ? `Plomb ${c.plomb}` : "Sans plomb",
          `${m3(c.utilise)} / ${m3(c.capacite)}`,
          c.alerteListe.length === 0 && "Cohérent",
        ]}
        secondaire={{ label: "Tous les conteneurs", href: "/conteneurs" }}
        bas={
          <Pilules
            label="Vues du conteneur"
            items={(Object.keys(VUES) as Vue[]).map((v) => ({
              href: adresse(v),
              label: VUES[v],
              actif: vue === v,
              nombre: v === "contenu" ? c.clients : v === "suivi" ? c.commentaires.length + c.historique.length : undefined,
            }))}
          />
        }
      >
        {c.alerteListe.length > 0 && (
          <Link href={adresse("fiche", "#controle")} data-ton="contour">
            {c.alerteListe.length} alerte{c.alerteListe.length > 1 ? "s" : ""}
          </Link>
        )}
        <MenuActions>
          <BoutonConfirme action={supprimerConteneur.bind(null, id)} question={`Supprimer le conteneur ${c.numero}, son contenu, ses jalons, ses coûts et son historique ? Les dossiers ne sont pas touchés.`} enBandeau>
            Supprimer le conteneur
          </BoutonConfirme>
        </MenuActions>
      </Bandeau>

      <div className={u.ecran}>
        {sp.ok === "cree" && <p className={u.message}>Conteneur créé. Ajoutez ses clients dans « Contenu ».</p>}

        {alertes.length > 0 && (
          <section className={u.carte} id="controle">
            <div className={u.carteTete}>
              <div>
                <h3>
                  Contrôle des incohérences <small>{alertes.length}</small>
                </h3>
                <p className={u.sousTitre}>Numéro (norme ISO 6346), capacité, dates, statut et jalons, contenu, coûts. Le contrôle signale ; il ne bloque rien.</p>
              </div>
            </div>
            <ul className={s.controle}>
              {alertes.map((a, i) => (
                <li key={i} data-niveau={a.niveau}>
                  <i>{a.niveau === "erreur" ? "!" : "?"}</i>
                  <span>{a.texte}</span>
                  {(vueDe(a) !== vue || a.onglet === "jalons") && (
                    <Link href={adresse(vueDe(a), a.onglet === "jalons" ? "#jalons" : "")} className={u.lien}>
                      Corriger
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {vue === "fiche" && (
          <section className={u.carte}>
            <Formulaire action={majFicheConteneur.bind(null, id)}>
              <div style={{ display: "grid", gap: 18 }}>
                <ChampsConteneur
                  annuaire={annuaire}
                  v={{
                    numero: c.numero, sens: c.sens, taille: c.taille, capacite: c.capacite, plomb: c.plomb, statut: c.statut, ref_interne: c.ref_interne,
                    voyage: c.voyage, navire: c.navire, compagnie: c.compagnie, transitaire: c.transitaire, groupeur: c.groupeur, degroupeur: c.degroupeur,
                    ref_groupeur: c.ref_groupeur, ref_compagnie: c.ref_compagnie, ref_transitaire: c.ref_transitaire,
                    lieu_depart: c.lieu_depart, depart_prevu: c.depart_prevu, depart_heure: c.depart_heure?.slice(0, 5) ?? null,
                    destination: c.destination, arrivee_prevue: c.arrivee_prevue, arrivee_heure: c.arrivee_heure?.slice(0, 5) ?? null,
                  }}
                />
                <div className={u.pied}>
                  <button type="submit" className={u.bouton}>
                    Enregistrer la fiche
                  </button>
                </div>
              </div>
            </Formulaire>
          </section>
        )}

        {vue === "fiche" && (
          <section className={u.carte} id="jalons">
            <div className={u.carteTete}>
              <div>
                <h3>Jalons</h3>
                <p className={u.sousTitre}>Date prévue et date réelle de chaque étape. Une date réelle ne peut pas être dans le futur.</p>
              </div>
            </div>
            <Formulaire action={majJalons.bind(null, id)}>
              <GrilleJalons jalons={c.jalons} aujourdhui={c.aujourdhui} />
              <div className={u.pied} style={{ marginTop: 16 }}>
                <button type="submit" className={u.bouton}>
                  Enregistrer les jalons
                </button>
              </div>
            </Formulaire>
          </section>
        )}

        {vue === "couts" && (
          <>
            <div className={s.syntheseMarge}>
              <div>
                <small>Revient prévu / réel</small>
                <b>{eur(t.revientPrevu)}</b>
                <span className={u.aide}>réalisé {eur(t.revientReel)}</span>
              </div>
              <div>
                <small>Vente prévue / réelle</small>
                <b>{eur(t.ventePrevue)}</b>
                <span className={u.aide}>réalisée {eur(t.venteReelle)}</span>
              </div>
              <div data-ton={t.margePrevue == null ? undefined : t.margePrevue >= 0 ? "vert" : "rose"}>
                <small>Marge prévue</small>
                <b>{eur(t.margePrevue)}</b>
                <span className={u.aide}>{t.margePrevue != null && t.ventePrevue ? `${Math.round((t.margePrevue / t.ventePrevue) * 100)} % de la vente` : "à compléter"}</span>
              </div>
              <div data-ton={t.margeReelle == null ? undefined : t.margeReelle >= 0 ? "vert" : "rose"}>
                <small>Marge réalisée</small>
                <b>{eur(t.margeReelle)}</b>
                <span className={u.aide}>{t.margeReelle != null && t.margePrevue != null ? `écart ${eur(t.margeReelle - t.margePrevue)} sur le prévu` : "à compléter"}</span>
              </div>
            </div>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <div>
                  <h3>Coûts</h3>
                  <p className={u.sousTitre}>Montants HT, poste par poste. Aucun poste n&apos;est imposé.</p>
                </div>
              </div>
              <Formulaire action={majCouts.bind(null, id)}>
                <LignesCouts couts={c.couts as never} fournisseurs={annuaire.tous} />
                <div className={u.pied} style={{ marginTop: 6 }}>
                  <button type="submit" className={u.bouton}>
                    Enregistrer les coûts
                  </button>
                </div>
              </Formulaire>
            </section>
          </>
        )}

        {vue === "contenu" && (
          <div className={u.colonnes}>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <h3>
                  Clients du conteneur <small>dans l&apos;ordre de chargement</small>
                </h3>
              </div>
              <ContenuConteneur
                id={id}
                capacite={c.capacite}
                lignes={c.lignes.map((l) => ({ id: l.id, dossier_id: l.dossier_id, ref: l.ref, client: nomClient(l), volume: l.volume, ville_livraison: l.ville_livraison, numero_fe: l.numero_fe, perdu: l.statut === "perdu" }))}
                dispo={c.dispo.map((d) => ({ id: d.id, ref: d.ref, client: nomClient(d), volume: d.volume, ville: d.ville }))}
              />
            </section>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <h3>Dispatch</h3>
              </div>
              {dispatch.length === 0 ? (
                <p className={u.aide}>
                  Aucun plan de dispatch ne lui est relié.{" "}
                  <Link href="/conteneurs/dispatch" className={u.lien}>
                    Dispatch international
                  </Link>
                </p>
              ) : (
                dispatch.map((x) => (
                  <Link key={x.id} href={`/conteneurs/dispatch/${x.plan_id}`} className={u.lien} style={{ display: "block", marginBottom: 10 }}>
                    {x.libelle}
                    {x.verrouillee_le ? " · validé" : ""}
                    <small style={{ display: "block", color: "#6f6c80", fontWeight: 500 }}>
                      {x.plan} · {x.nb} client{x.nb > 1 ? "s" : ""} · {m3(x.volume)}
                    </small>
                  </Link>
                ))
              )}
            </section>
          </div>
        )}

        {vue === "suivi" && (
          <div className={u.colonnesEgales}>
            <section className={u.carte}>
              <div className={u.carteTete}>
                <h3>
                  Commentaires <small>{c.commentaires.length}</small>
                </h3>
              </div>
              <Commentaires id={id} commentaires={c.commentaires.map((x) => ({ id: x.id, auteur: x.auteur, texte: x.texte, quand: quand(x.cree_le) }))} />
            </section>

            <section className={u.carte}>
              <div className={u.carteTete}>
                <div>
                  <h3>
                    Historique <small>{c.historique.length}</small>
                  </h3>
                  <p className={u.sousTitre}>Chaque changement de la fiche, des jalons, des coûts et du contenu, avec son auteur.</p>
                </div>
              </div>
              {c.historique.length === 0 ? (
                <p className={u.aide}>Rien pour l&apos;instant.</p>
              ) : (
                <ol className={s.historique}>
                  {c.historique.map((h) => (
                    <li key={h.id}>
                      <span>
                        <b>{h.libelle}</b>
                        <small>
                          {h.nom ?? "—"} · {quand(h.cree_le)} · {ilYa(h.cree_le).toLowerCase()}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
