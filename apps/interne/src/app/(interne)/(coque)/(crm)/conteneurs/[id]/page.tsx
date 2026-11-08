import Link from "next/link";
import { notFound } from "next/navigation";
import Bandeau, { Etapes } from "@/ui/Bandeau";
import MenuActions from "@/ui/MenuActions";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import { dateFr, eur, ilYa, m3, nomClient } from "@/crm/lib/format";
import type { Row } from "@/crm/lib/db";
import { dispatchDuConteneur } from "@/crm/dispatch/donnees";
import { ficheConteneur, intervenants } from "@/crm/conteneurs/donnees";
import { majCouts, majFicheConteneur, majJalons, supprimerConteneur } from "@/crm/conteneurs/actions";
import { JALONS, STATUTS, estStatut, totaux } from "@/crm/conteneurs/regles";
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
 * La fiche d'un conteneur, en onglets dans le menu vertical (comme la fenêtre
 * de Créagidem) : la fiche (identification, transport, trajet), les jalons
 * prévus et réels, les coûts et la marge, le contenu (clients dans l'ordre,
 * n° FE), les commentaires, l'historique et le contrôle des
 * incohérences. Dans la bande, l'avancement des jalons.
 */
const ONGLETS = {
  fiche: { libelle: "Fiche", icone: "bateau" },
  jalons: { libelle: "Jalons", icone: "calendrier" },
  couts: { libelle: "Coûts et marge", icone: "euro" },
  contenu: { libelle: "Contenu", icone: "clients" },
  suivi: { libelle: "Commentaires", icone: "courrier" },
  historique: { libelle: "Historique", icone: "horloge" },
  controle: { libelle: "Contrôle", icone: "litige" },
} as const;
type Onglet = keyof typeof ONGLETS;
const quand = (d: Date | string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(d));

export default async function FicheConteneur({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string; ok?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const c = await ficheConteneur(id);
  if (!c) notFound();
  const onglet: Onglet = sp.onglet && sp.onglet in ONGLETS ? (sp.onglet as Onglet) : "fiche";
  const [annuaire, dispatch] = await Promise.all([intervenants(), onglet === "contenu" ? dispatchDuConteneur(id) : Promise.resolve([] as Row[])]);
  const statut = estStatut(c.statut) ? STATUTS[c.statut] : STATUTS.preparation;
  const t = totaux(c.couts as never);
  const dernierFait = JALONS.reduce((k, j, i) => (c.jalons[j.cle]?.reel ? i : k), -1);

  const menu = (
    <MenuVertical
      titre="Conteneur"
      groupes={[
        {
          items: (Object.keys(ONGLETS) as Onglet[]).map((o) => ({
            href: `/conteneurs/${id}${o === "fiche" ? "" : `?onglet=${o}`}`,
            label: ONGLETS[o].libelle,
            icone: ONGLETS[o].icone,
            actif: onglet === o,
            nombre: o === "contenu" ? c.clients : o === "controle" ? c.alerteListe.length : o === "suivi" ? c.commentaires.length : o === "historique" ? c.historique.length : undefined,
          })),
        },
        { titre: "Raccourcis", items: [{ href: "/conteneurs", label: "Tous les conteneurs", icone: "fleche" }, { href: "/conteneurs/dispatch", label: "Dispatch international", icone: "dispatch" }] },
      ]}
    />
  );

  return (
    <div className="view">
      <Bandeau
        surtitre={`Conteneur · ${c.sens === "export" ? "Export" : "Import"} · ${c.taille}`}
        titre={c.numero}
        texte={`${c.lieu_depart ?? "Départ à préciser"} → ${c.destination}${c.navire ? ` · ${c.navire}` : ""}${c.depart_prevu ? ` · départ ${dateFr(c.depart_prevu, { day: "numeric", month: "short" })}` : ""}`}
        etiquettes={[statut.libelle, c.plomb ? `Plomb ${c.plomb}` : "Sans plomb", `${m3(c.utilise)} / ${m3(c.capacite)}`]}
        bas={
          <Etapes
            label="Jalons du conteneur"
            items={JALONS.map((j, i) => ({ label: j.court, etat: c.jalons[j.cle]?.reel ? "fait" : i === dernierFait + 1 ? "encours" : "avenir" }))}
          />
        }
      >
        {c.alerteListe.length > 0 && (
          <Link href={`/conteneurs/${id}?onglet=controle`} data-ton="contour">
            {c.alerteListe.length} alerte{c.alerteListe.length > 1 ? "s" : ""}
          </Link>
        )}
        <MenuActions>
          <BoutonConfirme action={supprimerConteneur.bind(null, id)} question={`Supprimer le conteneur ${c.numero}, son contenu, ses jalons, ses coûts et son historique ? Les dossiers ne sont pas touchés.`} enBandeau>
            Supprimer le conteneur
          </BoutonConfirme>
        </MenuActions>
      </Bandeau>

      <AvecMenu menu={menu}>
        <div className={u.ecran}>
          {sp.ok === "cree" && <p className={u.message}>Conteneur créé. Ajoutez ses clients dans « Contenu ».</p>}

          {onglet === "fiche" && (
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

          {onglet === "jalons" && (
            <section className={u.carte}>
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

          {onglet === "couts" && (
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

          {onglet === "contenu" && (
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

          {onglet === "suivi" && (
            <section className={u.carte}>
              <div className={u.carteTete}>
                <h3>
                  Commentaires <small>{c.commentaires.length}</small>
                </h3>
              </div>
              <Commentaires id={id} commentaires={c.commentaires.map((x) => ({ id: x.id, auteur: x.auteur, texte: x.texte, quand: quand(x.cree_le) }))} />
            </section>
          )}

          {onglet === "historique" && (
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
          )}

          {onglet === "controle" && (
            <section className={u.carte}>
              <div className={u.carteTete}>
                <div>
                  <h3>Contrôle des incohérences</h3>
                  <p className={u.sousTitre}>Numéro (norme ISO 6346), capacité, dates, statut et jalons, contenu, coûts. Le contrôle signale ; il ne bloque rien.</p>
                </div>
              </div>
              {c.alerteListe.length === 0 ? (
                <div className={s.toutBon}>
                  <i className={u.pastille} data-ton="vert">
                    ✓
                  </i>
                  Aucune incohérence relevée sur ce conteneur.
                </div>
              ) : (
                <ul className={s.controle}>
                  {c.alerteListe.map((a, i) => (
                    <li key={i} data-niveau={a.niveau}>
                      <i>{a.niveau === "erreur" ? "!" : "?"}</i>
                      <span>{a.texte}</span>
                      <Link href={`/conteneurs/${id}${a.onglet === "fiche" ? "" : `?onglet=${a.onglet}`}`} className={u.lien}>
                        Corriger
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </AvecMenu>
    </div>
  );
}
