"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import type { EtatFormulaire } from "@/lib/actions/espace-client";
import type { Erreurs } from "@/lib/espace-client/schemas";

type Action = (etat: EtatFormulaire, fd: FormData) => Promise<EtatFormulaire>;
type Validation = (fd: FormData) => Erreurs;

/**
 * Le cycle de tous les formulaires du client : le schéma est vérifié dans
 * le navigateur, champ par champ, avant l'envoi ; l'action serveur revérifie
 * avec le même schéma et peut renvoyer ses propres erreurs.
 *
 * L'envoi passe par une transition plutôt que par l'attribut `action` du
 * formulaire : ainsi React ne vide pas les champs quand le serveur répond
 * par une erreur.
 */
export function useFormulaire(action: Action, valider: Validation) {
  const [etat, envoyer, enCours] = useActionState<EtatFormulaire, FormData>(action, {});
  const [locales, setLocales] = useState<Erreurs | null>(null);
  const [essai, setEssai] = useState(0);
  const erreurs = locales ?? etat.erreurs ?? {};

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const errs = valider(fd);
    setEssai((n) => n + 1);
    if (Object.values(errs).some(Boolean)) {
      setLocales(errs);
      requestAnimationFrame(() => {
        const premier = form.querySelector<HTMLElement>(".has-error input, .has-error select, .has-error textarea");
        premier?.focus({ preventScroll: true });
        form.querySelector(".form-error-summary")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setLocales(null);
    startTransition(() => envoyer(fd));
  }

  /** Une saisie efface l'erreur de son champ. */
  const effacer = (cle: string) => {
    if (!erreurs[cle]) return;
    setLocales({ ...erreurs, [cle]: "" });
  };

  /** À poser sur le formulaire : toute saisie efface l'erreur du champ touché. */
  const onChange = (e: FormEvent<HTMLFormElement>) => {
    const nom = (e.target as Element).getAttribute?.("name");
    if (nom) effacer(nom);
  };

  return { etat, erreurs, enCours, onSubmit, onChange, effacer, essai, envoyerDirect: (fd: FormData) => startTransition(() => envoyer(fd)) };
}

/** Le bandeau rouge en tête du formulaire, qui secoue à chaque essai manqué. */
export function ResumeErreurs({ erreurs, message, essai }: { erreurs: Erreurs; message?: string; essai: number }) {
  const n = Object.values(erreurs).filter(Boolean).length;
  const texte = message ?? (n ? `${n} champ${n > 1 ? "s" : ""} à corriger avant de valider.` : null);
  return (
    <div key={essai} className={`form-error-summary${texte ? " show" : ""}`} role="alert">
      {texte}
    </div>
  );
}

/** Un champ de la micro démo : libellé, contrôle, erreur dessous. */
export function Champ({ id, label, aide, erreur, children, className = "" }: { id?: string; label?: ReactNode; aide?: ReactNode; erreur?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field${erreur ? " has-error" : ""} ${className}`}>
      {label &&
        (id ? (
          <label htmlFor={id}>
            {label} {aide && <span className="hint">{aide}</span>}
          </label>
        ) : (
          <span className="label">
            {label} {aide && <span className="hint">{aide}</span>}
          </span>
        ))}
      {children}
      <div className="err" id={id ? `${id}-err` : undefined}>
        {erreur}
      </div>
    </div>
  );
}

/** Des boutons pilule à choix unique ou multiple (la classe `.choice` de la micro démo). */
export function Choix({ name, options, multiple = false, defaut, onChange }: { name: string; options: [string, string][]; multiple?: boolean; defaut?: string | string[]; onChange?: (v: string) => void }) {
  const coche = (v: string) => (Array.isArray(defaut) ? defaut.includes(v) : defaut === v);
  return (
    <div className="choice" role={multiple ? "group" : "radiogroup"}>
      {options.map(([v, l]) => (
        <label key={v}>
          <input type={multiple ? "checkbox" : "radio"} name={name} value={v} defaultChecked={coche(v)} onChange={() => onChange?.(v)} />
          <span>{l}</span>
        </label>
      ))}
    </div>
  );
}
