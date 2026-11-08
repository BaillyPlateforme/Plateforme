"use client";

import { useState } from "react";
import { Icone } from "@/ui/icones";
import Fenetre from "@/crm/exploitation/ui/Fenetre";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { creerPartenaire } from "./actions";
import ChampsPartenaire from "./ChampsPartenaire";

/** « Nouvelle société » : le bouton du bandeau et sa fenêtre de saisie. */
export default function NouveauPartenaire({ libelle = "Nouvelle société" }: { libelle?: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}>
        {libelle}
        <Icone nom="plus" taille={17} />
      </button>
      <Fenetre ouvert={ouvert} fermer={() => setOuvert(false)} titre="Nouvelle société" sousTitre="Sous-traitant, agence, partenaire, transitaire…" icone="clients" large>
        <Formulaire action={creerPartenaire} className={u.fenetreFormulaire} vider onSucces={() => setOuvert(false)}>
          <div className={u.fenetreCorps}>
            <ChampsPartenaire prefixe="np-" />
            <div className={u.bloc}>
              <p className={u.blocTitre}>
                <i>3</i>Contact principal <small>facultatif</small>
              </p>
              <div className={u.champs}>
                <div className={`${u.champ} ${u.w6}`}>
                  <label htmlFor="np-contact_nom">Nom</label>
                  <input id="np-contact_nom" type="text" name="contact_nom" />
                </div>
                <div className={`${u.champ} ${u.w6}`}>
                  <label htmlFor="np-contact_fonction">Fonction</label>
                  <input id="np-contact_fonction" type="text" name="contact_fonction" placeholder="Exploitation, gérant…" />
                </div>
                <div className={`${u.champ} ${u.w6}`}>
                  <label htmlFor="np-contact_telephone">Téléphone</label>
                  <input id="np-contact_telephone" type="tel" name="contact_telephone" />
                </div>
                <div className={`${u.champ} ${u.w6}`}>
                  <label htmlFor="np-contact_email">E-mail</label>
                  <input id="np-contact_email" type="email" name="contact_email" />
                </div>
              </div>
            </div>
          </div>
          <div className={u.fenetrePied}>
            <button type="button" className={u.bouton} data-ton="secondaire" onClick={() => setOuvert(false)} data-gauche>
              Annuler
            </button>
            <button type="submit" name="ouvrir" value="1" className={u.bouton} data-ton="discret">
              Ajouter et ouvrir la fiche
            </button>
            <button type="submit" className={u.bouton}>
              Ajouter à l&apos;annuaire
            </button>
          </div>
        </Formulaire>
      </Fenetre>
    </>
  );
}
