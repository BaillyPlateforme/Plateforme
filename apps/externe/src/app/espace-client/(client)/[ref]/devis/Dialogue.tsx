"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Icone } from "../../../_ui/Icone";
import "../../../_ui/devis.css";

/**
 * La fenêtre des gestes sur un devis (signer, ne pas retenir, demander une
 * modification ou un nouveau devis) : un <dialog> natif — le focus y reste,
 * Échap la ferme, la page dessous ne défile pas. Sur téléphone, elle monte du
 * bas de l'écran comme une feuille.
 *
 * `occupe` : un envoi est en cours, elle ne se ferme pas.
 */
export function Dialogue({
  ouvert,
  fermer,
  titre,
  occupe = false,
  className = "",
  children,
}: {
  ouvert: boolean;
  fermer: () => void;
  titre: string;
  occupe?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  // La page ne défile pas sous la fenêtre (iOS ne le fait pas de lui-même).
  useEffect(() => {
    if (!ouvert) return;
    const avant = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = avant;
    };
  }, [ouvert]);

  return (
    <dialog
      ref={ref}
      className={`dv-dlg ${className}`}
      aria-label={titre}
      onCancel={(e) => {
        e.preventDefault();
        if (!occupe) fermer();
      }}
      // Un clic sur le voile (hors du contenu) ferme.
      onClick={(e) => {
        if (e.target === e.currentTarget && !occupe) fermer();
      }}
    >
      <div className="dv-dlg-in">
        <button type="button" className="dv-dlg-x" onClick={fermer} disabled={occupe} aria-label="Fermer">
          <Icone nom="close" />
        </button>
        {children}
      </div>
    </dialog>
  );
}

/** L'écran de fin d'une réponse : c'est parti, la suite est dans la discussion. */
export function Transmis({ titre, texte, reference, fermer }: { titre: string; texte: string; reference: string; fermer: () => void }) {
  return (
    <div className="dv-fini" role="status">
      <span className="dv-fini-rond">
        <Icone nom="check" />
      </span>
      <h3>{titre}</h3>
      <p>{texte}</p>
      <div className="dv-fini-actions">
        <Link className="btn btn-dark" href={`/espace-client/${encodeURIComponent(reference)}/conseiller`}>
          <Icone nom="bulle" /> Voir la discussion
        </Link>
        <button type="button" className="btn btn-ghost" onClick={fermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}
