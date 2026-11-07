"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import s from "./connexion.module.css";

/**
 * Le formulaire de connexion : e-mail et mot de passe, vérifiés par Supabase
 * dans le navigateur.
 *
 * Une fois connecté, on recharge la page entière vers la destination plutôt
 * que de naviguer dans l'app : la connexion et le CRM d'un côté, l'espace
 * équipe de l'autre, n'ont pas la même mise en page racine, et une navigation
 * côté client entre les deux, suivie d'un rafraîchissement, pouvait rester
 * bloquée sur la roue d'attente.
 */
export default function FormulaireConnexion({ cible, refus }: { cible: string; refus: boolean }) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [voir, setVoir] = useState(false);
  const [majuscules, setMajuscules] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(
    refus ? "Ce compte n'a pas accès à l'espace de l'équipe. Les clients et les RH ont leur propre espace, ci-dessous." : null,
  );

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password: motDePasse });
    if (error) {
      setErreur(
        /invalid|credentials/i.test(error.message)
          ? "Adresse e-mail ou mot de passe incorrect."
          : "La connexion n'a pas abouti. Vérifiez votre réseau, puis réessayez.",
      );
      setEnvoi(false);
      return;
    }
    window.location.assign(cible);
  }

  const verifierMajuscules = (e: React.KeyboardEvent<HTMLInputElement>) => setMajuscules(e.getModifierState("CapsLock"));

  return (
    <form onSubmit={envoyer} noValidate={false}>
      {erreur && (
        <div role="alert" className={s.alerte}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5M12 16.2v.3" />
          </svg>
          <span>{erreur}</span>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@baillydem.com"
          />
        </span>
      </label>

      <label className={s.champ}>
        <span>Mot de passe</span>
        <span className={s.saisie}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          <input
            type={voir ? "text" : "password"}
            name="password"
            required
            autoComplete="current-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            onKeyDown={verifierMajuscules}
            onKeyUp={verifierMajuscules}
            placeholder="Votre mot de passe"
            className={s.avecBouton}
          />
          <button type="button" className={s.voir} onClick={() => setVoir((v) => !v)} aria-pressed={voir}>
            {voir ? "Masquer" : "Afficher"}
          </button>
        </span>
        {majuscules && (
          <span className={s.majuscules}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 4 4 13h4.5v7h7v-7H20z" />
            </svg>
            Les majuscules sont verrouillées.
          </span>
        )}
      </label>

      <button type="submit" className={s.envoyer} disabled={envoi}>
        {envoi ? (
          <>
            <span className={s.roue} aria-hidden />
            Connexion…
          </>
        ) : (
          <>
            Se connecter
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
