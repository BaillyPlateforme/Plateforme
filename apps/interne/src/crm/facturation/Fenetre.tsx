"use client";
import { useEffect, useRef } from "react";
import s from "./facturation.module.css";

/**
 * Une fenêtre modale (élément <dialog> natif : le focus y reste, Échap la
 * ferme). Montée ouverte, démontée fermée : chaque ouverture repart des
 * valeurs proposées.
 */
export default function Fenetre({
  surtitre,
  titre,
  sousTitre,
  large,
  onFermer,
  pied,
  children,
}: {
  surtitre: string;
  titre: string;
  sousTitre?: React.ReactNode;
  large?: boolean;
  onFermer: () => void;
  pied?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.fenetre}
      data-large={large || undefined}
      aria-label={titre}
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onClick={(e) => {
        // Un clic sur le voile (hors de la boîte) ferme la fenêtre.
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <header className={s.fenetreTete}>
        <div>
          <p>{surtitre}</p>
          <h2>{titre}</h2>
          {sousTitre && <span>{sousTitre}</span>}
        </div>
        <button type="button" className={s.fermer} onClick={onFermer} aria-label="Fermer">
          ×
        </button>
      </header>
      <div className={s.fenetreCorps}>{children}</div>
      {pied && <footer className={s.fenetrePied}>{pied}</footer>}
    </dialog>
  );
}

/** Un champ de fenêtre : libellé, aide facultative, largeur sur la grille de 12. */
export function Champ({ label, aide, l = 6, id, children }: { label: string; aide?: string; l?: 3 | 4 | 6 | 8 | 12; id?: string; children: React.ReactNode }) {
  return (
    <div className={s.champ} data-l={l}>
      <label htmlFor={id}>
        {label}
        {aide && <em> · {aide}</em>}
      </label>
      {children}
    </div>
  );
}
