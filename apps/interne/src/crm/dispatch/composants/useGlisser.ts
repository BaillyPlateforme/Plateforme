"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Le glisser-déposer des bulles, sur les événements de pointeur du
 * navigateur : la même mécanique pour la souris, le doigt et le stylet, sans
 * bibliothèque.
 *
 *  - À la souris, toute la bulle se saisit ; au doigt, seulement sa poignée
 *    (touch-action: none), pour que le reste de la bulle laisse défiler la
 *    colonne et la page.
 *  - Le déplacement ne commence qu'après quelques pixels : un simple clic
 *    ouvre la fiche du client.
 *  - Pendant le glisser, la colonne visée et le point d'insertion sont
 *    calculés sous le pointeur ; la planche, la colonne et la page défilent
 *    seules près des bords. Échap annule.
 */

export type Glisse = {
  ligneId: number;
  x: number;
  y: number;
  largeur: number;
  dx: number;
  dy: number;
  /** « attente » ou l'identifiant de la colonne visée ; null hors de toute colonne. */
  cible: string | null;
  /** Le rang d'insertion parmi les autres bulles de la colonne visée. */
  index: number;
  refuse: boolean;
};

type Rappels = {
  estVerrouillee: (cible: string) => boolean;
  onDepot: (ligneId: number, cible: string, index: number) => void;
  onRefus: (cible: string) => void;
};

type Moteur = { commencer: (e: React.PointerEvent<HTMLElement>, ligneId: number) => void; apresGlisser: () => boolean };

const SEUIL = 5;
const vitesse = (d: number) => Math.min(24, Math.max(3, d / 3));

export function useGlisser(planche: React.RefObject<HTMLDivElement | null>, rappels: Rappels) {
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const derniersRappels = useRef(rappels);
  const moteur = useRef<Moteur | null>(null);

  // Les écouteurs, posés une fois par glisser, lisent toujours les derniers rappels.
  useEffect(() => {
    derniersRappels.current = rappels;
  });

  useEffect(() => {
    let debut: { ligneId: number; x0: number; y0: number; dx: number; dy: number; largeur: number; actif: boolean } | null = null;
    let courant: Glisse | null = null;
    let pointeur = { x: 0, y: 0 };
    let boucle: number | null = null;
    let vientDeGlisser = false;

    const calculer = (): Glisse | null => {
      if (!debut) return null;
      const { x, y } = pointeur;
      const base = { ligneId: debut.ligneId, x, y, largeur: debut.largeur, dx: debut.dx, dy: debut.dy };
      const col = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-colonne]");
      if (!col) return { ...base, cible: null, index: 0, refuse: false };
      const cible = col.dataset.colonne!;
      const autres = [...col.querySelectorAll<HTMLElement>("[data-ligne]")].filter((b) => Number(b.dataset.ligne) !== base.ligneId);
      let index = autres.length;
      for (let i = 0; i < autres.length; i++) {
        const r = autres[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { ...base, cible, index, refuse: derniersRappels.current.estVerrouillee(cible) };
    };

    const mettreAJour = () => {
      courant = calculer();
      setGlisse(courant);
    };

    const defiler = () => {
      if (!debut?.actif) return;
      const { x, y } = pointeur;
      const p = planche.current;
      if (p) {
        const r = p.getBoundingClientRect();
        if (x < r.left + 80) p.scrollLeft -= vitesse(r.left + 80 - x);
        else if (x > r.right - 80) p.scrollLeft += vitesse(x - (r.right - 80));
      }
      const corps = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-corps]");
      if (corps) {
        const r = corps.getBoundingClientRect();
        if (y < r.top + 44) corps.scrollTop -= vitesse(r.top + 44 - y);
        else if (y > r.bottom - 44) corps.scrollTop += vitesse(y - (r.bottom - 44));
      }
      if (y < 100) window.scrollBy(0, -vitesse(100 - y));
      else if (y > window.innerHeight - 40) window.scrollBy(0, vitesse(y - (window.innerHeight - 40)));
      mettreAJour();
      boucle = requestAnimationFrame(defiler);
    };

    const deplacement = (e: PointerEvent) => {
      if (!debut) return;
      pointeur = { x: e.clientX, y: e.clientY };
      if (!debut.actif) {
        if (Math.hypot(e.clientX - debut.x0, e.clientY - debut.y0) < SEUIL) return;
        debut.actif = true;
        document.body.style.userSelect = "none";
        boucle = requestAnimationFrame(defiler);
      }
      e.preventDefault();
      mettreAJour();
    };

    const terminer = (deposer: boolean) => {
      window.removeEventListener("pointermove", deplacement);
      window.removeEventListener("pointerup", relache);
      window.removeEventListener("pointercancel", annule);
      window.removeEventListener("keydown", touche);
      if (boucle) cancelAnimationFrame(boucle);
      boucle = null;
      const etait = debut;
      const g = courant;
      debut = null;
      courant = null;
      if (!etait?.actif) return;
      document.body.style.userSelect = "";
      setGlisse(null);
      // Le clic qui suit un glisser ne doit pas ouvrir la fiche.
      vientDeGlisser = true;
      setTimeout(() => (vientDeGlisser = false), 0);
      if (!deposer || !g?.cible) return;
      if (g.refuse) derniersRappels.current.onRefus(g.cible);
      else derniersRappels.current.onDepot(g.ligneId, g.cible, g.index);
    };
    const relache = () => terminer(true);
    const annule = () => terminer(false);
    const touche = (e: KeyboardEvent) => e.key === "Escape" && terminer(false);

    moteur.current = {
      commencer: (e, ligneId) => {
        if (e.button !== 0 || debut) return;
        const surPoignee = !!(e.target as HTMLElement).closest("[data-prise]");
        if (e.pointerType !== "mouse" && !surPoignee) return;
        const r = e.currentTarget.getBoundingClientRect();
        debut = { ligneId, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, largeur: r.width, actif: false };
        pointeur = { x: e.clientX, y: e.clientY };
        window.addEventListener("pointermove", deplacement, { passive: false });
        window.addEventListener("pointerup", relache);
        window.addEventListener("pointercancel", annule);
        window.addEventListener("keydown", touche);
      },
      apresGlisser: () => vientDeGlisser,
    };
    // Un démontage en plein glisser ne laisse aucun écouteur derrière lui.
    return () => terminer(false);
  }, [planche]);

  const commencer = useCallback((e: React.PointerEvent<HTMLElement>, ligneId: number) => moteur.current?.commencer(e, ligneId), []);
  /** Vrai juste après un glisser : le clic qui le termine n'ouvre pas la fiche. */
  const apresGlisser = useCallback(() => moteur.current?.apresGlisser() ?? false, []);

  return { glisse, commencer, apresGlisser };
}
