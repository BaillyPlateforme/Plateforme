"use client";

import { useActionState, useState } from "react";
import { LONGUEUR_MAX, LONGUEUR_MIN } from "@/lib/equipe/regles-mot-de-passe";
import { choisirMotDePasse, type EtatChoix } from "../actions";
import s from "../../connexion.module.css";

const Cadenas = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

const Alerte = ({ texte }: { texte: string }) => (
  <div role="alert" className={s.alerte}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.3" />
    </svg>
    <span>{texte}</span>
  </div>
);

/** Le nouveau mot de passe, deux fois. Réussi, l'action ouvre la session et mène au CRM. */
export default function ChoixMotDePasse({ jeton }: { jeton: string }) {
  const [etat, agir, enCours] = useActionState<EtatChoix, FormData>(choisirMotDePasse, null);
  const [voir, setVoir] = useState(false);

  // Le lien a servi (ou n'a jamais été bon) : le formulaire ne peut plus rien, on en redemande un.
  if (etat?.lienPerdu) {
    return (
      <>
        <Alerte texte={etat.erreur} />
        <a className={s.envoyer} href="/login/mot-de-passe">
          Recevoir un nouveau lien
        </a>
      </>
    );
  }

  return (
    <form action={agir}>
      {etat?.erreur && <Alerte texte={etat.erreur} />}
      <input type="hidden" name="jeton" value={jeton} />

      <label className={s.champ}>
        <span>
          Nouveau mot de passe <span className={s.regle}>({LONGUEUR_MIN} caractères au moins)</span>
        </span>
        <span className={s.saisie}>
          <Cadenas />
          <input
            type={voir ? "text" : "password"}
            name="nouveau"
            required
            autoFocus
            autoComplete="new-password"
            minLength={LONGUEUR_MIN}
            maxLength={LONGUEUR_MAX}
            className={s.avecBouton}
          />
          <button type="button" className={s.voir} onClick={() => setVoir((v) => !v)} aria-pressed={voir}>
            {voir ? "Masquer" : "Afficher"}
          </button>
        </span>
      </label>

      <label className={s.champ}>
        <span>Le même, une seconde fois</span>
        <span className={s.saisie}>
          <Cadenas />
          <input type={voir ? "text" : "password"} name="confirmation" required autoComplete="new-password" minLength={LONGUEUR_MIN} maxLength={LONGUEUR_MAX} />
        </span>
      </label>

      <button type="submit" className={s.envoyer} disabled={enCours}>
        {enCours ? (
          <>
            <span className={s.roue} aria-hidden />
            Enregistrement…
          </>
        ) : (
          <>
            Enregistrer et me connecter
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
