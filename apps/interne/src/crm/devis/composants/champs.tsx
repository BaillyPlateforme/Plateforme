"use client";
import { useId, useState } from "react";
import s from "../editeur.module.css";

/*
 * Les champs de la fenêtre Devis : nombres à la française (virgule), choix
 * segmentés, interrupteurs, sections. Tous contrôlés par l'état de l'éditeur.
 */

export const euros = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${String(Math.round(n * 100) / 100).replace(".", ",")} %`);

const versTexte = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
/** « 1 650,5 » → 1650.5 ; vide → null ; illisible → undefined (on garde la saisie sans la prendre). */
export function lireNombre(t: string): number | null | undefined {
  const x = t.replace(/[\s  €%]/g, "").replace(",", ".");
  if (x === "") return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : undefined;
}

export function Nombre({
  valeur, onChange, suffixe, placeholder, className, label, min, max, disabled, onEnter, id,
}: {
  valeur: number | null;
  onChange: (v: number | null) => void;
  suffixe?: string;
  placeholder?: string;
  className?: string;
  label?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  onEnter?: () => void;
  id?: string;
}) {
  const [texte, setTexte] = useState(versTexte(valeur));
  const [vu, setVu] = useState(valeur);
  const [focus, setFocus] = useState(false);
  // La valeur a changé ailleurs (calcul, report) : le champ suit, sauf pendant la frappe.
  if (!focus && valeur !== vu) {
    setVu(valeur);
    setTexte(versTexte(valeur));
  }
  return (
    <span className={`${s.nombre} ${className ?? ""}`} data-suffixe={suffixe ? "" : undefined}>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        value={texte}
        onFocus={(e) => { setFocus(true); e.currentTarget.select(); }}
        onBlur={() => { setFocus(false); setVu(valeur); setTexte(versTexte(valeur)); }}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
        onChange={(e) => {
          setTexte(e.target.value);
          let v = lireNombre(e.target.value);
          if (v === undefined) return;
          if (v != null && min != null && v < min) v = min;
          if (v != null && max != null && v > max) v = max;
          setVu(v);
          onChange(v);
        }}
      />
      {suffixe && <i aria-hidden>{suffixe}</i>}
    </span>
  );
}

/** Un champ et son libellé. `groupe` : plusieurs commandes (choix segmentés…), le libellé nomme le groupe. */
export function Champ({ label, aide, children, large, className, groupe }: { label: string; aide?: React.ReactNode; children: React.ReactNode; large?: 1 | 2 | 3 | 4 | 6; className?: string; groupe?: boolean }) {
  const contenu = (
    <>
      <span className={s.etiquette}>{label}</span>
      {children}
      {aide && <small className={s.aide}>{aide}</small>}
    </>
  );
  return groupe ? (
    <div className={`${s.champ} ${className ?? ""}`} data-large={large} role="group" aria-label={label}>{contenu}</div>
  ) : (
    <label className={`${s.champ} ${className ?? ""}`} data-large={large}>{contenu}</label>
  );
}

export function Segment<T extends string>({ valeur, options, onChange, label, petit }: { valeur: T; options: [T, string][]; onChange: (v: T) => void; label: string; petit?: boolean }) {
  return (
    <div className={s.segment} role="radiogroup" aria-label={label} data-petit={petit ? "" : undefined}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={valeur === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Interrupteur({ actif, onChange, label, aide }: { actif: boolean; onChange: (v: boolean) => void; label: string; aide?: string }) {
  const id = useId();
  return (
    <div className={s.interrupteur}>
      <button type="button" role="switch" id={id} aria-checked={actif} onClick={() => onChange(!actif)}>
        <i />
      </button>
      <label htmlFor={id}>
        <b>{label}</b>
        {aide && <small>{aide}</small>}
      </label>
    </div>
  );
}

export function Section({ surtitre, titre, texte, actions, children, id }: { surtitre?: string; titre: string; texte?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section className={s.carte} id={id}>
      <header className={s.carteTete}>
        <div>
          {surtitre && <p className={s.surtitre}>{surtitre}</p>}
          <h2>{titre}</h2>
          {texte && <p className={s.carteTexte}>{texte}</p>}
        </div>
        {actions && <div className={s.carteActions}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Une petite icône au trait (24 × 24). */
export function Pic({ d, taille = 16 }: { d: string; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
export const PICTOS = {
  poignee: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  corbeille: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  fleche: "M5 12h14M13 6l6 6-6 6",
  note: "M4 6h16M4 12h10M4 18h7",
  copie: "M8 8h11v11H8zM5 16V5h11",
  oeil: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  carte: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  annuler: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  coche: "M5 12.5l4.5 4.5L19 7.5",
};
