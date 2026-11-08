import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { suiviDesReponses } from "@/lib/espace-client/devis-reponses";
import { lireFil } from "@/lib/espace-client/discussion";
import { chargerEspace } from "@/lib/espace-client/espace";
import { lienFichier } from "@/lib/espace-client/fichiers";
import { aujourdhui, dateCourte, dateLongue, euros, eurosAffiches, jourMois, periode } from "@/lib/espace-client/format";
import { STATUT_DEVIS, STATUT_FACTURE, TYPE_FACTURE } from "@/lib/espace-client/libelles";
import { aAccepte, arrhesPayees, devisRetenu, factureArrhes, montantArrhes } from "@/lib/espace-client/progression";
import { payerFacture } from "@/lib/actions/espace-client";
import { segmentDe } from "@/lib/espace-client/segments";
import { apercuEquipe } from "@/lib/espace-client/session";
import { VERSIONS } from "@/lib/espace-client/textes";
import type { Devis } from "@/lib/espace-client/types";
import { PageHero } from "../../../_ui/PageHero";
import { TitreChapitre } from "../../../_ui/Cadre";
import { Icone } from "../../../_ui/Icone";
import { ActionsDevis } from "./ActionsDevis";
import { Comparateur } from "./Comparateur";
import type { DevisAConfirmer, RecapDossier } from "./Confirmation";
import "../../../_ui/devis.css";

export const metadata: Metadata = { title: "Mes devis et factures" };

const ORDRE = { envoye: 0, accepte: 1, refuse: 2, expire: 3 } as const;
const d = (n: number) => ({ "--d": n }) as CSSProperties;

/** Devis, factures et paiements — la page devis.html de la micro démo. */
export default async function MesDevis({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const { client, dossier, vis } = e;
  // Qui règle lui-même ses arrhes en ligne : le particulier et le logement social (cahier des charges, §3.3).
  const particulier = segmentDe(client.type).paieEnLigne;

  if (!vis.devis && !vis.factures) {
    return (
      <>
        <PageHero e={e} titre="Mes devis" sous="Les devis et factures de votre déménagement." active="accueil" />
        <main className="section">
          <div className="wrap">
            <div className="empty-slot apparait">
              <Icone nom="eye" />
              <strong>Rubrique non activée pour votre compte</strong>
              {client.type === "militaire"
                ? "Votre déménagement est pris en charge par bordereau de l'administration : il n'y a pas d'arrhes à régler en ligne. Votre conseiller reste votre interlocuteur pour toute question."
                : `Les devis et factures de ${client.societe ?? "votre entreprise"} sont gérés directement avec votre service achats.`}
              <div className="mt-m">
                <Link className="btn btn-dark" href={`/espace-client/${ref}`}>
                  Retour à mon espace
                </Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  const retenu = devisRetenu(e.devis);
  const tries = [...e.devis].sort((a, b) => ORDRE[a.statut] - ORDRE[b.statut] || b.emis_le.localeCompare(a.emis_le) || a.montant_ttc - b.montant_ttc);
  const factures = e.factures;
  const total = retenu?.montant_ttc ?? 0;
  const paye = factures.filter((f) => f.statut === "payee" && f.type !== "garde_meubles").reduce((n, f) => n + f.montant_ttc, 0);
  const reste = Math.max(0, Math.round((total - paye) * 100) / 100);
  const solde = factures.find((f) => f.type === "solde" && f.statut !== "payee");
  const jour = aujourdhui();
  const avecAside = !!retenu && vis.factures;
  let n = 0;
  const numero = () => String(++n).padStart(2, "0");

  // Ce que le client a déjà répondu sur chaque devis (refus, modification, nouveau devis) : lu dans sa discussion.
  const apercu = await apercuEquipe();
  const fil = vis.devis ? await lireFil(dossier.id, apercu ? "service" : "session").catch(() => []) : [];
  const suivi = suiviDesReponses(
    fil.map((m) => ({ auteur: m.auteur, corps: m.corps, le: new Date(m.created_at).toISOString() })),
    tries,
  );
  const expire = (v: Devis) => v.statut === "expire" || (v.statut === "envoye" && v.valide_jusqu_au < jour);
  // Les formules qui attendent encore une réponse du client : ni expirées, ni refusées par lui.
  const ouverts = tries.filter((v) => v.statut === "envoye" && !expire(v) && !suivi[v.id]?.refus);
  const cgv = aAccepte(e.acceptations, "cgv");
  const recap = (v: Devis): RecapDossier => ({
    reference: dossier.reference,
    depart: { ville: dossier.ville_depart, adresse: dossier.adresse_depart },
    arrivee: { ville: dossier.ville_arrivee, adresse: dossier.adresse_arrivee },
    periode: periode(dossier.periode_debut, dossier.periode_fin),
    volume: dossier.volume_m3,
    logement: dossier.logement,
    autresFormules: ouverts.filter((x) => x.id !== v.id).length,
    cgvAccepteesLe: cgv && cgv.version_texte === VERSIONS.cgv ? dateCourte(cgv.accepted_at) : null,
  });
  const aConfirmer = (v: Devis): DevisAConfirmer => ({
    id: v.id,
    numero: v.numero,
    formule: v.formule,
    montant_ttc: v.montant_ttc,
    arrhes: montantArrhes(v),
    arrhes_pourcentage: v.arrhes_pourcentage,
    valable: dateLongue(v.valide_jusqu_au),
  });
  const quand = (iso: string | null | undefined) => (iso ? jourMois(iso) : null);
  const comparer = vis.devis && ouverts.length >= 2;

  const blocComparaison = comparer && (
    <section className="dv-comparer">
      <TitreChapitre n={numero()}>Comparer les formules</TitreChapitre>
      <p className="chapter-intro apparait">
        {ouverts.length} formules attendent votre réponse : les voici côte à côte. Le détail de chacune suit plus bas.
      </p>
      <Comparateur
        colonnes={[...ouverts].sort((a, b) => a.montant_ttc - b.montant_ttc).map((v) => ({ devis: v, confirmer: aConfirmer(v), recap: recap(v) }))}
        peutSigner={particulier}
      />
    </section>
  );

  const blocDevis = vis.devis && (
    <>
      <div style={comparer ? { marginTop: "clamp(56px,7vw,88px)" } : undefined}>
        <TitreChapitre n={numero()}>Devis du dossier</TitreChapitre>
      </div>
      {tries.length === 0 && (
        <div className="empty-slot apparait">
          <Icone nom="devis" />
          <strong>Votre devis est en préparation</strong>
          Votre conseiller vous prévient par e-mail dès qu&apos;il est disponible.
        </div>
      )}
      {tries.map((v, i) => {
        const perime = expire(v);
        const s = suivi[v.id];
        const refuseParLeClient = v.statut === "envoye" && !perime && !!s?.refus;
        const terne = v.statut === "refuse" || perime || refuseParLeClient;
        const payees = factureArrhes(v, factures);
        const etat = v.statut === "envoye" && !perime ? "en_attente" : perime ? "expire" : v.statut === "accepte" && !arrhesPayees(v, factures) ? "arrhes_dues" : "clos";
        return (
          <article key={v.id} id={`devis-${v.id}`} className={`card quote dv-carte apparait${terne ? " muted" : ""}`} style={d(i)}>
            <div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                {refuseParLeClient ? (
                  <span className="badge">Refusé par vous</span>
                ) : (
                  <span className={`badge ${STATUT_DEVIS[v.statut].ton === "neutre" ? "" : STATUT_DEVIS[v.statut].ton}`}>{perime ? "Expiré" : STATUT_DEVIS[v.statut].label}</span>
                )}
                {payees && particulier && <span className="badge ok">Arrhes payées le {jourMois(payees.payee_le!)}</span>}
              </div>
              <h3>Formule {v.formule}</h3>
              <div className="ref">
                {v.numero} · émis le {dateCourte(v.emis_le)}
                {v.accepte_le ? ` · accepté le ${dateCourte(v.accepte_le)}` : ` · valable jusqu'au ${dateCourte(v.valide_jusqu_au)}`}
              </div>
              {v.inclus.length > 0 && (
                <div className="includes">
                  {v.inclus.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="amount">
              <span className="num">{eurosAffiches(v.montant_ttc)}</span>
              <small>TTC · {dossier.volume_m3} m³</small>
            </div>
            {!terne && v.lignes.length > 0 && (
              <div className="quote-lines">
                {v.lignes.map((l, j) => (
                  <div key={j}>
                    <span>
                      {l.libelle}
                      {l.detail && <span style={{ color: "var(--muted)" }}> · {l.detail}</span>}
                    </span>
                    <span>{l.montant_ht ? `${euros(l.montant_ht)} HT` : "Offert"}</span>
                  </div>
                ))}
                <div>
                  <span>TVA 20 %</span>
                  <span>{euros(v.montant_ttc - v.montant_ht)}</span>
                </div>
                <div className="total">
                  <span>Total TTC</span>
                  <span>{euros(v.montant_ttc)}</span>
                </div>
              </div>
            )}
            <ActionsDevis
              telecharger={lienFichier("devis", v.id)}
              devis={aConfirmer(v)}
              dossier={recap(v)}
              etat={etat}
              peutSigner={particulier}
              conseiller={e.conseiller.prenom}
              expireLe={dateLongue(v.valide_jusqu_au)}
              suivi={{ refus: quand(s?.refus), modification: quand(s?.modification), renouvellement: quand(s?.renouvellement), repondu: !!s?.reponduLe }}
            />
          </article>
        );
      })}
    </>
  );

  const blocFactures = vis.factures && (
    <>
      <div style={{ marginTop: vis.devis ? "clamp(56px,7vw,88px)" : 0, scrollMarginTop: 96 }} id="factures">
        <TitreChapitre n={numero()}>Mes factures</TitreChapitre>
      </div>
      {factures.length ? (
        <div className="card apparait" style={{ padding: "10px 12px 4px" }}>
          <div className="table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Type</th>
                  <th className="r">Montant</th>
                  <th>Statut</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {factures.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="t">{f.libelle}</span>
                      <span className="d">
                        {f.numero} · {f.statut === "payee" ? `réglée le ${dateCourte(f.payee_le!)}` : `échéance ${dateCourte(f.echeance)}`}
                      </span>
                    </td>
                    <td>{TYPE_FACTURE[f.type]}</td>
                    <td className="r num" style={{ fontSize: 22, fontWeight: 600 }}>
                      {eurosAffiches(f.montant_ttc)}
                    </td>
                    <td>
                      <span className={`badge ${STATUT_FACTURE[f.statut].ton}`}>{STATUT_FACTURE[f.statut].label}</span>
                    </td>
                    <td className="r">
                      {f.statut !== "payee" ? (
                        <form action={payerFacture.bind(null, ref, f.id)} data-reserve-client>
                          <button className="btn btn-primary btn-sm">Payer</button>
                        </form>
                      ) : (
                        <a className="btn btn-ghost btn-sm" href={lienFichier("facture", f.id)} target="_blank" rel="noopener">
                          <Icone nom="download" /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-slot apparait">Aucune facture pour le moment.</div>
      )}
      <div style={{ marginTop: "clamp(56px,7vw,88px)" }}>
        <TitreChapitre n={numero()}>Inventaire</TitreChapitre>
      </div>
      <div className="empty-slot apparait">
        <Icone nom="cartons" />
        <strong>Votre inventaire arrive bientôt</strong>
        Cet emplacement accueillera l&apos;inventaire détaillé de vos biens, importé depuis l&apos;outil métier de Bailly.
      </div>
    </>
  );

  const aside = avecAside && (
    <aside className="aside-sticky apparait">
      <div className="sum-card">
        <div className="k">Budget du déménagement</div>
        <span className="num">{eurosAffiches(total)}</span>
        <div className="bar">
          <i style={{ width: `${total ? Math.round((paye / total) * 100) : 0}%` }} />
        </div>
        <div className="rows">
          <div>
            <span>Déjà réglé</span>
            <b>{euros(paye)}</b>
          </div>
          <div>
            <span>Reste à régler</span>
            <b>{euros(reste)}</b>
          </div>
          {solde && (
            <div>
              <span>Échéance du solde</span>
              <b>{dateCourte(solde.echeance)}</b>
            </div>
          )}
        </div>
        {solde ? (
          <form action={payerFacture.bind(null, ref, solde.id)} data-reserve-client>
            <button className="btn btn-primary">Régler le solde · {euros(solde.montant_ttc)}</button>
          </form>
        ) : reste === 0 && total ? (
          <div className="badge ok" style={{ marginTop: 20, position: "relative", zIndex: 1 }}>
            Tout est réglé, merci !
          </div>
        ) : null}
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <ul className="info-list">
          <li>
            <span className="ic"><Icone nom="lock" /></span>
            <span><b>Paiement sécurisé</b>Page hébergée par notre prestataire. Aucune donnée bancaire conservée par Bailly.</span>
          </li>
          <li>
            <span className="ic"><Icone nom="mail" /></span>
            <span><b>Reçu immédiat</b>Chaque paiement génère un reçu par e-mail.</span>
          </li>
        </ul>
      </div>
    </aside>
  );

  return (
    <>
      <PageHero
        e={e}
        titre={vis.devis ? "Mes devis" : "Mes factures"}
        sous={vis.devis ? (particulier ? "Consultez vos devis, réglez vos arrhes en ligne et suivez vos factures." : "Consultez les devis de votre dossier.") : "Suivez et réglez vos factures en ligne."}
        active={vis.devis ? "devis" : "factures"}
      />
      <main className="section">
        <div className="wrap">
          <div className={aside ? "split" : ""}>
            <div>
              {blocComparaison}
              {blocDevis}
              {blocFactures}
            </div>
            {aside}
          </div>
        </div>
      </main>
    </>
  );
}
