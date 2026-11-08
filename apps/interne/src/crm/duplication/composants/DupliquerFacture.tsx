"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dupliquerFacture } from "@/crm/facturation/actions";
import { euros2 } from "@/crm/facturation/calcul";
import { Icone } from "@/ui/icones";
import { A_VALIDER, FACTURE } from "../textes";
import type { DossierCible } from "../types";
import CeQuiSuit from "./CeQuiSuit";
import ChoixDossier from "./ChoixDossier";
import s from "../duplication.module.css";

/*
 * « Dupliquer » une facture : une facture À ÉMETTRE, dans son dossier ou dans
 * un autre. Elle n'a ni numéro ni date ; l'émission, plus tard, lui donne le
 * numéro suivant (src/crm/facturation/actions.ts, dupliquerFacture et
 * emettreFacture). Après la duplication, la fiche du dossier de destination
 * s'ouvre sur sa facturation, la facture à émettre en tête.
 */

export interface FactureADupliquer {
  id: number;
  numero: string;
  objet: string;
  ttc: number;
  dossierId: number;
  ref: string;
  client: string;
}

export function FormulaireDupliquerFacture({ facture, onAnnuler, onFaite }: { facture: FactureADupliquer; onAnnuler?: () => void; onFaite?: (id: number) => void }) {
  const router = useRouter();
  const [ou, setOu] = useState<"ce" | "autre">("ce");
  const [cible, setCible] = useState<DossierCible | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, lancer] = useTransition();
  const autre = ou === "autre";

  const envoyer = () => {
    const id = autre ? cible?.id : facture.dossierId;
    if (!id) return;
    setErreur(null);
    lancer(async () => {
      const r = await dupliquerFacture(facture.id, id);
      if (!r.ok) return setErreur(r.erreur);
      if (id === facture.dossierId && onFaite) onFaite(r.id!);
      else router.push(`/dossiers/${id}?facture_dupliquee=${r.id}#facturation`);
    });
  };

  return (
    <div className={s.racine}>
      {erreur && <p className={s.erreur} role="alert">{erreur}</p>}
      <div className={s.cibles} role="radiogroup" aria-label="Où dupliquer la facture">
        <label className={s.cible}>
          <input type="radio" name={`ou-${facture.id}`} checked={!autre} onChange={() => setOu("ce")} />
          <span>
            <b>Dans ce dossier</b>
            <small>
              {facture.ref} · {facture.client} : une facture de plus, à émettre.
            </small>
          </span>
        </label>
        <label className={s.cible}>
          <input type="radio" name={`ou-${facture.id}`} checked={autre} onChange={() => setOu("autre")} />
          <span>
            <b>Dans un autre dossier</b>
            <small>{cible ? `${cible.ref} · ${cible.client}` : "La même prestation pour un autre client : choisissez son dossier."}</small>
          </span>
        </label>
      </div>
      {autre && <ChoixDossier sauf={facture.dossierId} choisi={cible} onChoisir={setCible} />}
      <p className={s.note}>
        La copie est une <b>facture à émettre</b> : sans numéro ni date, elle ne compte nulle part (solde, espace client) tant qu&apos;elle n&apos;est pas émise.
        À l&apos;émission, elle prend le numéro suivant des factures, à la date du jour, et le client facturé du dossier.
      </p>
      <CeQuiSuit inventaire={FACTURE} />
      <div className={s.boutons}>
        <i className={s.aValider} title="Nouveaux textes, à valider par l'équipe">{A_VALIDER}</i>
        {onAnnuler && (
          <button type="button" className={s.discret} onClick={onAnnuler}>
            Annuler
          </button>
        )}
        <button type="button" className={s.principal} disabled={enCours || (autre && !cible)} onClick={envoyer}>
          <Icone nom="dupliquer" taille={17} />
          {enCours ? "Duplication…" : autre ? (cible ? `Dupliquer dans ${cible.ref}` : "Choisissez un dossier") : `Dupliquer (${euros2(facture.ttc)} TTC)`}
        </button>
      </div>
    </div>
  );
}
