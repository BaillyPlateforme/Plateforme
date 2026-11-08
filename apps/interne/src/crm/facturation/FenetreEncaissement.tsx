"use client";
import { useId, useState, useTransition } from "react";
import Fenetre, { Champ } from "./Fenetre";
import { encaisser, modifierReglement } from "./actions";
import { MODES_SAISIS, euros2, arrondi, aujourdhuiParis } from "./calcul";
import type { ReglementVue } from "./donnees";
import s from "./facturation.module.css";

export type FactureOuverte = { id: number; numero: string; genre: string; objet: string; reste: number };

/**
 * « Encaisser » (Créagidem : la fenêtre de validation du devis, §J) : le
 * montant, libre ; le mode de règlement ; pour un chèque, la banque, le
 * numéro et le titulaire ; le compte d'encaissement ; la date du règlement
 * et la date prévue d'encaissement ; un commentaire ; et la facture qu'il
 * règle, ou aucune (il reste au crédit du dossier, des arrhes par exemple).
 * Sert aussi à corriger un règlement (sauf s'il solde une facture).
 */
export default function FenetreEncaissement({
  dossierId,
  factures,
  comptes,
  nature: natureInitiale = "reglement",
  montant: montantInitial,
  factureId: factureInitiale = null,
  reglement,
  onFermer,
}: {
  dossierId: number;
  factures: FactureOuverte[];
  comptes: string[];
  nature?: "arrhes" | "reglement" | "remboursement";
  montant?: number;
  factureId?: number | null;
  reglement?: ReglementVue;
  onFermer: () => void;
}) {
  const id = useId();
  const r = reglement;
  const [nature, setNature] = useState<"arrhes" | "reglement" | "remboursement">((r?.nature as "arrhes") ?? natureInitiale);
  const [montant, setMontant] = useState(r ? String(Math.abs(r.montant)).replace(".", ",") : montantInitial ? String(montantInitial).replace(".", ",") : "");
  const [mode, setMode] = useState(r?.mode && r.mode !== "carte_en_ligne" ? r.mode : "cheque");
  const [recuLe, setRecuLe] = useState(r?.recuLe ?? aujourdhuiParis());
  const [datePrevue, setDatePrevue] = useState(r?.datePrevue ?? "");
  const [banque, setBanque] = useState(r?.banque ?? "");
  const [cheque, setCheque] = useState(r?.numeroCheque ?? "");
  const [titulaire, setTitulaire] = useState(r?.titulaire ?? "");
  const [compte, setCompte] = useState(r?.compte ?? "");
  const [commentaire, setCommentaire] = useState(r?.commentaire ?? "");
  // Un règlement saisi depuis la carte, sans facture désignée : s'il n'y a qu'une facture à régler, il la règle
  // par défaut. Sinon la facture restait « à régler » quand le dossier était soldé (Parcours, page Factures et
  // relance du solde la disaient impayée). « Aucune facture » reste au choix.
  const [facture, setFacture] = useState<number | null>(
    r ? r.factureId : factureInitiale ?? (natureInitiale === "reglement" && factures.length === 1 ? factures[0].id : null),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, lancer] = useTransition();

  const valeur = Number(montant.replace(/\s/g, "").replace(",", "."));
  const choisie = factures.find((f) => f.id === facture) ?? null;
  // En modification, le règlement compte déjà dans le reste de sa facture : on le rajoute pour l'aperçu.
  const resteAvant = choisie ? arrondi(choisie.reste + (r && r.factureId === choisie.id ? Math.abs(r.montant) : 0)) : null;
  const resteApres = resteAvant != null && Number.isFinite(valeur) ? arrondi(resteAvant - valeur) : null;

  function enregistrer() {
    setErreur(null);
    if (!Number.isFinite(valeur) || valeur <= 0) return setErreur("Indiquez un montant positif.");
    const saisie = {
      dossierId, factureId: nature === "remboursement" ? null : facture, nature, montant: arrondi(valeur), mode: mode as "cheque", recuLe,
      datePrevue: datePrevue || null, banque, numeroCheque: mode === "cheque" ? cheque : null, titulaire, compte, commentaire,
    };
    lancer(async () => {
      const issue = r ? await modifierReglement(r.id, saisie) : await encaisser(saisie);
      if (!issue.ok) setErreur(issue.erreur);
      else onFermer();
    });
  }

  return (
    <Fenetre
      surtitre={r ? "Modifier un règlement" : "Encaissement"}
      titre={nature === "arrhes" ? "Encaisser des arrhes" : nature === "remboursement" ? "Rembourser le client" : "Encaisser un règlement"}
      sousTitre="Le montant est libre ; un règlement sans facture reste au crédit du dossier."
      onFermer={onFermer}
      pied={
        <>
          <span className={s.resume}>
            {choisie && resteApres != null ? (
              <>
                Facture {choisie.numero} : reste <b>{euros2(Math.max(0, resteApres))}</b> après ce règlement
              </>
            ) : nature === "remboursement" ? (
              "Le remboursement diminue l'encaissé du dossier."
            ) : (
              "Sans facture : au crédit du dossier, à affecter plus tard."
            )}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.boutonFantome} onClick={onFermer}>
              Annuler
            </button>
            <button type="button" className={s.bouton} onClick={enregistrer} disabled={enCours}>
              {enCours ? "Enregistrement…" : r ? "Enregistrer les changements" : "Enregistrer l'encaissement"}
            </button>
          </span>
        </>
      }
    >
      {erreur && <p className={s.erreur} role="alert">{erreur}</p>}
      <div className={s.bloc}>
        <p className={s.blocTitre}><i>1</i>Ce qui est encaissé</p>
        <div className={s.grille}>
          <Champ label="Nature" l={8}>
            <div className={s.choix} role="radiogroup" aria-label="Nature du règlement">
              {([["arrhes", "Arrhes"], ["reglement", "Règlement"], ["remboursement", "Remboursement"]] as const).map(([k, l]) => (
                <label key={k}>
                  <input type="radio" name={`${id}-nature`} checked={nature === k} onChange={() => setNature(k)} />
                  {l}
                </label>
              ))}
            </div>
          </Champ>
          <Champ label="Montant" aide="TTC" l={4} id={`${id}-montant`}>
            <div className={s.montantSaisi}>
              <input id={`${id}-montant`} type="text" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0,00" autoFocus />
              <span>€</span>
            </div>
          </Champ>
          {nature !== "remboursement" && (
            <Champ label="Affecté à" aide="la facture réglée, ou aucune" l={12} id={`${id}-facture`}>
              <select id={`${id}-facture`} value={facture ?? ""} onChange={(e) => setFacture(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Aucune facture · au crédit du dossier</option>
                {factures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.numero} · {f.objet} · reste {euros2(f.reste)}
                  </option>
                ))}
              </select>
            </Champ>
          )}
        </div>
      </div>

      <div className={s.bloc}>
        <p className={s.blocTitre}><i>2</i>Mode de règlement</p>
        <div className={s.choix} role="radiogroup" aria-label="Mode de règlement">
          {MODES_SAISIS.map((m) => (
            <label key={m.cle}>
              <input type="radio" name={`${id}-mode`} checked={mode === m.cle} onChange={() => setMode(m.cle)} />
              {m.label}
            </label>
          ))}
        </div>
        <div className={s.grille} style={{ marginTop: 14 }}>
          {mode === "cheque" && (
            <Champ label="N° de chèque" l={4} id={`${id}-cheque`}>
              <input id={`${id}-cheque`} type="text" value={cheque} onChange={(e) => setCheque(e.target.value)} placeholder="1234567" />
            </Champ>
          )}
          {["cheque", "virement", "prelevement"].includes(mode) && (
            <Champ label="Banque" aide={mode === "cheque" ? "du chèque" : "émettrice"} l={4} id={`${id}-banque`}>
              <input id={`${id}-banque`} type="text" value={banque} onChange={(e) => setBanque(e.target.value)} />
            </Champ>
          )}
          <Champ label="Titulaire" aide="du compte ou du chèque" l={mode === "cheque" ? 4 : ["virement", "prelevement"].includes(mode) ? 8 : 12} id={`${id}-titulaire`}>
            <input id={`${id}-titulaire`} type="text" value={titulaire} onChange={(e) => setTitulaire(e.target.value)} />
          </Champ>
          <Champ label="Compte d'encaissement" aide={comptes.length ? "Paramètres › Facturation" : "à lister dans Paramètres › Facturation"} l={12} id={`${id}-compte`}>
            <input id={`${id}-compte`} type="text" list={`${id}-comptes`} value={compte} onChange={(e) => setCompte(e.target.value)} />
            <datalist id={`${id}-comptes`}>
              {comptes.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Champ>
        </div>
      </div>

      <div className={s.bloc}>
        <p className={s.blocTitre}><i>3</i>Dates et commentaire</p>
        <div className={s.grille}>
          <Champ label="Date du règlement" l={6} id={`${id}-recu`}>
            <input id={`${id}-recu`} type="date" value={recuLe} max={aujourdhuiParis()} onChange={(e) => setRecuLe(e.target.value)} />
          </Champ>
          <Champ label="Date prévue d'encaissement" aide="chèque à remettre plus tard" l={6} id={`${id}-prevue`}>
            <input id={`${id}-prevue`} type="date" value={datePrevue} onChange={(e) => setDatePrevue(e.target.value)} />
          </Champ>
          <Champ label="Commentaire" l={12} id={`${id}-commentaire`}>
            <textarea id={`${id}-commentaire`} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Remis par le client à la visite, chèque à encaisser après le chargement…" />
          </Champ>
        </div>
      </div>
    </Fenetre>
  );
}
