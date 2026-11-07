"use client";

import { useEffect, useRef } from "react";
import s from "./parcours.module.css";

/**
 * Les étapes de la bande, quand elles débordent (écran étroit) : elles
 * défilent à l'horizontale dans leur rangée, sans changer la hauteur du
 * bandeau, et l'étape en cours est amenée au centre à l'ouverture.
 */
export default function DefileEtapes({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const boite = ref.current;
    const courante = boite?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!boite || !courante || boite.scrollWidth <= boite.clientWidth) return;
    boite.scrollLeft = courante.offsetLeft - (boite.clientWidth - courante.offsetWidth) / 2;
  }, []);
  return (
    <div ref={ref} className={s.defile}>
      {children}
    </div>
  );
}
