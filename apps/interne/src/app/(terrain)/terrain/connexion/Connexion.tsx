"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { adresseDeConnexion } from "@/terrain/actions";
import { Picto } from "@/terrain/composants/Picto";
import s from "@/terrain/composants/terrain.module.css";

/**
 * Le formulaire de connexion du terrain. L'identifiant (« karim.d ») est
 * traduit par le serveur en l'adresse du compte, puis Supabase vérifie le mot
 * de passe depuis le téléphone : chaque téléphone compte pour lui-même dans
 * les limites de tentatives de Supabase, et non le serveur pour tous.
 * Une adresse e-mail complète est acceptée telle quelle.
 */
export default function Connexion({ cible }: { cible: string }) {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [voir, setVoir] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!identifiant.trim() || !motDePasse) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const email = await adresseDeConnexion(identifiant);
      const { error } = await createClient().auth.signInWithPassword({ email, password: motDePasse });
      if (error) {
        setErreur(
          error.code === "user_banned"
            ? "Ce compte est désactivé. Adressez-vous au bureau."
            : /invalid|credentials/i.test(`${error.code} ${error.message}`)
              ? "Identifiant ou mot de passe incorrect."
              : "La connexion n'a pas abouti. Vérifiez le réseau, puis réessayez.",
        );
        setEnvoi(false);
        return;
      }
      // Rechargement complet : la session vient d'être posée dans les cookies.
      window.location.assign(cible);
    } catch {
      setErreur("La connexion n'a pas abouti. Vérifiez le réseau, puis réessayez.");
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={envoyer}>
      {erreur && (
        <div role="alert" className={s.erreur}>
          <Picto nom="alerte" taille={20} />
          <span>{erreur}</span>
        </div>
      )}
      <label className={s.champ}>
        <span>Identifiant</span>
        <span className={s.saisie}>
          <input
            name="username"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="prenom.n"
            required
          />
        </span>
      </label>
      <label className={s.champ}>
        <span>Mot de passe</span>
        <span className={`${s.saisie} ${s.saisieAvecBouton}`}>
          <input
            name="password"
            type={voir ? "text" : "password"}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            required
          />
          <button type="button" className={s.voir} onClick={() => setVoir((x) => !x)} aria-pressed={voir}>
            {voir ? "Masquer" : "Afficher"}
          </button>
        </span>
      </label>
      <button type="submit" className={s.boutonPlein} disabled={envoi}>
        {envoi ? "Connexion…" : "Se connecter"}
        {!envoi && <Picto nom="suite" />}
      </button>
      <p className={s.aide}>Identifiant oublié, mot de passe perdu : le bureau le retrouve ou le remplace depuis le CRM.</p>
      <a className={s.lienBureau} href="/login">
        <Picto nom="bureau" taille={18} />
        Vous êtes au bureau ? Connexion de l&apos;équipe
      </a>
    </form>
  );
}
