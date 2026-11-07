"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import s from "./menu-actions.module.css";

/**
 * Le menu « ⋯ » d'un bandeau : les gestes secondaires d'une page, pour que
 * les boutons visibles tiennent sur deux lignes au plus. Le panneau s'ouvre
 * par-dessus la page (portail), sous le bouton, et se ferme au clic à côté,
 * à Échap ou après un choix. Les enfants sont des formulaires ou des liens.
 */
export default function MenuActions({ label = "Plus d’actions", children }: { label?: string; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState<{ x: number; y: number } | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panneau.current?.contains(t) && !bouton.current?.contains(t)) setOuvert(null);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(null);
    const fermer = () => setOuvert(null);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [ouvert]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        data-ton="contour"
        aria-label={label}
        aria-expanded={!!ouvert}
        title={label}
        onClick={() => {
          if (ouvert) return setOuvert(null);
          const r = bouton.current!.getBoundingClientRect();
          setOuvert({ x: Math.min(r.right, window.innerWidth - 12), y: r.bottom + 8 });
        }}
      >
        ⋯
      </button>
      {ouvert &&
        createPortal(
          <div
            ref={panneau}
            className={s.panneau}
            style={{ top: ouvert.y, right: window.innerWidth - ouvert.x }}
            role="menu"
            onClick={(e) => {
              // Un choix fait referme le menu (le formulaire part quand même).
              if ((e.target as HTMLElement).closest("button, a")) setTimeout(() => setOuvert(null), 0);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
