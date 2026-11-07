"use client";

import { useActionState, useState } from "react";
import { choisirMonMotDePasse } from "@/terrain/actions";
import { Picto } from "@/terrain/composants/Picto";
import s from "@/terrain/composants/terrain.module.css";

/** Le déménageur remplace le mot de passe provisoire par le sien. */
export default function MotDePasse() {
  const [etat, agir, enCours] = useActionState(choisirMonMotDePasse, null);
  const [voir, setVoir] = useState(false);
  return (
    <form action={agir}>
      {etat && "erreur" in etat && (
        <div role="alert" className={s.erreur}>
          <Picto nom="alerte" taille={20} />
          <span>{etat.erreur}</span>
        </div>
      )}
      {etat?.ok && (
        <div role="status" className={s.succes}>
          <Picto nom="coche" taille={20} />
          Mot de passe enregistré.
        </div>
      )}
      <label className={s.champ}>
        <span>Nouveau mot de passe</span>
        <span className={`${s.saisie} ${s.saisieAvecBouton}`}>
          <input name="nouveau" type={voir ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required />
          <button type="button" className={s.voir} onClick={() => setVoir((x) => !x)} aria-pressed={voir}>
            {voir ? "Masquer" : "Afficher"}
          </button>
        </span>
      </label>
      <label className={s.champ}>
        <span>Le même, une seconde fois</span>
        <span className={s.saisie}>
          <input name="confirmation" type={voir ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required />
        </span>
      </label>
      <p className={s.aide}>8 caractères au moins.</p>
      <button type="submit" className={s.boutonPlein} disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer mon mot de passe"}
      </button>
    </form>
  );
}
