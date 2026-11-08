import Link from "next/link";
import { q1 } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { dateFr, m3, nomClient } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import { htDe, listeDevis } from "@/crm/devis/donnees";
import { creerDevis, retirerDevis } from "@/crm/devis/actions";
import { nomDevis } from "@/crm/devis/modele";
import NouveauDevis from "@/crm/devis/composants/NouveauDevis";
import { euros } from "@/crm/devis/format";
import s from "@/crm/devis/liste.module.css";

export const dynamic = "force-dynamic";

/*
 * L'onglet Devis (Créagidem, section H) : la liste, d'un dossier ou de tous,
 * avec les colonnes de Créagidem, et la barre Nouveau / Modifier / Copier /
 * Devis (PDF) / Retirer. Ouverte depuis un dossier (?dossier=), elle reste
 * sur ce dossier et propose de créer un devis.
 */

const ETAT: Record<string, [string, string]> = { brouillon: ["Brouillon", "i"], envoye: ["Envoyé", "w"], signe: ["Signé", "g"], refuse: ["Non retenu", "r"] };
const FILTRES: [string, string][] = [["", "Tous"], ["brouillon", "Brouillons"], ["envoye", "Envoyés"], ["signe", "Signés"], ["refuse", "Non retenus"], ["retire", "Retirés"]];

export default async function Devis({ searchParams }: { searchParams: Promise<{ statut?: string; dossier?: string; vue?: string; nouveau?: string; erreur?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const dossier = sp.dossier && /^\d+$/.test(sp.dossier) ? Number(sp.dossier) : null;
  const statut = FILTRES.some(([k]) => k === sp.statut) ? sp.statut ?? "" : "";
  const signatures = sp.vue === "signatures";
  const [rows, d] = await Promise.all([
    listeDevis({ dossier, statut: statut || null, signatures }),
    dossier ? q1(`select d.id, d.ref, d.volume::float8 as volume, c.nom, c.prenom, c.societe, c.type from dossiers d join clients c on c.id=d.client_id where d.id=$1`, [dossier]) : null,
  ]);
  const base = (p: Record<string, string>) => {
    const u = new URLSearchParams({ ...(dossier ? { dossier: String(dossier) } : {}), ...p });
    const t = u.toString();
    return `/devis${t ? `?${t}` : ""}`;
  };
  const nouveau = ["libre", "formules", "copie"].includes(sp.nouveau ?? "") ? (sp.nouveau as "libre" | "formules" | "copie") : null;

  return (
    <div className="view">
      <Bandeau
        surtitre={d ? `Dossier ${d.ref} · ${nomClient(d)}` : `Commercial · ${rows.length} devis`}
        titre={d ? "Devis du dossier" : signatures ? "Toutes signatures" : "Devis"}
        texte={d ? `${rows.length} devis · ${m3(d.volume)}` : signatures ? "Chaque lien de signature envoyé, et où il en est." : "Toutes les propositions, de l'établissement à la signature."}
        secondaire={d ? { label: "Fiche du dossier", href: `/dossiers/${d.id}` } : undefined}
      >
        {d && <Link href={nouveau ? base({}) : base({ nouveau: "libre" })} data-ton={nouveau ? "contour" : "plein"}>{nouveau ? "Fermer" : "Nouveau devis"}</Link>}
      </Bandeau>
      <AvecMenu
        menu={
          <MenuVertical
            titre="Devis"
            groupes={[
              { titre: "État", items: FILTRES.map(([k, l]) => ({ href: base(k ? { statut: k } : {}), label: l, actif: !signatures && statut === k, icone: k === "signe" ? "commande" : k === "" ? "devis" : undefined })) },
              { titre: "Vues", items: [{ href: base({ vue: "signatures" }), label: "Toutes signatures", icone: "badge", actif: signatures }, ...(dossier ? [{ href: "/devis", label: "Tous les dossiers", icone: "grille" as const }] : [])] },
              { titre: "Réglages", items: [{ href: "/devis/parametres", label: "Paramètres du devis", icone: "reglages" }] },
            ]}
          />
        }
      >
        <div className={s.page}>
          {d && nouveau && (
            <section className={s.carte}>
              <header className={s.carteTete}>
                <p>Nouveau</p>
                <h2>Créer un devis pour {nomClient(d)}</h2>
                {d.type === "militaire" && <span className={s.alerte}>Dossier militaire : en règle générale, pas de devis (commande sans devis depuis la fiche).</span>}
              </header>
              <NouveauDevis dossierId={d.id} volume={d.volume} initial={nouveau} erreur={sp.erreur} />
            </section>
          )}

          <section className={s.carte}>
            {rows.length === 0 ? (
              <div className={s.vide}>
                <b>Aucun devis{statut ? " dans cet état" : ""}.</b>
                {d && !nouveau && <Link href={base({ nouveau: "libre" })} className={s.lienPlein}>Créer le premier devis</Link>}
              </div>
            ) : (
              <div className={s.defile}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Devis</th><th>État</th>{!d && <th>Client</th>}<th>Date</th><th>Type</th><th>Com.</th><th>Catégorie</th>
                      <th className={s.num}>HT</th><th className={s.num}>TTC</th><th className={s.num}>Vol.</th>
                      {signatures ? <><th>Envoyé</th><th>Signé</th></> : <><th>Chargement</th><th>Livraison</th></>}
                      <th>Réf. interne</th><th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const [libelle, ton] = r.retire_le ? ["Retiré", "r"] : ETAT[r.statut] ?? [r.statut, "i"];
                      const lien = `/dossiers/${r.did}/devis/${r.id}`;
                      return (
                        <tr key={r.id} data-retire={r.retire_le ? "" : undefined}>
                          <td><Link href={lien} className={s.numero}>{r.numero}</Link></td>
                          <td><i className={s.etat} data-ton={ton}>{libelle}</i></td>
                          {!d && <td><Link href={`/devis?dossier=${r.did}`} className={s.client}>{nomClient(r)}<small>{r.ref}</small></Link></td>}
                          <td>{dateFr(r.date_devis, { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                          <td><span className={s.type}>{r.mode === "forfait" ? "Forfait" : "5 P"}</span></td>
                          <td>{r.com ?? "—"}</td>
                          <td className={s.categorie}>{nomDevis(r)}</td>
                          <td className={s.num}>{euros(htDe(r))}</td>
                          <td className={s.num}><b>{euros(Number(r.montant))}</b></td>
                          <td className={s.num}>{m3(r.volume)}</td>
                          {signatures ? (
                            <><td>{r.envoye_le ? dateFr(r.envoye_le, { day: "2-digit", month: "short" }) : "—"}</td><td>{r.signe_le ? dateFr(r.signe_le, { day: "2-digit", month: "short" }) : "—"}</td></>
                          ) : (
                            <><td>{r.date_chargement ? dateFr(r.date_chargement, { day: "2-digit", month: "2-digit" }) : r.periode ?? "—"}</td><td>{r.date_livraison ? dateFr(r.date_livraison, { day: "2-digit", month: "2-digit" }) : r.arrivee ?? "—"}</td></>
                          )}
                          <td>{r.ref_interne ?? "—"}</td>
                          <td>
                            <div className={s.actions}>
                              <Link href={lien} title="Modifier">Modifier</Link>
                              <form action={creerDevis.bind(null, r.did)}>
                                <input type="hidden" name="genre" value="copie" /><input type="hidden" name="source" value={r.id} />
                                <button title="Copier ce devis dans son dossier">Copier</button>
                              </form>
                              <Link href={`/imprimer/${r.did}?doc=devis&v=${r.id}`} target="_blank" title="Aperçu PDF">PDF</Link>
                              {r.statut !== "signe" && !r.retire_le && (
                                <form action={retirerDevis.bind(null, r.id)}><button title={r.statut === "brouillon" ? "Supprimer le brouillon" : "Retirer de la proposition"} data-danger="">{r.statut === "brouillon" ? "Supprimer" : "Retirer"}</button></form>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </AvecMenu>
    </div>
  );
}
