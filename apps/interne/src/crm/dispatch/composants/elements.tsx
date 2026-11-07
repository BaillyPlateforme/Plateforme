"use client";

import { useEffect, useRef, useState } from "react";
import { jauge, m3 } from "../outils";
import { Picto, type NomPicto } from "./Picto";
import s from "./dispatch.module.css";

/*
 * Les pièces communes des écrans du dispatch : fenêtre modale, menu
 * déroulant, jauge de remplissage, message éphémère, demande de
 * confirmation.
 */

/** Une fenêtre modale (élément <dialog> natif : focus gardé, Échap ferme). Montée ouverte, démontée fermée. */
export function Fenetre({
  titre,
  sousTitre,
  picto,
  ton,
  taille,
  pied,
  onFermer,
  children,
}: {
  titre: string;
  sousTitre?: React.ReactNode;
  picto?: NomPicto;
  ton?: "ambre" | "rose";
  taille?: "large" | "etroite";
  pied?: React.ReactNode;
  onFermer: () => void;
  children?: React.ReactNode;
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
      className={`${s.fenetre} ${taille ? s[taille] : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onClick={(e) => {
        // Un clic sur le fond (hors de la fenêtre) la ferme.
        if (e.target === e.currentTarget) onFermer();
      }}
      aria-label={titre}
    >
      <div className={s.fenetreTete}>
        {picto && (
          <span className={`${s.pastille} ${ton ? s[ton] : ""}`}>
            <Picto nom={picto} taille={21} />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{titre}</h2>
          {sousTitre && <p>{sousTitre}</p>}
        </div>
        <button type="button" className={s.rond} onClick={onFermer} aria-label="Fermer">
          <Picto nom="fermer" taille={18} />
        </button>
      </div>
      {children}
      {pied && <div className={s.fenetrePied}>{pied}</div>}
    </dialog>
  );
}

/** Un menu déroulant : un bouton, une liste ; fermé au clic à côté ou à la touche Échap. */
export function Menu({ bouton, label, children, className }: { bouton: React.ReactNode; label: string; children: (fermer: () => void) => React.ReactNode; className?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOuvert(false);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);
  return (
    <div className={s.menu} ref={ref}>
      <button type="button" className={className ?? s.rond} aria-label={label} aria-haspopup="menu" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {bouton}
      </button>
      {ouvert && (
        <div className={s.menuListe} role="menu">
          {children(() => setOuvert(false))}
        </div>
      )}
    </div>
  );
}

/** La jauge d'une colonne : volume sur capacité, en couleur selon le remplissage. */
export function Jauge({ volume, capacite, compacte }: { volume: number; capacite: number | null; compacte?: boolean }) {
  const j = jauge(volume, capacite);
  const classe = j.etat === "depasse" ? s.depasse : j.etat === "plein" ? s.plein : "";
  if (j.pct == null)
    return (
      <div className={s.jauge}>
        <div className={s.chiffres}>
          <span>
            <b>{m3(volume)}</b> · sans limite de volume
          </span>
        </div>
      </div>
    );
  return (
    <div className={`${s.jauge} ${classe}`} title={`${Math.round(j.pct)} % de la capacité`}>
      <div className={s.barre} role="meter" aria-valuemin={0} aria-valuemax={capacite ?? 0} aria-valuenow={volume} aria-label="Remplissage">
        <i style={{ width: `${Math.min(100, j.pct)}%` }} />
      </div>
      <div className={s.chiffres}>
        <span>
          <b>{m3(volume)}</b> / {m3(capacite)}
        </span>
        {!compacte && (
          <em>
            {j.etat === "depasse" ? `Dépasse de ${m3(-(j.reste ?? 0))}` : j.reste === 0 ? "Complet" : `${Math.round(j.pct)} % · reste ${m3(j.reste)}`}
          </em>
        )}
        {compacte && <em>{Math.round(j.pct)} %</em>}
      </div>
    </div>
  );
}

export type Message = { texte: string; ton?: "ok" | "erreur" };

/** Un message éphémère en bas de l'écran ; il s'efface seul. */
export function Toast({ message, onFermer }: { message: Message | null; onFermer: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onFermer, message.ton === "erreur" ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [message, onFermer]);
  if (!message) return null;
  return (
    <div className={`${s.toast} ${message.ton === "erreur" ? s.erreur : ""}`} role={message.ton === "erreur" ? "alert" : "status"}>
      <Picto nom={message.ton === "erreur" ? "alerte" : "coche"} taille={17} />
      <span>{message.texte}</span>
      <button type="button" onClick={onFermer} aria-label="Fermer le message">
        <Picto nom="fermer" taille={14} />
      </button>
    </div>
  );
}

export type Demande = { titre: string; texte: React.ReactNode; libelle: string; danger?: boolean; picto?: NomPicto; action: () => void };

/** Une demande de confirmation, dans la fenêtre modale commune. */
export function Confirmation({ demande, onFermer }: { demande: Demande; onFermer: () => void }) {
  return (
    <Fenetre
      titre={demande.titre}
      picto={demande.picto ?? (demande.danger ? "alerte" : "cadenas")}
      ton={demande.danger ? "rose" : undefined}
      taille="etroite"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className={s.bouton} onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className={demande.danger ? s.boutonDanger : s.boutonPlein}
            autoFocus
            onClick={() => {
              onFermer();
              demande.action();
            }}
          >
            {demande.libelle}
          </button>
        </>
      }
    >
      <div className={s.fenetreCorps} style={{ fontSize: 14, lineHeight: 1.6, color: "#3b3753" }}>
        {demande.texte}
      </div>
    </Fenetre>
  );
}
