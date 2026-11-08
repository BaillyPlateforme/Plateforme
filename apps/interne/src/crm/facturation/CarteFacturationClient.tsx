"use client";
import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import type { DonneesFacturation, FactureVue, ReglementVue } from "./donnees";
import { ETAT, GENRE, libelleMode, euros2, NATURE, type GenreFacture } from "./calcul";
import FenetreEncaissement from "./FenetreEncaissement";
import FenetreFacture from "./FenetreFacture";
import FenetreAvoir from "./FenetreAvoir";
import FenetrePayeur from "./FenetrePayeur";
import Fenetre, { Champ } from "./Fenetre";
import { reaffecterReglement, supprimerReglement } from "./actions";
import { initiales } from "@/crm/lib/format";
import s from "./facturation.module.css";

type Ouverte =
  | { genre: "encaisser"; nature?: "arrhes" | "reglement" | "remboursement"; factureId?: number | null; montant?: number }
  | { genre: "modifier"; reglement: ReglementVue }
  | { genre: "reaffecter"; reglement: ReglementVue }
  | { genre: "facturer"; type: "solde" | "acompte" | "facture" }
  | { genre: "avoir"; facture: FactureVue }
  | { genre: "payeur"; puis?: Ouverte };

const fr = (j: string | null) => (j ? j.split("-").reverse().join("/") : "—");
const COURT: Record<string, string> = { facture: "FA", solde: "FS", acompte: "AR", avoir: "AV" };
const MODE_COURT: Record<string, string> = { cheque: "CHQ", virement: "VIR", carte: "CB", carte_en_ligne: "WEB", especes: "ESP", prelevement: "PRL", autre: "…" };

export function Etat({ etat }: { etat: string }) {
  const e = ETAT[etat] ?? ETAT.a_regler;
  return <i className={s.etat} data-ton={e.ton}>{e.label}</i>;
}

/** Le corps de la carte « Facturation » (voir CarteFacturation.tsx, qui lit les données). */
export default function CarteFacturationClient({ d }: { d: DonneesFacturation }) {
  const [ouverte, setOuverte] = useState<Ouverte | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [, lancer] = useTransition();

  // « ?encaisser=arrhes » : la fenêtre s'ouvre à l'arrivée (lien depuis la carte du devis).
  useEffect(() => {
    const u = new URL(window.location.href);
    const e = u.searchParams.get("encaisser");
    if (e === "arrhes" || e === "reglement") {
      const libres = d.reglements.filter((r) => r.nature === "arrhes").length === 0 && d.devis ? Math.round(d.devis.montant * 0.3) : undefined;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ouverture unique, à l'arrivée sur la page
      setOuverte({ genre: "encaisser", nature: e, montant: e === "arrhes" ? libres : undefined });
      u.searchParams.delete("encaisser");
      window.history.replaceState(null, "", u.toString());
    }
  }, [d.devis, d.reglements]);

  const ouvertes = d.factures.filter((f) => f.reste > 0 && f.genre !== "avoir" && f.statut !== "annulee")
    .map((f) => ({ id: f.id, numero: f.numero, genre: f.genre, objet: f.objet, reste: f.reste }));
  const libres = d.reglements.filter((r) => r.factureId == null && r.montant > 0)
    .map((r) => ({ id: r.id, libelle: r.libelle, montant: r.montant, recuLe: r.recuLe, nature: r.nature }));
  const payeur = d.payeur ?? d.client;
  const so = d.solde;
  const part = so.du > 0 ? Math.max(0, Math.min(100, Math.round((so.encaisse / so.du) * 100))) : so.encaisse > 0 ? 100 : 0;
  const ton = so.reste > 0.004 ? "du" : so.reste < -0.004 ? "credit" : so.du > 0 ? "solde" : undefined;
  const fermer = () => setOuverte(null);

  function verrou(r: ReglementVue): string | null {
    if (r.enLigne) return "Ce règlement a été fait en ligne par le client : il ne se modifie pas.";
    if (r.factureEtat === "soldee") return `Ce règlement solde la facture ${r.factureNumero} : une facture soldée ne se modifie plus, ses règlements non plus.`;
    return null;
  }
  function modifierFacture(f: FactureVue) {
    setMessage(f.etat === "soldee"
      ? `La facture ${f.numero} est soldée : elle ne se modifie plus. Pour la corriger, annulez-la par un avoir.`
      : f.statut === "annulee" ? `La facture ${f.numero} est annulée : elle reste consultable mais ne se modifie plus.`
      : `Une facture émise ne se modifie pas (numérotation légale). Annulez ${f.numero} par un avoir, puis émettez-en une nouvelle.`);
  }

  return (
    <section className={`card ${s.carte}`} id="facturation" aria-label="Facturation">
      <div className={s.tete}>
        <div className={s.titre}>
          <span className={s.pastilleIcone} aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2.5v19l2.5-1.5 2.5 1.5 2-1.5 2 1.5 2.5-1.5 2.5 1.5v-19z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
          </span>
          <div>
            <h3>Facturation</h3>
            <small>Règlements, factures et avoirs du dossier {d.ref}</small>
          </div>
        </div>
        <div className={s.outils}>
          <button type="button" className={s.payeur} onClick={() => setOuverte({ genre: "payeur" })} title="Client facturé : le client lui-même ou un payeur distinct">
            <i>{initiales(payeur.nom) || "?"}</i>
            <em>Client facturé :</em> <b>{d.payeur ? d.payeur.nom : "lui-même"}</b>
            {d.bonCommande && <em>· BC {d.bonCommande}</em>}
          </button>
          <button type="button" className={s.boutonDoux} onClick={() => setOuverte({ genre: "encaisser" })}>Encaisser</button>
          <span style={{ position: "relative" }}>
            <button type="button" className={s.bouton} aria-expanded={menu} onClick={() => setMenu((x) => !x)}>Facturer ▾</button>
            {menu && (
              <span role="menu" style={{ position: "absolute", right: 0, top: 44, zIndex: 30, display: "grid", gap: 2, minWidth: 230, padding: 6, borderRadius: 16, background: "#fff", boxShadow: "0 24px 50px -20px rgba(23,20,43,.45), 0 0 0 1px #ecebf3" }}>
                {([["acompte", "Facture d'arrhes", "Les arrhes, numérotées"], ["solde", "Facture de solde", "Le déménagement terminé"], ["facture", "Facture libre", "Une prestation en plus"]] as const).map(([k, l, x]) => (
                  <button key={k} type="button" role="menuitem" className={s.resultat} style={{ border: 0 }} onClick={() => { setMenu(false); setOuverte({ genre: "facturer", type: k }); }}>
                    <i>{COURT[k]}</i><span><b>{l}</b><small>{x}</small></span>
                  </button>
                ))}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className={s.corps}>
        <div className={s.colonne}>
          {message && (
            <p className={s.avertissement} role="status" style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{message}</span>
              <button type="button" className={`${s.boutonFantome} ${s.petit}`} onClick={() => setMessage(null)}>Compris</button>
            </p>
          )}
          <div className={s.section}>
            <div className={s.sectionTete}><h4>Factures et avoirs</h4><span>{d.factures.length ? `${d.factures.length} document${d.factures.length > 1 ? "s" : ""}` : ""}</span></div>
            {d.factures.length === 0 ? (
              <div className={s.vide}><b>Aucune facture</b>Facturez les arrhes dès leur réception, le solde à la fin du déménagement.</div>
            ) : d.factures.map((f) => (
              <div key={f.id} className={s.rangee} data-terne={f.statut === "annulee" || undefined}>
                <span className={s.vignette} data-genre={f.genre}>{COURT[f.genre] ?? "FA"}</span>
                <div style={{ minWidth: 0 }}>
                  <div className={s.ligneHaut}>
                    <b>{f.numero}</b>
                    <span className={s.genre}>{GENRE[f.genre as GenreFacture] ?? "Facture"}</span>
                    {f.genre !== "avoir" && <Etat etat={f.etat} />}
                  </div>
                  <div className={s.ligneBas}>
                    {f.objet} · émise le {fr(f.emiseLe)}
                    {f.echeanceLe && f.reste > 0 ? ` · échéance ${fr(f.echeanceLe)}` : ""}
                    {f.avoirNumero ? ` · annulée par ${f.avoirNumero}` : ""}
                    {f.origineNumero ? ` · annule ${f.origineNumero}` : ""}
                    {f.deduiteSur ? ` · déduite sur ${f.deduiteSur}` : ""}
                    {f.payeurNom && f.payeurNom !== d.client.nom ? ` · payeur ${f.payeurNom}` : ""}
                  </div>
                </div>
                <div className={s.montants}>
                  <span className={s.montant}>
                    <b>{f.genre === "avoir" ? "− " : ""}{euros2(f.ttc)}</b>
                    {f.genre !== "avoir" && f.statut !== "annulee" && (f.reste > 0 ? <small className={s.rouge}>reste {euros2(f.reste)}</small> : <small className={s.vert}>réglée</small>)}
                  </span>
                  <span className={s.actionsRangee}>
                    <Link className={s.boutonFantome} href={`/imprimer/${d.dossierId}?doc=facture&f=${f.id}`}>PDF</Link>
                    {f.reste > 0 && <button type="button" className={s.boutonFantome} onClick={() => setOuverte({ genre: "encaisser", factureId: f.id, montant: f.reste })}>Encaisser</button>}
                    {f.genre !== "avoir" && <button type="button" className={s.boutonFantome} onClick={() => modifierFacture(f)}>Modifier</button>}
                    {f.genre !== "avoir" && f.statut !== "annulee" && <button type="button" className={s.boutonFantome} data-danger onClick={() => setOuverte({ genre: "avoir", facture: f })}>Annuler</button>}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className={s.section} style={{ marginTop: 22 }}>
            <div className={s.sectionTete}><h4>Règlements</h4><span>{d.reglements.length ? `${euros2(so.regle)} reçus` : ""}</span></div>
            {d.reglements.length === 0 ? (
              <div className={s.vide}><b>Aucun règlement</b>Encaissez les arrhes : montant libre, chèque, virement, carte, espèces…</div>
            ) : d.reglements.map((r) => {
              const lock = verrou(r);
              const details = [r.numeroCheque && `n° ${r.numeroCheque}`, r.banque, r.titulaire, r.compte && `compte ${r.compte}`, r.datePrevue && `encaissement prévu le ${fr(r.datePrevue)}`].filter(Boolean).join(" · ");
              return (
                <div key={r.id} className={s.rangee}>
                  <span className={s.vignette} data-mode={r.nature === "remboursement" ? "remboursement" : r.mode ?? "aucun"}>{MODE_COURT[r.mode ?? ""] ?? "—"}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className={s.ligneHaut}>
                      <b>{NATURE[r.nature ?? "reglement"] ?? "Règlement"} · {libelleMode(r.mode)}</b>
                      <span className={s.genre}>{fr(r.recuLe)}</span>
                    </div>
                    <div className={s.ligneBas} title={r.commentaire ?? undefined}>
                      {details || r.libelle}
                      {" · "}
                      {r.factureNumero ? <>sur <Link href={`/imprimer/${d.dossierId}?doc=facture&f=${r.factureId}`}>{r.factureNumero}</Link></> : <b style={{ color: "#4b2fe0" }}>au crédit du dossier</b>}
                      {r.commentaire ? ` · ${r.commentaire}` : ""}
                    </div>
                  </div>
                  <div className={s.montants}>
                    <span className={s.montant}><b className={r.montant < 0 ? s.rouge : undefined}>{euros2(r.montant)}</b>{r.saisiPar && <small>saisi par {r.saisiPar}</small>}{r.enLigne && <small>paiement en ligne</small>}</span>
                    <span className={s.actionsRangee}>
                      <button type="button" className={s.boutonFantome} onClick={() => (lock ? setMessage(lock) : setOuverte({ genre: "reaffecter", reglement: r }))}>Réaffecter</button>
                      <button type="button" className={s.boutonFantome} onClick={() => (lock ? setMessage(lock) : setOuverte({ genre: "modifier", reglement: r }))}>Modifier</button>
                      <button type="button" className={s.boutonFantome} data-danger onClick={() => {
                        if (lock) return setMessage(lock);
                        if (!window.confirm(`Supprimer le règlement de ${euros2(r.montant)} du ${fr(r.recuLe)} ?`)) return;
                        lancer(async () => { const x = await supprimerReglement(r.id); if (!x.ok) setMessage(x.erreur); });
                      }}>Supprimer</button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className={s.situation} aria-label="Situation du dossier">
          <h4>Situation du dossier</h4>
          <div className={s.poste}><span>Devis signé</span><b>{d.devis ? euros2(so.engage) : "—"}</b></div>
          <div className={s.poste}><span>Facturé</span><b>{euros2(so.facture)}</b></div>
          {so.aFacturer > 0 && <div className={s.poste}><span>Reste à facturer</span><b>{euros2(so.aFacturer)}</b></div>}
          <div className={s.poste}><span>Encaissé</span><b className={s.vert}>{euros2(so.encaisse)}</b></div>
          {so.nonAffecte > 0 && <div className={s.poste}><span>Dont au crédit, sans facture</span><b>{euros2(so.nonAffecte)}</b></div>}
          <div className={s.reste} data-ton={ton}>
            <small>{so.reste < -0.004 ? "Crédit du client" : "Reste à payer"}</small>
            <strong>{euros2(Math.abs(so.reste))}</strong>
            <div className={s.jauge} aria-hidden><i style={{ width: `${part}%` }} /></div>
          </div>
          <p className={s.note}>
            {so.reste < -0.004
              ? "Le client a payé plus que ce qu'il doit : à réaffecter à une autre facture ou à rembourser."
              : so.soldeFacture ? "Dû : le total des factures émises." : "Dû : le plus grand du devis signé et du facturé."}
            {" "}Encaissé : tous les règlements reçus.
          </p>
        </aside>
      </div>

      {ouverte?.genre === "encaisser" && (
        <FenetreEncaissement dossierId={d.dossierId} factures={ouvertes} comptes={d.comptes} nature={ouverte.nature ?? (ouverte.factureId ? "reglement" : d.factures.length === 0 && so.encaisse === 0 ? "arrhes" : "reglement")} montant={ouverte.montant} factureId={ouverte.factureId ?? null} onFermer={fermer} />
      )}
      {ouverte?.genre === "modifier" && (
        <FenetreEncaissement dossierId={d.dossierId} factures={ouvertes} comptes={d.comptes} reglement={ouverte.reglement} onFermer={fermer} />
      )}
      {ouverte?.genre === "reaffecter" && <FenetreReaffecter reglement={ouverte.reglement} factures={ouvertes} onFermer={fermer} />}
      {ouverte?.genre === "facturer" && (
        <FenetreFacture
          dossierId={d.dossierId} genre={ouverte.type} brouillons={d.brouillons} aujourdhui={d.aujourdhui} chargement={d.chargement} livraison={d.livraison}
          derniereDate={d.derniereDate} taux={d.taux} delai={d.delai} conditions={d.conditions} payeur={payeur} payeurDistinct={!!d.payeur}
          bonCommande={d.bonCommande} reglementsLibres={libres} onFermer={fermer} onChangerPayeur={() => setOuverte({ genre: "payeur", puis: ouverte })}
        />
      )}
      {ouverte?.genre === "avoir" && (
        <FenetreAvoir facture={{ id: ouverte.facture.id, numero: ouverte.facture.numero, genre: ouverte.facture.genre, objet: ouverte.facture.objet, ttc: ouverte.facture.ttc, affecte: ouverte.facture.affecte, statut: ouverte.facture.statut, dossierId: d.dossierId }} onFermer={fermer} />
      )}
      {ouverte?.genre === "payeur" && (
        <FenetrePayeur dossierId={d.dossierId} client={d.client} payeur={d.payeur} bonCommande={d.bonCommande} adresses={d.adresses}
          onFermer={() => setOuverte(ouverte.puis ?? null)} />
      )}
    </section>
  );
}

/** « Réaffecter » un règlement : une autre facture du dossier, le crédit du dossier, ou un autre dossier. */
function FenetreReaffecter({ reglement, factures, onFermer }: { reglement: ReglementVue; factures: { id: number; numero: string; objet: string; reste: number }[]; onFermer: () => void }) {
  const id = useId();
  const [cible, setCible] = useState<string>(reglement.factureId ? "" : factures[0] ? String(factures[0].id) : "");
  const [ref, setRef] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, lancer] = useTransition();
  return (
    <Fenetre surtitre="Réaffecter un règlement" titre={`${euros2(reglement.montant)} · ${libelleMode(reglement.mode)}`} sousTitre={`Reçu le ${fr(reglement.recuLe)} · aujourd'hui ${reglement.factureNumero ? `sur ${reglement.factureNumero}` : "au crédit du dossier"}`} onFermer={onFermer}
      pied={<><span className={s.resume}>Les arrhes d&apos;une commande annulée se reprennent ainsi sur la suivante.</span>
        <span style={{ display: "flex", gap: 8 }}><button type="button" className={s.boutonFantome} onClick={onFermer}>Annuler</button>
          <button type="button" className={s.bouton} disabled={enCours} onClick={() => {
            setErreur(null);
            lancer(async () => {
              const r = await reaffecterReglement(reglement.id, cible === "dossier" ? { dossierRef: ref } : { factureId: cible ? Number(cible) : null });
              if (!r.ok) setErreur(r.erreur); else onFermer();
            });
          }}>{enCours ? "…" : "Réaffecter"}</button></span></>}>
      {erreur && <p className={s.erreur} role="alert">{erreur}</p>}
      <div className={s.grille}>
        <Champ label="Vers" l={12} id={`${id}-cible`}>
          <select id={`${id}-cible`} value={cible} onChange={(e) => setCible(e.target.value)}>
            <option value="">Le crédit du dossier (sans facture)</option>
            {factures.filter((f) => f.id !== reglement.factureId).map((f) => <option key={f.id} value={f.id}>{f.numero} · {f.objet} · reste {euros2(f.reste)}</option>)}
            <option value="dossier">Un autre dossier…</option>
          </select>
        </Champ>
        {cible === "dossier" && (
          <Champ label="Référence du dossier" l={12} id={`${id}-ref`}>
            <input id={`${id}-ref`} type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="BD-2026-0123" />
          </Champ>
        )}
      </div>
    </Fenetre>
  );
}
