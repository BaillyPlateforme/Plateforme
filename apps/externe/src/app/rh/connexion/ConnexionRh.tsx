"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";
import { Picto } from "../_ui/Icones";

/**
 * Le formulaire de connexion des RH : adresse et mot de passe, rien d'autre.
 *
 * La réinitialisation du mot de passe par e-mail n'est branchée nulle part
 * (aucun appel à resetPasswordForEmail, aucune page de retour) : « Mot de
 * passe oublié ? » renvoie donc vers l'interlocuteur Bailly et le standard —
 * c'est l'équipe qui change le mot de passe d'un compte RH, depuis Espaces
 * pro › Accès RH.
 */
export default function ConnexionRh({ refus = false }: { refus?: boolean }) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [visible, setVisible] = useState(false);
  const [oubli, setOubli] = useState(false);
  const [enCours, setEnCours] = useState(false);
  // Renvoyé de /rh avec une session sans droit (ni RH ni membre actif de l'équipe) : on dit pourquoi.
  const [erreur, setErreur] = useState<string | null>(refus ? "Ce compte n'a pas accès à l'espace RH." : null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password: motDePasse });
      if (error) {
        setErreur(/fetch|network/i.test(error.message) ? "Connexion impossible pour l'instant. Réessayez dans un instant." : "Adresse e-mail ou mot de passe incorrect.");
        setEnCours(false);
        return;
      }
    } catch {
      setErreur("Connexion impossible pour l'instant. Réessayez dans un instant.");
      setEnCours(false);
      return;
    }
    // Un vrai changement de page : le garde d'accès relit la session, et un
    // compte de l'équipe arrivé ici par erreur est aiguillé comme il faut.
    window.location.assign("/rh");
  }

  return (
    <form onSubmit={envoyer} className="space-y-5">
      {erreur && (
        <p role="alert" className="animate-step-in flex items-start gap-2.5 rounded-[14px] border border-danger/20 bg-danger-soft px-4 py-3 text-[13.5px] font-medium text-danger">
          <Picto nom="alerte" taille={17} className="mt-px shrink-0" />
          {erreur}
        </p>
      )}

      <label className="block">
        <span className="mb-2 block text-[13px] font-semibold text-ink-mid">Adresse e-mail professionnelle</span>
        <span className="relative block">
          <Picto nom="mail" taille={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            type="email"
            required
            autoFocus
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="champ h-[52px] pl-11"
            placeholder="prenom.nom@entreprise.fr"
          />
        </span>
      </label>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label htmlFor="rh-mot-de-passe" className="text-[13px] font-semibold text-ink-mid">
            Mot de passe
          </label>
          <button
            type="button"
            onClick={() => setOubli((o) => !o)}
            aria-expanded={oubli}
            aria-controls="rh-oubli"
            className="text-[12.5px] font-semibold text-ink-soft underline-offset-4 transition hover:text-ink hover:underline"
          >
            Mot de passe oublié ?
          </button>
        </div>
        <span className="relative block">
          <Picto nom="cadenas" taille={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            id="rh-mot-de-passe"
            type={visible ? "text" : "password"}
            required
            autoComplete="current-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="champ h-[52px] pl-11 pr-12"
            placeholder="••••••••••"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
            className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[12px] text-ink-soft transition hover:bg-subtle hover:text-ink"
          >
            <Picto nom={visible ? "oeilBarre" : "oeil"} taille={18} />
          </button>
        </span>
        {oubli && (
          // TEXTE À VALIDER — proposition, pas un mot de Bailly.
          <div id="rh-oubli" className="animate-step-in mt-3 flex gap-3 rounded-[14px] border border-line bg-subtle px-4 py-3.5 text-[13px] leading-relaxed text-ink-mid">
            <Picto nom="info" taille={17} className="mt-0.5 shrink-0 text-ink-soft" />
            <p>
              Pour obtenir un nouveau mot de passe, contactez votre interlocuteur Bailly Déménagement, ou le standard au{" "}
              <a href={TEL_AGENCE_LIEN} className="whitespace-nowrap font-semibold text-ink underline-offset-4 hover:underline">
                {TEL_AGENCE}
              </a>
              .
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="group flex h-[54px] w-full items-center justify-between rounded-full bg-[#1b1a18] pl-6 pr-2 text-[15px] font-semibold text-white shadow-[0_18px_34px_-18px_rgba(27,26,24,0.7)] transition hover:bg-black active:scale-[0.99] disabled:opacity-70"
      >
        {enCours ? "Connexion…" : "Accéder à mon espace RH"}
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5d033] text-[#1b1a18] transition group-hover:translate-x-0.5">
          {enCours ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1b1a18]/25 border-t-[#1b1a18]" /> : <Picto nom="fleche" taille={18} trait={2.2} />}
        </span>
      </button>
    </form>
  );
}
