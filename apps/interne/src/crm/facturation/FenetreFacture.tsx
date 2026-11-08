"use client";
import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import Fenetre, { Champ } from "./Fenetre";
import { emettreFacture } from "./actions";
import { totaux, euros2, arrondi, ajouterJours, htDepuisTtc, GENRE, DATE_MODE, type LigneSaisie } from "./calcul";
import type { Brouillon, LigneProposee, Payeur } from "./donnees";
import s from "./facturation.module.css";

export type ReglementLibre = { id: number; libelle: string; montant: number; recuLe: string | null; nature: string | null };

export interface PropsFenetreFacture {
  dossierId: number;
  genre: "solde" | "acompte" | "facture";
  brouillons: Record<"solde" | "acompte" | "facture", Brouillon>;
  aujourdhui: string;
  chargement: string | null;
  livraison: string | null;
  derniereDate: string | null;
  taux: number;
  delai: number | null;
  conditions: string | null;
  payeur: Payeur;
  payeurDistinct: boolean;
  bonCommande: string | null;
  reglementsLibres: ReglementLibre[];
  onFermer: () => void;
  onChangerPayeur: () => void;
}

const fr = (j: string | null) => (j ? j.split("-").reverse().join("/") : "—");
const nombre = (v: string) => {
  const x = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
type LigneEcran = LigneProposee & { cle: number; saisieTtc?: string };

/**
 * « Facturer » (Créagidem, §P et §Q) : la facture d'arrhes, la facture de
 * solde ou une facture libre. La date de facturation se choisit (du jour, du
 * chargement, de la livraison) ; les lignes se détaillent (quantité, prix
 * unitaire HT, TVA par ligne) et peuvent être des lignes sans montant ; la
 * facture de solde déduit les factures d'arrhes ; les règlements reçus s'y
 * affectent. Une fois émise, la facture ne se modifie plus.
 */
export default function FenetreFacture(p: PropsFenetreFacture) {
  const id = useId();
  const [genre, setGenre] = useState(p.genre);
  const brouillon = p.brouillons[genre];
  const versEcran = (b: Brouillon): LigneEcran[] => b.lignes.map((l, i) => ({ ...l, cle: i + 1 }));
  const [lignes, setLignes] = useState<LigneEcran[]>(() => versEcran(brouillon));
  const [objet, setObjet] = useState(brouillon.objet);
  const [affecter, setAffecter] = useState<Set<number>>(() => new Set(brouillon.affecter));
  const [sansMontant, setSansMontant] = useState(true);
  const [dateMode, setDateMode] = useState<"jour" | "chargement" | "livraison" | "libre">(genre === "solde" && p.livraison && p.livraison <= p.aujourdhui ? "livraison" : "jour");
  const [dateLibre, setDateLibre] = useState(p.aujourdhui);
  const date = dateMode === "jour" ? p.aujourdhui : dateMode === "chargement" ? p.chargement : dateMode === "livraison" ? p.livraison : dateLibre;
  const [echeance, setEcheance] = useState(p.delai != null && date ? ajouterJours(date, p.delai) : "");
  const [conditions, setConditions] = useState(p.conditions ?? "");
  const [bonCommande, setBonCommande] = useState(p.bonCommande ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [emise, setEmise] = useState<{ id: number; numero: string } | null>(null);
  const [enCours, lancer] = useTransition();
  const [suivante, setSuivante] = useState(lignes.length + 1);

  function changerGenre(g: typeof genre) {
    setGenre(g);
    const b = p.brouillons[g];
    setLignes(versEcran(b));
    setObjet(b.objet);
    setAffecter(new Set(b.affecter));
    setSuivante(b.lignes.length + 1);
    if (g !== "solde" && dateMode === "livraison") setDateMode("jour");
  }
  function changerDate(m: typeof dateMode) {
    setDateMode(m);
    const d = m === "jour" ? p.aujourdhui : m === "chargement" ? p.chargement : m === "livraison" ? p.livraison : dateLibre;
    if (p.delai != null && d) setEcheance(ajouterJours(d, p.delai));
  }
  const maj = (cle: number, champ: Partial<LigneEcran>) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...champ } : l)));
  const retenues = lignes.filter((l) => sansMontant || !l.sansMontant);
  const t = useMemo(() => totaux(retenues.map(({ cle: _c, saisieTtc: _s, sansMontant: _m, ...l }) => (void _c, void _s, void _m, l as LigneSaisie))), [retenues]);
  const regle = arrondi(p.reglementsLibres.filter((r) => affecter.has(r.id)).reduce((a, r) => a + r.montant, 0));
  const net = arrondi(t.ttc - regle);
  const avantDerniere = !!(date && p.derniereDate && date < p.derniereDate);
  const nbSansMontant = lignes.filter((l) => l.sansMontant).length;

  function emettre() {
    setErreur(null);
    lancer(async () => {
      const issue = await emettreFacture({
        dossierId: p.dossierId, genre, objet, dateMode, date: dateMode === "libre" ? dateLibre : null, echeance: echeance || null,
        conditions: conditions || null, bonCommande: bonCommande || null,
        lignes: retenues.map((l) => ({ genre: l.genre, libelle: l.libelle, detail: l.detail ?? null, quantite: l.quantite, unite: l.unite ?? null, prixUnitaireHt: l.prixUnitaireHt, tauxTva: l.tauxTva, factureDeduiteId: l.factureDeduiteId ?? null })),
        affecter: [...affecter], devisId: brouillon.devisId,
      });
      if (!issue.ok) setErreur(issue.erreur);
      else setEmise({ id: issue.id!, numero: issue.numero! });
    });
  }

  if (emise) {
    return (
      <Fenetre surtitre="Facture émise" titre={`${GENRE[genre]} ${emise.numero}`} sousTitre={`${euros2(t.ttc)} TTC · datée du ${fr(date)}`} onFermer={p.onFermer}
        pied={<><span className={s.resume}>Elle apparaît dans l&apos;espace client du dossier, s&apos;il en a un.</span>
          <span style={{ display: "flex", gap: 8 }}><button type="button" className={s.boutonFantome} onClick={p.onFermer}>Fermer</button>
            <Link className={s.bouton} href={`/imprimer/${p.dossierId}?doc=facture&f=${emise.id}`}>Voir et imprimer la facture</Link></span></>}>
        <p className={s.info}>La facture est numérotée et figée : pour la corriger, il faudra l&apos;annuler par un avoir puis en émettre une nouvelle.</p>
      </Fenetre>
    );
  }

  return (
    <Fenetre
      large
      surtitre={`Facturation · dossier`}
      titre="Émettre une facture"
      sousTitre="Une facture émise est numérotée et ne se modifie plus : vérifiez-la avant de l'émettre."
      onFermer={p.onFermer}
      pied={
        <>
          <span className={s.resume}>
            {GENRE[genre]} · <b>{euros2(t.ttc)} TTC</b>
            {regle > 0 && <> · déjà réglé {euros2(regle)} · net à payer <b>{euros2(net)}</b></>}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.boutonFantome} onClick={p.onFermer}>Annuler</button>
            <button type="button" className={s.bouton} onClick={emettre} disabled={enCours || !date}>
              {enCours ? "Émission…" : "Émettre la facture"}
            </button>
          </span>
        </>
      }
    >
      {erreur && <p className={s.erreur} role="alert">{erreur}</p>}
      <div className={s.disposition}>
        <div>
          <div className={s.bloc}>
            <p className={s.blocTitre}><i>1</i>Quelle facture</p>
            <div className={s.choix} data-grand role="radiogroup" aria-label="Genre de facture">
              {([["acompte", "Facture d'arrhes", "Les arrhes, numérotées"], ["solde", "Facture de solde", "Le déménagement terminé"], ["facture", "Facture libre", "Une prestation en plus"]] as const).map(([k, l, d]) => (
                <label key={k}>
                  <input type="radio" name={`${id}-genre`} checked={genre === k} onChange={() => changerGenre(k)} />
                  <b>{l}</b>
                  <small>{d}</small>
                </label>
              ))}
            </div>
            <div className={s.grille} style={{ marginTop: 14 }}>
              <Champ label="Objet" l={12} id={`${id}-objet`}>
                <input id={`${id}-objet`} type="text" value={objet} onChange={(e) => setObjet(e.target.value)} />
              </Champ>
            </div>
          </div>

          <div className={s.bloc}>
            <p className={s.blocTitre}><i>2</i>Date de facturation</p>
            <div className={s.choix} role="radiogroup" aria-label="Date de facturation">
              {(["jour", "chargement", "livraison", "libre"] as const).map((m) => {
                const d = m === "jour" ? p.aujourdhui : m === "chargement" ? p.chargement : m === "livraison" ? p.livraison : null;
                const indispo = (m === "chargement" || m === "livraison") && (!d || d > p.aujourdhui);
                return (
                  <label key={m} title={indispo ? (d ? "Date à venir : une facture ne se date pas dans le futur" : "Pas de date au planning") : undefined}>
                    <input type="radio" name={`${id}-date`} checked={dateMode === m} disabled={indispo} onChange={() => changerDate(m)} />
                    {DATE_MODE[m]}
                    {m !== "libre" && <small>{d ? fr(d) : "non posée"}</small>}
                  </label>
                );
              })}
            </div>
            <div className={s.grille} style={{ marginTop: 14 }}>
              {dateMode === "libre" && (
                <Champ label="Date de la facture" l={4} id={`${id}-dlibre`}>
                  <input id={`${id}-dlibre`} type="date" value={dateLibre} max={p.aujourdhui} onChange={(e) => { setDateLibre(e.target.value); if (p.delai != null && e.target.value) setEcheance(ajouterJours(e.target.value, p.delai)); }} />
                </Champ>
              )}
              <Champ label="Échéance" aide={p.delai != null ? `${p.delai} jours (Paramètres)` : "délai à régler dans Paramètres"} l={4} id={`${id}-echeance`}>
                <input id={`${id}-echeance`} type="date" value={echeance} min={date ?? undefined} onChange={(e) => setEcheance(e.target.value)} />
              </Champ>
              <Champ label="Bon de commande du compte" aide="facultatif" l={dateMode === "libre" ? 4 : 8} id={`${id}-bc`}>
                <input id={`${id}-bc`} type="text" value={bonCommande} onChange={(e) => setBonCommande(e.target.value)} placeholder="BC-2026-…" />
              </Champ>
              <Champ label="Conditions de règlement" aide={p.conditions ? "reprises des Paramètres" : "vides : à renseigner dans Paramètres"} l={12} id={`${id}-cond`}>
                <textarea id={`${id}-cond`} value={conditions} onChange={(e) => setConditions(e.target.value)} style={{ minHeight: 56 }} />
              </Champ>
            </div>
            {avantDerniere && <p className={s.avertissement}>Cette date précède celle de la dernière facture émise ({fr(p.derniereDate)}) : la numérotation doit rester chronologique, l&apos;émission sera refusée.</p>}
          </div>

          <div className={s.bloc}>
            <p className={s.blocTitre} style={{ justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><i>3</i>Lignes de la facture</span>
              {nbSansMontant > 0 && (
                <label className={s.interrupteur} style={{ textTransform: "none", letterSpacing: 0 }}>
                  <input type="checkbox" checked={sansMontant} onChange={(e) => setSansMontant(e.target.checked)} />
                  Inclure les lignes sans montant ({nbSansMontant})
                </label>
              )}
            </p>
            <table className={s.lignes}>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className={`${s.num} ${s.etroit}`}>Qté</th>
                  <th className={`${s.num} ${s.moyen}`}>PU HT</th>
                  <th className={`${s.num} ${s.moyen}`}>PU TTC</th>
                  <th className={`${s.num} ${s.etroit}`}>TVA %</th>
                  <th className={s.num}>Total HT</th>
                  <th className={s.num}>Total TTC</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {retenues.map((l) => {
                  const c = t.lignes[retenues.indexOf(l)];
                  const texte = l.genre === "texte";
                  const deduction = l.genre === "deduction";
                  return (
                    <tr key={l.cle} data-genre={l.genre}>
                      <td>
                        <input type="text" aria-label="Désignation" value={l.libelle} onChange={(e) => maj(l.cle, { libelle: e.target.value })} placeholder={texte ? "Texte sans montant" : "Désignation"} />
                        {l.detail && <small style={{ display: "block", marginTop: 3, color: "#7b7893", fontSize: 11.5 }}>{l.detail}</small>}
                      </td>
                      {texte ? (
                        <td colSpan={6} style={{ color: "#a7a3b8", fontSize: 12 }}>Ligne sans montant</td>
                      ) : (
                        <>
                          <td className={s.num}><input type="text" inputMode="decimal" aria-label="Quantité" value={String(l.quantite).replace(".", ",")} disabled={deduction} onChange={(e) => maj(l.cle, { quantite: nombre(e.target.value) })} /></td>
                          <td className={s.num}><input type="text" inputMode="decimal" aria-label="Prix unitaire HT" value={String(l.prixUnitaireHt).replace(".", ",")} disabled={deduction} onChange={(e) => maj(l.cle, { prixUnitaireHt: nombre(e.target.value), saisieTtc: undefined })} /></td>
                          <td className={s.num}><input type="text" inputMode="decimal" aria-label="Prix unitaire TTC" disabled={deduction}
                            value={l.saisieTtc ?? String(arrondi(l.prixUnitaireHt * (1 + l.tauxTva / 100))).replace(".", ",")}
                            onChange={(e) => maj(l.cle, { saisieTtc: e.target.value, prixUnitaireHt: htDepuisTtc(nombre(e.target.value), l.tauxTva) })} /></td>
                          <td className={s.num}><input type="text" inputMode="decimal" aria-label="Taux de TVA" value={String(l.tauxTva).replace(".", ",")} disabled={deduction} onChange={(e) => maj(l.cle, { tauxTva: nombre(e.target.value), saisieTtc: undefined })} /></td>
                          <td className={s.num}>{euros2(c?.ht ?? 0)}</td>
                          <td className={s.num}><b>{euros2(c?.ttc ?? 0)}</b></td>
                        </>
                      )}
                      <td><button type="button" className={s.retirer} aria-label="Retirer la ligne" onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className={s.ajouts}>
              <button type="button" className={`${s.boutonDoux} ${s.petit}`} onClick={() => { setLignes((ls) => [...ls, { cle: suivante, genre: "prestation", libelle: "", quantite: 1, prixUnitaireHt: 0, tauxTva: p.taux }]); setSuivante((x) => x + 1); }}>+ Ligne chiffrée</button>
              <button type="button" className={`${s.boutonFantome} ${s.petit}`} onClick={() => { setLignes((ls) => [...ls, { cle: suivante, genre: "texte", libelle: "", quantite: 0, prixUnitaireHt: 0, tauxTva: p.taux }]); setSuivante((x) => x + 1); }}>+ Ligne sans montant</button>
            </div>
          </div>

          {p.reglementsLibres.length > 0 && genre !== "facture" && (
            <div className={s.bloc}>
              <p className={s.blocTitre}><i>4</i>Règlements déjà reçus à affecter</p>
              <div className={s.coches}>
                {p.reglementsLibres.map((r) => (
                  <label key={r.id} className={s.coche}>
                    <input type="checkbox" checked={affecter.has(r.id)} onChange={(e) => setAffecter((x) => { const n = new Set(x); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                    <span>{r.libelle}<small style={{ display: "block", color: "#7b7893", fontSize: 12 }}>reçu le {fr(r.recuLe)}</small></span>
                    <b>{euros2(r.montant)}</b>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className={s.panneau}>
          <div className={s.sectionTete}><h4>Client facturé</h4><button type="button" className={`${s.boutonFantome} ${s.petit}`} onClick={p.onChangerPayeur}>Changer</button></div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <b>{p.payeur.nom}</b>
            {p.payeurDistinct && <span className={s.genre} style={{ marginLeft: 6 }}>Payeur</span>}
            {p.payeur.contact && <div style={{ color: "#7b7893" }}>{p.payeur.contact}</div>}
            {p.payeur.adresse ? (
              <div style={{ color: "#4a475c", marginTop: 4 }}>{p.payeur.adresse}<br />{[p.payeur.codePostal, p.payeur.ville].filter(Boolean).join(" ")}{p.payeur.pays ? ` · ${p.payeur.pays}` : ""}</div>
            ) : (
              <p className={s.avertissement} style={{ margin: "8px 0 0" }}>Pas d&apos;adresse de facturation : renseignez-la par « Changer ».</p>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <div className={s.sectionTete}><h4>Totaux</h4></div>
            {t.parTaux.map((g) => (
              <div key={g.taux}>
                <div className={s.poste}><span>Base HT {String(g.taux).replace(".", ",")} %</span><b>{euros2(g.base)}</b></div>
                <div className={s.poste}><span>TVA {String(g.taux).replace(".", ",")} %</span><b>{euros2(g.tva)}</b></div>
              </div>
            ))}
            <div className={s.poste}><span>Total HT</span><b>{euros2(t.ht)}</b></div>
            <div className={s.poste}><span>Total TVA</span><b>{euros2(t.tva)}</b></div>
            <div className={s.totalTtc}><small>Total TTC</small><strong>{euros2(t.ttc)}</strong></div>
            {regle > 0 && (
              <>
                <div className={s.poste} style={{ marginTop: 8 }}><span>Déjà réglé</span><b className={s.vert}>− {euros2(regle)}</b></div>
                <div className={s.poste}><span><b style={{ color: "#17142b" }}>Net à payer</b></span><b>{euros2(net)}</b></div>
              </>
            )}
            <p className={s.note}>TVA calculée par taux sur le total HT (norme de la facture électronique). Taux proposé : {String(p.taux).replace(".", ",")} %.</p>
          </div>
        </aside>
      </div>
    </Fenetre>
  );
}
