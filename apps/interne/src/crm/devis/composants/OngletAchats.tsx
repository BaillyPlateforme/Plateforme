"use client";
import { POSTES_INTERNATIONAL, TAUX_TVA, nouvelId, type Achat, type International, type LigneDevis, type PosteInternational } from "../modele";
import { ID_LIGNE_TRANSPORT, LIGNE_TRANSPORT, marge, prixDeVente, r2, reporterInternational, totauxAchats } from "../calcul";
import { Champ, Nombre, PICTOS, Pic, Section, Segment, euros, pct } from "./champs";
import s from "../editeur.module.css";

/*
 * Les achats du devis (Créagidem, onglet Achats) : date, libellé,
 * fournisseur, coût prévu puis réel, TVA, compte comptable, n° de pièce ;
 * ventes et marges prévue et réelle, calculées sur le HT.
 * Et le devis international (réunion du 23/09) : les postes OS, FOB, fret
 * et DS, et les postes de coût ajoutés à la main (Céline, 16/11/2026), une
 * marge en %, le prix de vente qui en découle, le prévu face au réel. Le
 * prix de vente se reporte, sans détail, dans la ligne « Transport,
 * chargement et livraison » du chiffrage (reporterInternational).
 */

const vide = (): Achat => ({ id: nouvelId("h"), date: "", libelle: "", fournisseur: "", prevu: null, reel: null, tva: null, compte: "", piece: "", poste: null });

function Indicateurs({ ventes, achats }: { ventes: number; achats: Achat[] }) {
  const t = totauxAchats(achats);
  const prevue = marge(ventes, t.prevu), reelle = marge(ventes, t.reelEstime);
  return (
    <div className={s.indicateurs}>
      <div><small>Ventes HT</small><b>{euros(ventes)}</b><span>Total HT du devis</span></div>
      <div><small>Coûts prévus</small><b>{euros(t.prevu)}</b><span>{achats.length} achat{achats.length > 1 ? "s" : ""}</span></div>
      <div data-ton={prevue.montant < 0 ? "rouge" : "vert"}><small>Marge prévue</small><b>{euros(prevue.montant)}</b><span>{prevue.pct != null ? `${pct(prevue.pct)} des ventes` : "—"}</span></div>
      <div data-ton={reelle.montant < 0 ? "rouge" : "indigo"}><small>Marge réelle</small><b>{euros(reelle.montant)}</b><span>{t.manquants ? `estimée : ${t.manquants} coût${t.manquants > 1 ? "s" : ""} réel${t.manquants > 1 ? "s" : ""} à saisir` : reelle.pct != null ? `${pct(reelle.pct)} des ventes` : "—"}</span></div>
    </div>
  );
}

export function OngletAchats({ achats, onChange, ventes }: { achats: Achat[]; onChange: (a: Achat[]) => void; ventes: number }) {
  const maj = (id: string, p: Partial<Achat>) => onChange(achats.map((x) => (x.id === id ? { ...x, ...p } : x)));
  return (
    <>
      <Indicateurs ventes={ventes} achats={achats} />
      <Section
        surtitre="Achats"
        titre="Coûts prévus et réels"
        texte="La flèche reporte le coût prévu dans le réel. Les coûts sont hors taxes ; la marge se lit sur le HT du devis."
        actions={<button type="button" className={s.boutonDoux} onClick={() => onChange([...achats, vide()])}><Pic d={PICTOS.plus} /> Ajouter un achat</button>}
      >
        <div className={s.achats} role="table" aria-label="Achats">
          <div className={s.achatTete} role="row">
            <span>Date</span><span>Achat</span><span>Fournisseur</span><span className={s.droite}>Coût prévu HT</span><span /><span className={s.droite}>Coût réel HT</span><span>TVA</span><span>Compte</span><span>N° pièce</span><span />
          </div>
          {achats.length === 0 && <div className={s.lignesVide}>Aucun achat. Sous-traitance, location, carburant, matériel : chaque coût saisi ici affine la marge.</div>}
          {achats.map((a) => (
            <div key={a.id} className={s.achat} role="row" data-poste={a.poste ?? undefined}>
              <input type="date" value={a.date} aria-label="Date" onChange={(e) => maj(a.id, { date: e.target.value })} />
              <input type="text" value={a.libelle} aria-label="Achat" placeholder={POSTES_INTERNATIONAL.find((p) => p.cle === a.poste)?.libelle ?? (a.poste === "autre" ? "Poste de coût (international)" : "Libellé")} onChange={(e) => maj(a.id, { libelle: e.target.value })} />
              <input type="text" value={a.fournisseur} list="fournisseurs-devis" aria-label="Fournisseur" placeholder="Société" onChange={(e) => maj(a.id, { fournisseur: e.target.value })} />
              <Nombre className={s.droite} valeur={a.prevu} onChange={(v) => maj(a.id, { prevu: v })} suffixe="€" label="Coût prévu HT" />
              <button type="button" className={s.report} title="Reporter le prévu dans le réel" aria-label="Reporter le coût prévu dans le coût réel" onClick={() => maj(a.id, { reel: a.prevu })}><Pic d={PICTOS.fleche} /></button>
              <Nombre className={s.droite} valeur={a.reel} onChange={(v) => maj(a.id, { reel: v })} suffixe="€" label="Coût réel HT" placeholder="à saisir" />
              <select value={a.tva ?? ""} aria-label="TVA" onChange={(e) => maj(a.id, { tva: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">—</option>
                {TAUX_TVA.map((t) => <option key={t} value={t}>{String(t).replace(".", ",")} %</option>)}
              </select>
              <input type="text" value={a.compte} list="comptes-devis" aria-label="Compte comptable" placeholder="Par défaut" onChange={(e) => maj(a.id, { compte: e.target.value })} />
              <input type="text" value={a.piece} aria-label="Numéro de pièce" onChange={(e) => maj(a.id, { piece: e.target.value })} />
              <button type="button" className={s.supprimerRang} aria-label="Supprimer l'achat" onClick={() => onChange(achats.filter((x) => x.id !== a.id))}><Pic d={PICTOS.corbeille} taille={15} /></button>
            </div>
          ))}
          {achats.length > 0 && (
            <div className={s.achatPied} role="row">
              <span>Total</span>
              <b className={s.droite}>{euros(totauxAchats(achats).prevu)}</b>
              <span />
              <b className={s.droite}>{euros(totauxAchats(achats).reelSaisi)}</b>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

export function OngletInternational({
  achats, onAchats, international, onInternational, lignes, onLignes, tvaDefaut, ventes, typeInternational, saisie,
}: {
  achats: Achat[];
  onAchats: (a: Achat[]) => void;
  international: International;
  onInternational: (i: International) => void;
  lignes: LigneDevis[];
  onLignes: (l: LigneDevis[]) => void;
  tvaDefaut: number;
  ventes: number;
  typeInternational: boolean;
  saisie: "ht" | "ttc";
}) {
  const poste = (cle: Exclude<PosteInternational, "autre">) => achats.find((a) => a.poste === cle);
  const majAchat = (id: string, p: Partial<Achat>) => onAchats(achats.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const majPoste = (cle: Exclude<PosteInternational, "autre">, p: Partial<Achat>) => {
    const a = poste(cle);
    if (a) majAchat(a.id, p);
    else onAchats([...achats, { ...vide(), libelle: POSTES_INTERNATIONAL.find((x) => x.cle === cle)!.libelle, poste: cle, ...p }]);
  };
  const ajouterPoste = () => onAchats([...achats, { ...vide(), poste: "autre" }]);
  const m = international.margePct;
  const vente = (cout: number | null) => (cout != null && m != null ? prixDeVente(cout, m, international.modeMarge) : null);
  // Les quatre postes, puis ceux ajoutés à la main (achats « autre »), dans l'ordre de saisie.
  const postes = [
    ...POSTES_INTERNATIONAL.map((p) => {
      const a = poste(p.cle);
      return { cle: p.cle as string, libelle: p.libelle, aide: p.aide, achat: a, cout: a?.prevu ?? null, vente: vente(a?.prevu ?? null), libre: false, maj: (x: Partial<Achat>) => majPoste(p.cle, x) };
    }),
    ...achats.filter((a) => a.poste === "autre").map((a) => ({
      cle: a.id, libelle: a.libelle, aide: "", achat: a, cout: a.prevu, vente: vente(a.prevu), libre: true, maj: (x: Partial<Achat>) => majAchat(a.id, x),
    })),
  ];
  const coutTotal = r2(postes.reduce((x, p) => x + (p.cout ?? 0), 0));
  const venteTotal = r2(postes.reduce((x, p) => x + (p.vente ?? 0), 0));
  const reelTotal = r2(postes.reduce((x, p) => x + (p.achat?.reel ?? 0), 0));
  const reelsSaisis = postes.filter((p) => p.achat?.reel != null).length;
  // Les quatre postes, et les postes ajoutés qui portent un coût prévu.
  const reelsAttendus = postes.filter((p) => !p.libre || p.cout != null).length;
  const peutReporter = m != null && venteTotal > 0;
  const dejaReporte = lignes.some((l) => l.id === ID_LIGNE_TRANSPORT);
  return (
    <>
      {!typeInternational && <p className={s.bandeauInfo}>Ce dossier n&apos;est pas classé international (onglet Divers). La méthode reste disponible pour un devis qui le demande.</p>}
      <Section
        surtitre="Devis international"
        titre="Coûts, marge et prix de vente"
        texte={`Saisissez les coûts de chaque poste (ajoutez-en au besoin), puis la marge voulue : le prix de vente se calcule, et se reporte en un seul montant dans la ligne « ${LIGNE_TRANSPORT} » du chiffrage. Les coûts réels se saisissent ensuite, avant la clôture du dossier.`}
        actions={
          <div className={s.reglagesChiffrage}>
            <Champ label="Marge" className={s.champEtroit}>
              <Nombre valeur={m} onChange={(v) => onInternational({ ...international, margePct: v })} suffixe="%" min={0} max={99} placeholder="—" />
            </Champ>
            <Segment label="Calcul de la marge" petit valeur={international.modeMarge} options={[["cout", "Sur le coût"], ["prix", "Sur le prix de vente"]]} onChange={(v) => onInternational({ ...international, modeMarge: v })} />
          </div>
        }
      >
        <div className={s.postes}>
          <div className={s.posteTete}><span>Poste</span><span>Fournisseur</span><span className={s.droite}>Coût prévu HT</span><span className={s.droite}>Prix de vente HT</span><span className={s.droite}>Coût réel HT</span><span className={s.droite}>Écart</span><span /></div>
          {postes.map((p) => {
            const ecart = p.achat?.reel != null && p.cout != null ? r2(p.achat.reel - p.cout) : null;
            const nom = p.libelle || "Poste ajouté";
            return (
              <div key={p.cle} className={s.poste} data-libre={p.libre ? "" : undefined}>
                {p.libre ? (
                  <span><input type="text" value={p.libelle} aria-label="Libellé du poste de coût" placeholder="Poste de coût" onChange={(e) => p.maj({ libelle: e.target.value })} /></span>
                ) : (
                  <span><b>{p.libelle}</b><small>{p.aide}</small></span>
                )}
                <input type="text" value={p.achat?.fournisseur ?? ""} list="fournisseurs-devis" aria-label={`Fournisseur ${nom}`} placeholder="Société" onChange={(e) => p.maj({ fournisseur: e.target.value })} />
                <Nombre className={s.droite} valeur={p.cout} onChange={(v) => p.maj({ prevu: v })} suffixe="€" label={`Coût prévu ${nom}`} />
                <span className={`${s.droite} ${s.vente}`}>{p.vente != null ? euros(p.vente) : "—"}</span>
                <Nombre className={s.droite} valeur={p.achat?.reel ?? null} onChange={(v) => p.maj({ reel: v })} suffixe="€" label={`Coût réel ${nom}`} placeholder="à saisir" />
                <span className={s.droite} data-ecart={ecart == null ? undefined : ecart > 0 ? "plus" : ecart < 0 ? "moins" : "nul"}>{ecart == null ? "—" : `${ecart > 0 ? "+" : ""}${euros(ecart)}`}</span>
                {p.libre ? (
                  <button type="button" className={s.supprimerRang} aria-label={`Retirer le poste ${nom}`} title="Retirer ce poste" onClick={() => onAchats(achats.filter((x) => x.id !== p.cle))}><Pic d={PICTOS.corbeille} taille={15} /></button>
                ) : <span />}
              </div>
            );
          })}
          <div className={s.posteAjout}>
            <button type="button" className={s.ajout} onClick={ajouterPoste}><Pic d={PICTOS.plus} taille={15} /> Ajouter une ligne de coût</button>
          </div>
          <div className={s.posteTotal}>
            <span>Total</span><span /><b className={s.droite}>{euros(coutTotal)}</b><b className={s.droite}>{euros(venteTotal)}</b><b className={s.droite}>{reelsSaisis ? euros(reelTotal) : "—"}</b><span /><span />
          </div>
        </div>
        <div className={s.reportInternational}>
          <p>
            {m == null ? "Indiquez la marge voulue pour calculer le prix de vente." : `Marge de ${pct(m)} ${international.modeMarge === "cout" ? "appliquée sur le coût" : "du prix de vente"} : ${euros(r2(venteTotal - coutTotal))} sur ${euros(venteTotal)} HT.`}
            {peutReporter && <><br />Le report met {euros(venteTotal)} HT dans la ligne « {LIGNE_TRANSPORT} »{dejaReporte ? ", déjà reportée : elle est mise à jour" : ""}.</>}
          </p>
          <button type="button" className={s.boutonPlein} disabled={!peutReporter} onClick={() => onLignes(reporterInternational(lignes, venteTotal, saisie, tvaDefaut))}>Reporter dans le chiffrage</button>
        </div>
      </Section>
      <Section surtitre="Prévu contre réel" titre="Situation du dossier" texte="Ventes : total HT du devis. Le réel prend le coût réel quand il est saisi, le prévu sinon.">
        <Indicateurs ventes={ventes} achats={achats.filter((a) => a.poste)} />
        <p className={s.etatSaisie} data-complet={reelsSaisis >= reelsAttendus ? "" : undefined}>
          {reelsSaisis >= reelsAttendus
            ? "Tous les coûts réels sont saisis."
            : `${reelsAttendus - reelsSaisis} coût${reelsAttendus - reelsSaisis > 1 ? "s" : ""} réel${reelsAttendus - reelsSaisis > 1 ? "s" : ""} à saisir avant la clôture du dossier.`}
        </p>
      </Section>
    </>
  );
}
