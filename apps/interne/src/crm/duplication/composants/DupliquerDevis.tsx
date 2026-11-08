"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Fenetre from "@/crm/facturation/Fenetre";
import { dupliquerDevis } from "@/crm/devis/actions";
import { m3 } from "@/crm/lib/format";
import { Icone } from "@/ui/icones";
import { A_VALIDER, DEVIS } from "../textes";
import type { DossierCible } from "../types";
import CeQuiSuit from "./CeQuiSuit";
import ChoixDossier from "./ChoixDossier";
import { useOuverture } from "./Declencheur";
import s from "../duplication.module.css";

/*
 * « Dupliquer » un devis : dans son dossier, ou dans un autre choisi par une
 * recherche (référence, client). La copie est un brouillon, numéroté à la
 * suite, daté du jour (src/crm/devis/copie.ts). Trois portes, une seule
 * fenêtre : la fiche du dossier (onglet Devis), la liste des devis, l'éditeur.
 */

export interface DevisADupliquer {
  id: number;
  numero: string;
  dossierId: number;
  ref: string;
  client: string;
  volume: number;
}

/** Le formulaire : où dupliquer, ce qui suit. `onAnnuler` : un bouton « Annuler » (hors de la fiche, qui a sa croix). */
export function FormulaireDupliquerDevis({ devis, onAnnuler, note }: { devis: DevisADupliquer; onAnnuler?: () => void; note?: string }) {
  const [ou, setOu] = useState<"ce" | "autre">("ce");
  const [cible, setCible] = useState<DossierCible | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const autre = ou === "autre";
  const volumeDiffere = autre && cible && Math.abs(cible.volume - devis.volume) > 0.05;
  return (
    <form action={dupliquerDevis.bind(null, devis.id)} onSubmit={() => setEnvoi(true)} className={s.racine}>
      <input type="hidden" name="cible" value={autre ? (cible?.id ?? "") : devis.dossierId} />
      <div className={s.cibles} role="radiogroup" aria-label="Où dupliquer le devis">
        <label className={s.cible}>
          <input type="radio" name="ou" checked={!autre} onChange={() => setOu("ce")} />
          <span>
            <b>Dans ce dossier</b>
            <small>
              {devis.ref} · {devis.client} : une variante du devis, à côté de lui.
            </small>
          </span>
        </label>
        <label className={s.cible}>
          <input type="radio" name="ou" checked={autre} onChange={() => setOu("autre")} />
          <span>
            <b>Dans un autre dossier</b>
            <small>{cible ? `${cible.ref} · ${cible.client}` : "Un client au déménagement semblable : choisissez son dossier."}</small>
          </span>
        </label>
      </div>
      {autre && <ChoixDossier sauf={devis.dossierId} choisi={cible} onChoisir={setCible} />}
      {volumeDiffere && (
        <p className={s.alerte} role="status">
          Le volume diffère ({m3(devis.volume)} → {m3(cible.volume)}) : l&apos;éditeur ne recalcule pas les prix sur le volume. Les montants sont repris tels quels, à vérifier.
        </p>
      )}
      <CeQuiSuit inventaire={DEVIS} />
      {note && <p className={s.note}>{note}</p>}
      {/* Sans « Annuler », c'est la fenêtre de la fiche (sa croix ferme) : son pied à elle. */}
      <div className={s.boutons} data-fiche={onAnnuler ? undefined : ""}>
        <i className={s.aValider} title="Nouveaux textes, à valider par l'équipe">{A_VALIDER}</i>
        {onAnnuler && (
          <button type="button" className={s.discret} onClick={onAnnuler}>
            Annuler
          </button>
        )}
        <button type="submit" className={s.principal} disabled={envoi || (autre && !cible)}>
          <Icone nom="dupliquer" taille={17} />
          {envoi ? "Duplication…" : autre ? (cible ? `Dupliquer dans ${cible.ref}` : "Choisissez un dossier") : "Dupliquer le devis"}
        </button>
      </div>
    </form>
  );
}

/** Dans un portail : posée dans une ligne de tableau ou une bande, la fenêtre hériterait du style de leurs boutons. */
function FenetreDevis({ devis, onFermer, note }: { devis: DevisADupliquer; onFermer: () => void; note?: string }) {
  return createPortal(
    <Fenetre surtitre={`Devis ${devis.numero} · dossier ${devis.ref}`} titre="Dupliquer le devis" sousTitre="La copie est un brouillon, avec le numéro suivant, datée du jour." onFermer={onFermer}>
      <FormulaireDupliquerDevis devis={devis} onAnnuler={onFermer} note={note} />
    </Fenetre>,
    document.body,
  );
}

/** La fenêtre de l'éditeur : ouverte par l'entrée « Dupliquer… » de son « ⋯ » (Declencheur). */
export function FenetreDupliquerDevis({ devis }: { devis: DevisADupliquer }) {
  const [ouvert, setOuvert] = useOuverture(`dupliquer-devis-${devis.id}`);
  return ouvert ? (
    <FenetreDevis devis={devis} onFermer={() => setOuvert(false)} note="La copie part du devis tel qu'il est enregistré : enregistrez d'abord ce que vous venez de modifier." />
  ) : null;
}

/** Le bouton d'une ligne de la liste des devis (une icône, comme ses voisins), et sa fenêtre. */
export function BoutonDupliquerDevis({ devis }: { devis: DevisADupliquer }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" className={s.iconeLigne} title="Dupliquer ce devis (ce dossier ou un autre)" aria-label={`Dupliquer le devis ${devis.numero}`} onClick={() => setOuvert(true)}>
        <Icone nom="dupliquer" taille={16} />
      </button>
      {ouvert && <FenetreDevis devis={devis} onFermer={() => setOuvert(false)} />}
    </>
  );
}
