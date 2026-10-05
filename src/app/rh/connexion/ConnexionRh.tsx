"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function ConnexionRh() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password: motDePasse });
    if (error) {
      setErreur("Identifiants incorrects.");
      setEnCours(false);
      return;
    }
    // Un vrai changement de page : le garde d'accès relit la session, et un
    // compte de l'équipe arrivé ici par erreur est aiguillé comme il faut.
    window.location.assign("/rh");
  }

  return (
    <form onSubmit={envoyer} className="space-y-4">
      {erreur && (
        <p role="alert" className="animate-step-in rounded-[14px] bg-danger-soft px-4 py-3 text-[13px] font-medium text-danger">
          {erreur}
        </p>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[13.5px] font-medium">Adresse e-mail professionnelle</span>
        <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="champ" placeholder="prenom.nom@entreprise.fr" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13.5px] font-medium">Mot de passe</span>
        <input type="password" required autoComplete="current-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="champ" placeholder="••••••••••" />
      </label>
      <button
        type="submit"
        disabled={enCours}
        className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-ink text-[14.5px] font-semibold text-shell transition active:scale-[0.99] disabled:opacity-60"
      >
        {enCours ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Connexion…
          </>
        ) : (
          "Accéder à mon espace RH"
        )}
      </button>
    </form>
  );
}
