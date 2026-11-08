"use client";

import { useState, useTransition } from "react";
import Fenetre from "@/crm/exploitation/ui/Fenetre";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { cloreContrat, rouvrirContrat } from "./actions";

/*
 * Clore ou rouvrir un contrat, depuis le bandeau. Clore se fait à une date :
 * le contrat quitte la facturation et ses caisses encore au dépôt sortent
 * avec lui.
 */
export default function GestesContrat({ id, actif, aujourdhui }: { id: number; actif: boolean; aujourdhui: string }) {
  const [clore, setClore] = useState(false);
  const [enCours, lancer] = useTransition();
  return (
    <>
      {actif ? (
        <button type="button" data-ton="contour" onClick={() => setClore(true)}>
          Clore le contrat
        </button>
      ) : (
        <button
          type="button"
          data-ton="contour"
          disabled={enCours}
          onClick={() =>
            lancer(async () => {
              const r = await rouvrirContrat(id);
              if (!r.ok) window.alert(r.erreur);
            })
          }
        >
          Rouvrir le contrat
        </button>
      )}
      <Fenetre ouvert={clore} fermer={() => setClore(false)} titre="Clore le contrat" sousTitre="Le contrat quitte la facturation ; les caisses encore au dépôt sortent à cette date." icone="archive" ton="rose">
        <Formulaire action={cloreContrat.bind(null, id)} className={u.fenetreFormulaire} onSucces={() => setClore(false)}>
          <div className={u.fenetreCorps}>
            <div className={u.champs}>
              <div className={`${u.champ} ${u.w6}`}>
                <label htmlFor="fin">Date de fin</label>
                <input id="fin" type="date" name="fin" defaultValue={aujourdhui} required />
              </div>
            </div>
          </div>
          <div className={u.fenetrePied}>
            <button type="button" className={u.bouton} data-ton="secondaire" onClick={() => setClore(false)}>
              Annuler
            </button>
            <button type="submit" className={u.bouton} data-ton="danger">
              Clore le contrat
            </button>
          </div>
        </Formulaire>
      </Fenetre>
    </>
  );
}
