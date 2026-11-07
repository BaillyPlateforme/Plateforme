"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

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
export default function FormulaireConnexion({ cible }: { cible: string }) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password: motDePasse });
    if (error) {
      setErreur("Identifiants incorrects.");
      setEnvoi(false);
      return;
    }
    window.location.assign(cible);
  }

  return (
    <form onSubmit={envoyer} style={{ display: "grid", gap: 14 }}>
      {erreur && (
        <div role="alert" className="btn danger" style={{ height: "auto", padding: "10px 12px", whiteSpace: "normal" }}>
          {erreur}
        </div>
      )}
      <label style={{ display: "grid", gap: 6, fontSize: 13.5, fontWeight: 600 }}>
        Adresse e-mail
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom@bailly.fr"
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13.5, fontWeight: 600 }}>
        Mot de passe
        <input
          type="password"
          required
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="••••••••••••"
          style={{ font: "inherit", color: "var(--ink)", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", outline: 0, width: "100%" }}
        />
      </label>
      <button type="submit" className="btn primary" disabled={envoi} style={{ height: 44, justifyContent: "center", marginTop: 4 }}>
        {envoi ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
