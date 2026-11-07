import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { chargerEspace } from "@/lib/espace-client/espace";
import { lienFichier } from "@/lib/espace-client/fichiers";
import { aujourdhui, dateCourte, euros, eurosAffiches, jourMois } from "@/lib/espace-client/format";
import { STATUT_DEVIS, STATUT_FACTURE, TYPE_FACTURE } from "@/lib/espace-client/libelles";
import { arrhesPayees, devisRetenu, factureArrhes, montantArrhes } from "@/lib/espace-client/progression";
import { accepterDevis, payerArrhes, payerFacture } from "@/lib/actions/espace-client";
import { segmentDe } from "@/lib/espace-client/segments";
import { PageHero } from "../../../_ui/PageHero";
import { TitreChapitre } from "../../../_ui/Cadre";
import { Icone } from "../../../_ui/Icone";

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
  const tries = [...e.devis].sort((a, b) => ORDRE[a.statut] - ORDRE[b.statut] || b.emis_le.localeCompare(a.emis_le));
  const factures = e.factures;
  const total = retenu?.montant_ttc ?? 0;
  const paye = factures.filter((f) => f.statut === "payee" && f.type !== "garde_meubles").reduce((n, f) => n + f.montant_ttc, 0);
  const reste = Math.max(0, Math.round((total - paye) * 100) / 100);
  const solde = factures.find((f) => f.type === "solde" && f.statut !== "payee");
  const jour = aujourdhui();
  const avecAside = !!retenu && vis.factures;
  let n = 0;
  const numero = () => String(++n).padStart(2, "0");

  const blocDevis = vis.devis && (
    <>
      <TitreChapitre n={numero()}>Devis du dossier</TitreChapitre>
      {tries.length === 0 && (
        <div className="empty-slot apparait">
          <Icone nom="devis" />
          <strong>Votre devis est en préparation</strong>
          Votre conseiller vous prévient par e-mail dès qu&apos;il est disponible.
        </div>
      )}
      {tries.map((v, i) => {
        const terne = v.statut === "refuse" || v.statut === "expire";
        const arrhes = montantArrhes(v);
        const payees = factureArrhes(v, factures);
        const expire = v.statut === "envoye" && v.valide_jusqu_au < jour;
        return (
          <article key={v.id} className={`card quote apparait${terne ? " muted" : ""}`} style={d(i)}>
            <div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <span className={`badge ${STATUT_DEVIS[v.statut].ton === "neutre" ? "" : STATUT_DEVIS[v.statut].ton}`}>{expire ? "Expiré" : STATUT_DEVIS[v.statut].label}</span>
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
            <div className="quote-actions">
              <a className="link-arrow" href={lienFichier("devis", v.id)} target="_blank" rel="noopener">
                <Icone nom="download" /> Télécharger le devis
              </a>
              {particulier && v.statut === "envoye" && !expire && v.arrhes_pourcentage > 0 && (
                <form action={payerArrhes.bind(null, ref, v.id)}>
                  <button className="btn btn-primary">Accepter et payer les arrhes · {euros(arrhes)}</button>
                </form>
              )}
              {particulier && v.statut === "envoye" && !expire && v.arrhes_pourcentage === 0 && (
                <form action={accepterDevis.bind(null, ref, v.id)}>
                  <button className="btn btn-primary">Accepter ce devis</button>
                </form>
              )}
              {particulier && v.statut === "accepte" && !arrhesPayees(v, factures) && (
                <form action={payerArrhes.bind(null, ref, v.id)}>
                  <button className="btn btn-primary">Payer les arrhes · {euros(arrhes)}</button>
                </form>
              )}
              {!particulier && v.statut === "envoye" && <span className="note">Votre conseiller valide ce devis avec votre entreprise.</span>}
              {expire && <span className="note">Ce devis a expiré : votre conseiller peut le renouveler.</span>}
            </div>
            {particulier && v.statut === "envoye" && !expire && (
              <p className="note" style={{ gridColumn: "1 / -1" }}>
                En réglant les arrhes, vous acceptez ce devis et les conditions générales de vente ; l&apos;acceptation est horodatée. Le paiement s&apos;effectue sur la page sécurisée de notre prestataire.
              </p>
            )}
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
                        <form action={payerFacture.bind(null, ref, f.id)}>
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
          <form action={payerFacture.bind(null, ref, solde.id)}>
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
