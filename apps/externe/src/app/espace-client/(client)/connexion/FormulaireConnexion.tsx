"use client";

import { useActionState, useState } from "react";
import { demanderLien, type EtatFormulaire } from "@/lib/actions/espace-client";
import { connexionSchema, erreursDe } from "@/lib/espace-client/schemas";
import { Icone } from "../../_ui/Icone";

/** Une adresse, un bouton. L'adresse est vérifiée ici, puis à nouveau par le serveur. */
export function FormulaireConnexion({ suite = null }: { suite?: string | null }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(demanderLien, {});
  const [locale, setLocale] = useState<string | null>(null);
  const erreur = locale ?? etat.erreurs?.email;

  return (
    <form
      action={action}
      noValidate
      className="mt-l"
      onSubmit={(e) => {
        const r = connexionSchema.safeParse({ email: String(new FormData(e.currentTarget).get("email") ?? "").trim() });
        if (!r.success) {
          e.preventDefault();
          setLocale(erreursDe(r.error).email ?? "Adresse invalide.");
        } else setLocale(null);
      }}
    >
      {suite && <input type="hidden" name="suite" value={suite} />}
      <div className={`field${erreur ? " has-error" : ""}`}>
        <label htmlFor="email">Adresse e-mail</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" placeholder="prenom.nom@exemple.fr" aria-invalid={!!erreur} aria-describedby={erreur ? "email-err" : undefined} />
        <div className="err" id="email-err" role="alert">
          {erreur}
        </div>
      </div>
      <button className="btn btn-primary btn-block mt-m" disabled={enCours}>
        {enCours ? <span className="spinner" style={{ borderColor: "rgba(27,26,24,.25)", borderTopColor: "var(--ink)" }} /> : <Icone nom="mail" />}
        Recevoir mon lien de connexion
      </button>
    </form>
  );
}
