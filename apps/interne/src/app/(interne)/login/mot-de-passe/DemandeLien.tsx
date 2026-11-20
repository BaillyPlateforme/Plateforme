"use client";

import { useActionState } from "react";
import { demanderLien, type EtatDemande } from "./actions";
import s from "../connexion.module.css";

/** La demande du lien : une adresse, et la même réponse qu'elle soit celle d'un compte ou non. */
export default function DemandeLien({ email }: { email: string }) {
  const [etat, agir, enCours] = useActionState<EtatDemande, FormData>(demanderLien, null);

  if (etat?.ok) {
    return (
      <div role="status" className={s.succes}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m20 7-8 5.5L4 7" />
        </svg>
        <span>
          Si cette adresse est celle d&apos;un compte de l&apos;équipe, le lien vient de partir. Ouvrez-le dans l&apos;heure : il ne sert qu&apos;une fois.
          Rien reçu au bout de quelques minutes ? Regardez dans les courriers indésirables.
        </span>
      </div>
    );
  }

  return (
    <form action={agir}>
      {etat && "erreur" in etat && (
        <div role="alert" className={s.alerte}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5M12 16.2v.3" />
          </svg>
          <span>{etat.erreur}</span>
        </div>
      )}

      <label className={s.champ}>
        <span>Adresse e-mail</span>
        <span className={s.saisie}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m20 7-8 5.5L4 7" />
          </svg>
          <input
            type="email"
            name="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            maxLength={200}
            defaultValue={email}
            placeholder="prenom@baillydem.com"
          />
        </span>
      </label>

      <button type="submit" className={s.envoyer} disabled={enCours}>
        {enCours ? (
          <>
            <span className={s.roue} aria-hidden />
            Envoi…
          </>
        ) : (
          <>
            Recevoir le lien
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
