"use client";
import { useEffect, useState, useTransition } from "react";
import { creerDevis, rechercherModeles } from "../actions";
import { FORMULES } from "../modele";
import { euros } from "./champs";
import s from "../nouveau.module.css";

/*
 * « Nouveau » devis (Créagidem, section H) : un devis libre (vierge, forfait
 * ou 5 postes), les seules formules qu'on veut proposer, ou la copie d'un
 * devis existant — de ce dossier ou d'un autre client, pris pour modèle.
 */

type Modele = Awaited<ReturnType<typeof rechercherModeles>>[number];
type Genre = "libre" | "formules" | "copie";

export default function NouveauDevis({ dossierId, volume, initial, erreur }: { dossierId: number; volume: number; initial: Genre; erreur?: string }) {
  const [genre, setGenre] = useState<Genre>(initial);
  const [recherche, setRecherche] = useState("");
  const [modeles, setModeles] = useState<Modele[] | null>(null);
  const [source, setSource] = useState<number | null>(null);
  const [cherche, demarrer] = useTransition();

  // La recherche suit la frappe, à peine différée.
  useEffect(() => {
    if (genre !== "copie") return;
    const t = setTimeout(() => demarrer(async () => setModeles(await rechercherModeles(recherche))), 220);
    return () => clearTimeout(t);
  }, [recherche, genre]);

  const CARTES: { cle: Genre; titre: string; texte: string; picto: string }[] = [
    { cle: "libre", titre: "Devis libre", texte: "Vierge : forfait ou 5 postes, lignes à votre main.", picto: "M12 5v14M5 12h14" },
    { cle: "formules", titre: "Formules du tarif", texte: "Seulement celles que vous proposez, calculées sur le volume.", picto: "M4 6h16M4 12h16M4 18h10" },
    { cle: "copie", titre: "Copier un devis", texte: "De ce dossier ou d'un autre client, pris pour modèle.", picto: "M8 8h11v11H8zM5 16V5h11" },
  ];

  return (
    <form action={creerDevis.bind(null, dossierId)} className={s.nouveau}>
      <input type="hidden" name="genre" value={genre} />
      <div className={s.cartes} role="radiogroup" aria-label="Type de devis">
        {CARTES.map((c) => (
          <button key={c.cle} type="button" role="radio" aria-checked={genre === c.cle} className={s.carte} onClick={() => setGenre(c.cle)}>
            <i aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={c.picto} /></svg>
            </i>
            <b>{c.titre}</b>
            <span>{c.texte}</span>
          </button>
        ))}
      </div>

      {erreur && <p className={s.erreur}>{erreur === "formule" ? "Cochez au moins une formule." : "Choisissez le devis à copier."}</p>}

      {genre === "libre" && (
        <div className={s.corps}>
          <label className={s.champ}>
            <span>Catégorie</span>
            <select name="categorie" defaultValue="libre">
              {FORMULES.map((f) => <option key={f.cle} value={f.cle}>{f.nom}</option>)}
            </select>
          </label>
          <fieldset className={s.champ}>
            <legend>Chiffrage</legend>
            <div className={s.segment}>
              <label><input type="radio" name="mode" value="forfait" defaultChecked /><span>Forfait</span></label>
              <label><input type="radio" name="mode" value="postes" /><span>5 postes</span></label>
            </div>
          </fieldset>
          <label className={s.champ} data-large>
            <span>Titre (facultatif)</span>
            <input type="text" name="titre" placeholder="Transfert du siège, version 2…" />
          </label>
          <button className={s.creer}>Créer le devis</button>
        </div>
      )}

      {genre === "formules" && (
        <div className={s.corps}>
          {volume > 0 ? (
            <>
              <div className={s.formules}>
                {FORMULES.filter((f) => f.cle !== "libre").map((f) => (
                  <label key={f.cle} className={s.formule}>
                    <input type="checkbox" name="formule" value={f.cle} defaultChecked />
                    <span><b>{f.nom}</b><small>{f.sous}</small></span>
                  </label>
                ))}
              </div>
              <p className={s.note}>Prix du tarif du CRM pour {String(volume).replace(".", ",")} m³, modifiables ensuite. Décochez une formule pour ne pas la proposer.</p>
              <button className={s.creer}>Établir les formules cochées</button>
            </>
          ) : (
            <p className={s.note}>Le volume du dossier est nul : renseignez l&apos;inventaire, ou partez d&apos;un devis libre.</p>
          )}
        </div>
      )}

      {genre === "copie" && (
        <div className={s.corpsCopie}>
          <input type="hidden" name="source" value={source ?? ""} />
          <input type="search" className={s.recherche} value={recherche} placeholder="Client, société, n° de devis ou de dossier…" aria-label="Rechercher un devis à copier" onChange={(e) => setRecherche(e.target.value)} autoFocus />
          <ul className={s.modeles} aria-busy={cherche}>
            {modeles?.length === 0 && <li className={s.aucun}>Aucun devis ne correspond.</li>}
            {modeles?.map((m) => (
              <li key={m.id}>
                <label data-choisi={source === m.id ? "" : undefined}>
                  <input type="radio" name="choix" checked={source === m.id} onChange={() => setSource(m.id)} />
                  <span className={s.modeleNom}><b>{m.numero}</b> · {m.nom}<small>{m.client} · dossier {m.ref}{m.did === dossierId ? " (ce dossier)" : ""}</small></span>
                  <span className={s.modeleMeta}>{m.lignes} ligne{m.lignes > 1 ? "s" : ""} · {m.mode === "forfait" ? "forfait" : "5 postes"}</span>
                  <b className={s.modeleMontant}>{euros(m.montant)}</b>
                </label>
              </li>
            ))}
          </ul>
          <div className={s.piedCopie}>
            <p className={s.note}>D&apos;un autre client, seuls le chiffrage, les prestations, les taux d&apos;assurance, les conditions et les achats prévus sont repris : rien qui tienne à son déménagement.</p>
            <button className={s.creer} disabled={!source}>Copier ce devis</button>
          </div>
        </div>
      )}
    </form>
  );
}
