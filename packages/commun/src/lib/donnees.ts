"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chargement des données côté navigateur, à la manière d'Athena.
 *
 * Le principe : l'écran s'affiche tout de suite avec sa mise en page, la
 * requête part ensuite. Ce qu'on a déjà vu est servi depuis le cache mémoire
 * et rafraîchi en arrière-plan — revenir sur une page est instantané, sans
 * jamais montrer une valeur périmée plus de quelques secondes.
 *
 * Le cache vit dans le module : il meurt au rechargement de l'onglet, ce qui
 * est exactement la durée de vie souhaitée.
 */
const cache = new Map<string, unknown>();
const enCours = new Map<string, Promise<unknown>>();

export type Etat<T> = {
  donnees: T | null;
  chargement: boolean;
  erreur: string | null;
  recharger: () => void;
};

async function charger<T>(url: string): Promise<T> {
  const deja = enCours.get(url);
  if (deja) return deja as Promise<T>;

  const p = (async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = (await res.json()) as T;
    cache.set(url, json);
    return json;
  })().finally(() => enCours.delete(url));

  enCours.set(url, p);
  return p;
}

export function useRessource<T>(url: string | null): Etat<T> {
  // Le cache est la source de vérité ; l'état local ne sert qu'à redessiner.
  // Rien n'est posé dans un effet de façon synchrone : ce sont les retours de
  // requête, asynchrones, qui déclenchent le rendu suivant.
  const [, redessiner] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const vivant = useRef(true);

  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const lancer = useCallback(() => {
    if (!url) return;
    charger<T>(url)
      .then(() => {
        if (!vivant.current) return;
        setErreur(null);
        redessiner((v) => v + 1);
      })
      .catch((e: unknown) => {
        if (vivant.current) setErreur(e instanceof Error ? e.message : "Chargement impossible");
      });
  }, [url]);

  // Au montage et à chaque changement d'URL, puis sur demande globale.
  useEffect(() => {
    lancer();
    abonnes.add(lancer);
    return () => {
      abonnes.delete(lancer);
    };
  }, [lancer]);

  const donnees = url ? ((cache.get(url) as T) ?? null) : null;
  return { donnees, chargement: donnees === null && erreur === null, erreur, recharger: lancer };
}

/** Oublie ce qui est en cache : après une écriture, pour forcer la relecture. */
export function oublier(prefixe = "") {
  for (const cle of [...cache.keys()]) if (cle.startsWith(prefixe)) cache.delete(cle);
}

/**
 * Rafraîchissement global.
 *
 * Les données ne viennent plus du rendu serveur : `router.refresh()` ne les
 * touche plus. Le bouton de la barre du haut vide le cache et redemande à
 * chaque écran monté de relire sa ressource.
 */
const abonnes = new Set<() => void>();

export function rafraichirTout() {
  oublier();
  abonnes.forEach((f) => f());
}
