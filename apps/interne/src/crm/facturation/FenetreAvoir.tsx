"use client";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import Fenetre, { Champ } from "./Fenetre";
import { annulerParAvoir } from "./actions";
import { euros2, GENRE, type GenreFacture } from "./calcul";
import s from "./facturation.module.css";

export type FactureAAnnuler = { id: number; numero: string; genre: string; objet: string; ttc: number; affecte: number; statut: string; dossierId: number | null };

/**
 * « Annuler par un avoir » (Créagidem : déménagement annulé, avoir) : un
 * avoir numéroté reprend la facture ligne pour ligne ; la facture passe
 * « annulée » ; les règlements qu'elle avait reçus retournent au crédit du
 * dossier, à réaffecter ou à rembourser.
 */
export default function FenetreAvoir({ facture, onFermer }: { facture: FactureAAnnuler; onFermer: () => void }) {
  const id = useId();
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<{ id: number; numero: string } | null>(null);
  const [enCours, lancer] = useTransition();
  const soldee = facture.statut === "payee";

  if (fait) {
    return (
      <Fenetre surtitre="Avoir émis" titre={`Avoir ${fait.numero}`} sousTitre={`Facture ${facture.numero} annulée · ${euros2(facture.ttc)}`} onFermer={onFermer}
        pied={<><span className={s.resume}>{facture.affecte > 0 ? `${euros2(facture.affecte)} de règlements sont au crédit du dossier.` : "Aucun règlement n'était affecté à la facture."}</span>
          <span style={{ display: "flex", gap: 8 }}><button type="button" className={s.boutonFantome} onClick={onFermer}>Fermer</button>
            {facture.dossierId != null && <Link className={s.bouton} href={`/imprimer/${facture.dossierId}?doc=facture&f=${fait.id}`}>Voir et imprimer l&apos;avoir</Link>}</span></>}>
        <p className={s.info}>L&apos;avoir est numéroté dans sa propre suite (AV-année-numéro). La facture annulée reste consultable, marquée « annulée ».</p>
      </Fenetre>
    );
  }

  return (
    <Fenetre
      surtitre="Annulation"
      titre={`Annuler la facture ${facture.numero}`}
      sousTitre={`${GENRE[facture.genre as GenreFacture] ?? "Facture"} · ${facture.objet} · ${euros2(facture.ttc)} TTC`}
      onFermer={onFermer}
      pied={
        <>
          <span className={s.resume}>Un avoir de <b>{euros2(facture.ttc)}</b> sera émis.</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.boutonFantome} onClick={onFermer}>Ne pas annuler</button>
            <button type="button" className={s.bouton} disabled={enCours || !motif.trim()} onClick={() => {
              setErreur(null);
              lancer(async () => {
                const r = await annulerParAvoir(facture.id, motif);
                if (!r.ok) setErreur(r.erreur);
                else setFait({ id: r.id!, numero: r.numero! });
              });
            }}>{enCours ? "Émission de l'avoir…" : "Émettre l'avoir"}</button>
          </span>
        </>
      }
    >
      {erreur && <p className={s.erreur} role="alert">{erreur}</p>}
      <p className={s.info}>Une facture émise ne se modifie pas : on l&apos;annule par un avoir, qui la reprend ligne pour ligne, puis on émet, si besoin, une nouvelle facture.</p>
      {soldee && <p className={s.avertissement}>Cette facture est soldée. Ses règlements ({euros2(facture.affecte || facture.ttc)}) resteront au crédit du client : à réaffecter à une autre facture ou à rembourser.</p>}
      {!soldee && facture.affecte > 0 && <p className={s.avertissement}>{euros2(facture.affecte)} de règlements reçus sur cette facture retourneront au crédit du dossier.</p>}
      <div className={s.grille}>
        <Champ label="Motif de l'annulation" aide="imprimé sur l'avoir" l={12} id={`${id}-motif`}>
          <textarea id={`${id}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Déménagement annulé par le client, erreur de montant…" autoFocus />
        </Champ>
      </div>
    </Fenetre>
  );
}
