import Link from "next/link";
import { q1 } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { dateFr, m3, nomClient } from "@/crm/lib/format";
import Bandeau from "@/ui/Bandeau";
import MenuVertical, { AvecMenu } from "@/ui/MenuVertical";
import type { NomIcone } from "@/ui/icones";
import { compteursDevis, htDe, listeDevis } from "@/crm/devis/donnees";
import { retirerDevis } from "@/crm/devis/actions";
import { BoutonDupliquerDevis } from "@/crm/duplication/composants/DupliquerDevis";
import { nomDevis } from "@/crm/devis/modele";
import NouveauDevis from "@/crm/devis/composants/NouveauDevis";
import { euros } from "@/crm/devis/format";
import { suiviDesDevis } from "@/crm/suivi/donnees";
import { ResumeSuivi } from "@/crm/suivi/Piste";
import { MESURE_INDICATIVE } from "@/crm/suivi/etapes";
import s from "@/crm/devis/liste.module.css";

export const dynamic = "force-dynamic";

/*
 * L'onglet Devis (Créagidem, section H) : la liste, d'un dossier ou de tous,
 * avec les colonnes de Créagidem, et la barre Nouveau / Modifier / Dupliquer /
 * Devis (PDF) / Retirer. Ouverte depuis un dossier (?dossier=), elle reste
 * sur ce dossier et propose de créer un devis.
 *
 * Les états et la vue « Toutes signatures » sont au menu de gauche, avec
 * leurs nombres (choix de David, 08/11/2026 : les vues à gauche, jamais dans
 * la bande) ; les paramètres du devis sont dans Réglages (/devis/parametres).
 */

/** Une icône au trait, pour les actions de ligne. */
const Pic = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const ETAT: Record<string, [string, string]> = { brouillon: ["Brouillon", "i"], envoye: ["Envoyé", "w"], signe: ["Signé", "g"], refuse: ["Non retenu", "r"] };
const FILTRES: [string, string][] = [["", "Tous"], ["brouillon", "Brouillons"], ["envoye", "Envoyés"], ["signe", "Signés"], ["refuse", "Non retenus"], ["retire", "Retirés"]];
const ICONES: Record<string, NomIcone> = { "": "devis", brouillon: "horloge", envoye: "courrier", signe: "commande", refuse: "sortie", retire: "archive" };

export default async function Devis({ searchParams }: { searchParams: Promise<{ statut?: string; dossier?: string; vue?: string; nouveau?: string; erreur?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const dossier = sp.dossier && /^\d+$/.test(sp.dossier) ? Number(sp.dossier) : null;
  const statut = FILTRES.some(([k]) => k === sp.statut) ? sp.statut ?? "" : "";
  const signatures = sp.vue === "signatures";
  const [rows, d, n] = await Promise.all([
    listeDevis({ dossier, statut: statut || null, signatures }),
    dossier ? q1(`select d.id, d.ref, d.volume::float8 as volume, c.nom, c.prenom, c.societe, c.type from dossiers d join clients c on c.id=d.client_id where d.id=$1`, [dossier]) : null,
    compteursDevis(dossier),
  ]);
  const base = (p: Record<string, string>) => {
    const u = new URLSearchParams({ ...(dossier ? { dossier: String(dossier) } : {}), ...p });
    const t = u.toString();
    return `/devis${t ? `?${t}` : ""}`;
  };
  // Client CIMOB/DICOM : jamais de devis (Céline, 17/11/2026 ; devis/cimob.ts) — ni bouton ni formulaire de création.
  const cimob = d?.type === "militaire";
  const nouveau = !cimob && ["libre", "formules", "copie"].includes(sp.nouveau ?? "") ? (sp.nouveau as "libre" | "formules" | "copie") : null;
  // Le suivi de l'e-mail de chaque devis envoyé : « Envoyé le … · ouvert 3× · consulté sur le portail le … » (src/crm/suivi).
  const suivis = await suiviDesDevis(rows.filter((r) => r.statut !== "brouillon").map((r) => ({ id: Number(r.id), dossier_id: Number(r.did) })));

  return (
    <div className="view">
      <Bandeau
        surtitre={d ? `Dossier ${d.ref} · ${nomClient(d)}` : `Dossiers · ${rows.length} devis`}
        titre={d ? "Devis du dossier" : "Devis"}
        texte={d ? `${rows.length} devis · ${m3(d.volume)}` : signatures ? "Toutes signatures · chaque lien de signature envoyé, et où il en est." : "Toutes les propositions, de l'établissement à la signature."}
        secondaire={d ? { label: "Fiche du dossier", href: `/dossiers/${d.id}` } : undefined}
      >
        {d && !cimob && <Link href={nouveau ? base({}) : base({ nouveau: "libre" })} data-ton={nouveau ? "contour" : "plein"}>{nouveau ? "Fermer" : "Nouveau devis"}</Link>}
        {d && <Link href="/devis" data-ton="contour">Tous les devis</Link>}
      </Bandeau>
      <AvecMenu
        menu={
          <MenuVertical
            titre="Devis"
            groupes={[
              {
                titre: "État",
                items: FILTRES.map(([k, l]) => ({ href: base(k ? { statut: k } : {}), label: l, icone: ICONES[k], actif: !signatures && statut === k, nombre: n[(k || "tous") as keyof typeof n] })),
              },
              { items: [{ href: base({ vue: "signatures" }), label: "Toutes signatures", icone: "badge", actif: signatures, nombre: n.signatures }] },
            ]}
          />
        }
      >
        <div className={s.page}>
          {cimob && (
            <section className={s.carte}>
              <header className={s.carteTete}>
                <p>CIMOB/DICOM</p>
                <h2>Pas de devis pour ce dossier</h2>
                <span className={s.alerte}>Le dossier passe en commande sans devis, depuis sa fiche (« Commande sans devis »).</span>
              </header>
            </section>
          )}
          {d && nouveau && (
            <section className={s.carte}>
              <header className={s.carteTete}>
                <p>Nouveau</p>
                <h2>Créer un devis pour {nomClient(d)}</h2>
              </header>
              <NouveauDevis dossierId={d.id} volume={d.volume} initial={nouveau} erreur={sp.erreur} />
            </section>
          )}

          <section className={s.carte}>
            {rows.length === 0 ? (
              <div className={s.vide}>
                <b>Aucun devis{statut ? " dans cet état" : ""}.</b>
                {d && !nouveau && !cimob && <Link href={base({ nouveau: "libre" })} className={s.lienPlein}>Créer le premier devis</Link>}
              </div>
            ) : (
              <div className={s.defile}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Devis</th><th>État</th>{!d && <th>Client</th>}<th>Date</th><th>Com.</th><th>Catégorie</th>
                      <th className={s.num}>HT</th><th className={s.num}>TTC</th><th className={s.num}>Vol.</th>
                      {signatures ? <><th>Envoyé</th><th>Signé</th></> : <th>Dates</th>}
                      <th>Réf.</th><th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const [libelle, ton] = r.retire_le ? ["Retiré", "r"] : ETAT[r.statut] ?? [r.statut, "i"];
                      const lien = `/dossiers/${r.did}/devis/${r.id}`;
                      return (
                        <tr key={r.id} data-retire={r.retire_le ? "" : undefined}>
                          <td><Link href={lien} className={s.numero}>{r.numero}</Link></td>
                          <td>
                            <i className={s.etat} data-ton={ton}>{libelle}</i>
                            {suivis.get(Number(r.id)) && <ResumeSuivi texte={suivis.get(Number(r.id))!.texte} chaud={suivis.get(Number(r.id))!.chaud} titre={MESURE_INDICATIVE} />}
                          </td>
                          {!d && <td><Link href={`/devis?dossier=${r.did}`} className={s.client}>{nomClient(r)}<small>{r.ref}</small></Link></td>}
                          <td>{dateFr(r.date_devis, { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                          <td>{r.com ?? "—"}</td>
                          <td className={s.categorie}>{nomDevis(r)} <span className={s.type}>{r.mode === "forfait" ? "Forfait" : "5 P"}</span></td>
                          <td className={s.num}>{euros(htDe(r))}</td>
                          <td className={s.num}><b>{euros(Number(r.montant))}</b></td>
                          <td className={s.num}>{m3(r.volume)}</td>
                          {signatures ? (
                            <><td>{r.envoye_le ? dateFr(r.envoye_le, { day: "2-digit", month: "short" }) : "—"}</td><td>{r.signe_le ? dateFr(r.signe_le, { day: "2-digit", month: "short" }) : "—"}</td></>
                          ) : (
                            <td className={s.court} title={[r.periode, r.arrivee].filter(Boolean).join(" · ") || undefined}>{r.date_chargement ? dateFr(r.date_chargement, { day: "2-digit", month: "2-digit" }) : r.periode ?? "—"}{" → "}{r.date_livraison ? dateFr(r.date_livraison, { day: "2-digit", month: "2-digit" }) : "—"}</td>
                          )}
                          <td className={s.court} title={r.ref_interne ?? undefined}>{r.ref_interne ?? "—"}</td>
                          <td>
                            <div className={s.actions}>
                              <Link href={lien} title="Modifier" aria-label={`Modifier le devis ${r.numero}`}><Pic d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></Link>
                              {/* Dupliquer : dans son dossier ou dans un autre (une fenêtre, src/crm/duplication). */}
                              <BoutonDupliquerDevis devis={{ id: r.id, numero: r.numero, dossierId: r.did, ref: r.ref, client: nomClient(r), volume: Number(r.volume) || 0 }} />
                              <Link href={`/imprimer/${r.did}?doc=devis&v=${r.id}`} target="_blank" title="Aperçu PDF" aria-label={`PDF du devis ${r.numero}`}><Pic d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14h6M9 17h4" /></Link>
                              {r.statut !== "signe" && !r.retire_le && (
                                <form action={retirerDevis.bind(null, r.id)}><button title={r.statut === "brouillon" ? "Supprimer le brouillon" : "Retirer de la proposition"} aria-label={`${r.statut === "brouillon" ? "Supprimer" : "Retirer"} le devis ${r.numero}`} data-danger=""><Pic d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></button></form>
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
