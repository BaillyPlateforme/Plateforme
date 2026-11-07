"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Les apparitions au défilement de la micro démo. Ce qui est déjà à l'écran
 * reste visible ; le reste s'efface, puis apparaît à mesure qu'on descend.
 * Rien n'est masqué tant que ce composant n'a pas tourné : sans JavaScript,
 * la page s'affiche entière.
 */
export function Apparitions() {
  const chemin = usePathname();

  useEffect(() => {
    const racine = document.documentElement;
    const tous = () => [...document.querySelectorAll<HTMLElement>(".ec .apparait:not(.vu)")];
    if (!("IntersectionObserver" in window)) {
      tous().forEach((el) => el.classList.add("vu"));
      return;
    }
    // Ce qui est déjà à l'écran est marqué vu AVANT d'armer les apparitions : pas de clignotement.
    if (!racine.classList.contains("ec-anim")) {
      const h = window.innerHeight;
      tous().forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < h && r.bottom > 0) el.classList.add("vu");
      });
      racine.classList.add("ec-anim");
    }
    const io = new IntersectionObserver(
      (entrees) =>
        entrees.forEach((x) => {
          if (x.isIntersecting) {
            x.target.classList.add("vu");
            io.unobserve(x.target);
          }
        }),
      { threshold: 0.12 },
    );
    const observer = () => tous().forEach((el) => io.observe(el));
    observer();
    // Ce qu'un formulaire ajoute ensuite (étape suivante, confirmation) apparaît aussi.
    const mo = new MutationObserver(observer);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [chemin]);

  return null;
}
