"use client";

import { useEffect, useRef, type ReactNode } from "react";
import s from "./ajuster.module.css";

/**
 * Le document A4 montré au client (page de signature, devis complet) : sur
 * un écran plus étroit que la feuille, il est réduit pour tenir en largeur,
 * au lieu de défiler de côté. Rien ne change à l'impression ni au PDF.
 */
export function AjusterA4({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let largeurVue = -1;
    const ajuster = () => {
      if (el.clientWidth === largeurVue) return;
      largeurVue = el.clientWidth;
      el.style.setProperty("--zoom", "1");
      const feuille = Math.max(0, ...Array.from(el.children).map((c) => (c as HTMLElement).offsetWidth));
      el.style.setProperty("--zoom", feuille > largeurVue && largeurVue > 0 ? (largeurVue / feuille).toFixed(4) : "1");
    };
    ajuster();
    const ro = new ResizeObserver(ajuster);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={s.a4}>
      {children}
    </div>
  );
}
