"use client";
import { useEffect, useRef, useState } from "react";
import s from "../editeur.module.css";

/*
 * La boîte « Quitter le devis » (Céline, 16/11/2026 : « Peux-tu ajouter :
 * Enregistrer – Annuler ? ») : quand on quitte la fenêtre Devis par un lien
 * de l'app avec des modifications non enregistrées. Trois réponses :
 * enregistrer puis poursuivre, quitter sans enregistrer, ou rester (Annuler,
 * Échap, clic hors de la boîte). Élément <dialog> natif : le focus y reste.
 */
export default function FenetreQuitter({
  onEnregistrer, onQuitter, onAnnuler,
}: {
  onEnregistrer: () => void;
  onQuitter: () => void;
  onAnnuler: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // « Enregistrer » cliqué : la boîte attend l'enregistrement, puis la navigation (ou se ferme sur une erreur).
  const [enCours, setEnCours] = useState(false);
  const enregistrer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    enregistrer.current?.focus();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.quitter}
      aria-labelledby="quitter-devis-titre"
      aria-describedby="quitter-devis-texte"
      onCancel={(e) => { e.preventDefault(); if (!enCours) onAnnuler(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !enCours) onAnnuler(); }}
    >
      <p className={s.surtitre}>Devis non enregistré</p>
      <h2 id="quitter-devis-titre">Enregistrer avant de quitter ?</h2>
      <p id="quitter-devis-texte" className={s.carteTexte}>Des modifications du devis ne sont pas enregistrées.</p>
      <div className={s.quitterActions}>
        <button type="button" className={s.boutonFantome} onClick={onAnnuler} disabled={enCours}>Annuler</button>
        <button type="button" className={s.boutonDoux} onClick={onQuitter} disabled={enCours}>Quitter sans enregistrer</button>
        <button type="button" ref={enregistrer} className={s.boutonPlein} onClick={() => { setEnCours(true); onEnregistrer(); }} disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </dialog>
  );
}
