"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Operation } from "@/lib/visite/regles";
import { appliquerOp, enfiler, type EtatSaisie } from "./etat";

/*
 * L'enregistrement continu de la saisie.
 *
 * Chaque geste devient une opération, appliquée aussitôt à l'écran et mise en
 * file. La file part au serveur par lots, quelques instants après le dernier
 * geste ; tant que le serveur n'a pas répondu, elle reste dans le stockage
 * de l'onglet. Rien ne se perd donc si l'onglet se ferme, si la tablette se
 * met en veille ou si le réseau tombe : au retour sur la visite, les
 * opérations restées en file sont rejouées sur l'état du serveur, puis
 * envoyées. Quand l'onglet passe en arrière-plan, la file part aussi par
 * navigator.sendBeacon, qui survit à la fermeture.
 *
 * Les opérations sont rejouables sans effet de bord (voir operations.ts) :
 * un lot envoyé deux fois ne fait rien de plus qu'une.
 */

export type Statut = "enregistre" | "modifie" | "envoi" | "hors_ligne" | "erreur" | "session" | "signee";

const DELAI_MS = 700;
const ATTENTES_MS = [2_000, 5_000, 10_000, 20_000];

const cleStockage = (visiteId: number) => `bailly-visite-${visiteId}-file`;

function lireStockage(visiteId: number): Operation[] {
  try {
    const brut = localStorage.getItem(cleStockage(visiteId));
    const lu = brut ? (JSON.parse(brut) as { ops?: Operation[] }) : null;
    return Array.isArray(lu?.ops) ? lu.ops : [];
  } catch {
    return [];
  }
}

function ecrireStockage(visiteId: number, ops: Operation[]) {
  try {
    if (ops.length) localStorage.setItem(cleStockage(visiteId), JSON.stringify({ ops, le: Date.now() }));
    else localStorage.removeItem(cleStockage(visiteId));
  } catch {
    // Stockage plein ou interdit (navigation privée) : la file reste en mémoire.
  }
}

export function useEnregistrement(visiteId: number, initial: EtatSaisie, volumeInitial: number) {
  const url = `/api/visites/${visiteId}/operations`;
  const [etat, setEtat] = useState(initial);
  const [statut, setStatut] = useState<Statut>("enregistre");
  const [enAttente, setEnAttente] = useState(0);
  const [dernier, setDernier] = useState<number | null>(null);
  const [volumeServeur, setVolumeServeur] = useState(volumeInitial);
  const [enLigne, setEnLigne] = useState(true);

  const attente = useRef<Operation[]>([]);
  const enVol = useRef<Operation[]>([]);
  const minuteur = useRef<number | null>(null);
  const essai = useRef(0);

  const persister = useCallback(() => {
    ecrireStockage(visiteId, [...enVol.current, ...attente.current]);
    setEnAttente(enVol.current.length + attente.current.length);
  }, [visiteId]);

  const envoyerRef = useRef<() => void>(() => undefined);

  const planifier = useCallback((ms: number) => {
    if (minuteur.current) window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => envoyerRef.current(), ms);
  }, []);

  const envoyer = useCallback(async () => {
    if (enVol.current.length || !attente.current.length) return;
    enVol.current = attente.current;
    attente.current = [];
    persister();
    setStatut("envoi");
    let r: Response | null = null;
    try {
      r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: enVol.current }), keepalive: true });
    } catch {
      r = null;
    }
    if (r && r.ok) {
      const corps = (await r.json().catch(() => null)) as { volume?: number } | null;
      if (typeof corps?.volume === "number") setVolumeServeur(corps.volume);
      enVol.current = [];
      essai.current = 0;
      persister();
      setDernier(Date.now());
      if (attente.current.length) {
        setStatut("modifie");
        planifier(150);
      } else setStatut("enregistre");
      return;
    }
    if (r && (r.status === 409 || r.status === 404)) {
      // Signée entre-temps (une autre tablette) : plus rien ne s'enregistre.
      enVol.current = [];
      attente.current = [];
      persister();
      setStatut("signee");
      return;
    }
    if (r && r.status === 401) {
      // La session est tombée : la file reste sur la tablette, elle partira après la reconnexion.
      attente.current = [...enVol.current, ...attente.current];
      enVol.current = [];
      persister();
      setStatut("session");
      return;
    }
    if (r && r.status === 400) {
      // Un lot illisible ne passera jamais : on l'écarte plutôt que de bloquer la file.
      enVol.current = [];
      persister();
      setStatut("erreur");
      return;
    }
    // Réseau absent ou serveur indisponible : on remet le lot en tête, et on réessaie.
    let file = enVol.current;
    for (const op of attente.current) file = enfiler(file, op);
    attente.current = file;
    enVol.current = [];
    persister();
    setStatut(navigator.onLine ? "erreur" : "hors_ligne");
    planifier(ATTENTES_MS[Math.min(essai.current++, ATTENTES_MS.length - 1)]);
  }, [persister, planifier, url]);

  useEffect(() => {
    envoyerRef.current = () => void envoyer();
  }, [envoyer]);

  /** Un geste : appliqué à l'écran, mis en file, envoyé dans un instant. */
  const agir = useCallback(
    (op: Operation) => {
      setEtat((e) => appliquerOp(e, op));
      attente.current = enfiler(attente.current, op);
      persister();
      setStatut((s) => (s === "session" || s === "signee" ? s : "modifie"));
      planifier(DELAI_MS);
    },
    [persister, planifier],
  );

  // La reprise : ce qui était resté en file sur cette tablette est rejoué, puis envoyé.
  useEffect(() => {
    const restes = lireStockage(visiteId);
    if (!restes.length) return;
    attente.current = restes;
    // Le stockage de l'onglet est une source extérieure : l'état suit au tour suivant, une fois la page montée.
    const t = window.setTimeout(() => {
      setEtat((e) => restes.reduce(appliquerOp, e));
      persister();
      planifier(300);
    }, 0);
    return () => window.clearTimeout(t);
  }, [visiteId, persister, planifier]);

  // Le réseau : l'état se lit sur la tablette, et le retour du réseau relance l'envoi.
  useEffect(() => {
    const maj = () => {
      setEnLigne(navigator.onLine);
      if (navigator.onLine) {
        essai.current = 0;
        planifier(200);
      } else setStatut((s) => (s === "enregistre" ? s : "hors_ligne"));
    };
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, [planifier]);

  // L'onglet passe en arrière-plan ou se ferme : la file part par balise, qui survit à la fermeture.
  useEffect(() => {
    const balise = () => {
      const ops = [...enVol.current, ...attente.current];
      if (!ops.length || typeof navigator.sendBeacon !== "function") return;
      navigator.sendBeacon(url, new Blob([JSON.stringify({ ops })], { type: "text/plain" }));
    };
    const visibilite = () => {
      if (document.visibilityState === "hidden") balise();
    };
    window.addEventListener("pagehide", balise);
    document.addEventListener("visibilitychange", visibilite);
    return () => {
      window.removeEventListener("pagehide", balise);
      document.removeEventListener("visibilitychange", visibilite);
    };
  }, [url]);

  /** Attend que la file soit vide (avant une photo, avant le compte-rendu). Rend vrai si tout est enregistré. */
  const vider = useCallback(
    async (delaiMs = 10_000) => {
      const fin = Date.now() + delaiMs;
      while (Date.now() < fin) {
        if (!attente.current.length && !enVol.current.length) return true;
        if (attente.current.length && !enVol.current.length) await envoyer();
        else await new Promise((r) => setTimeout(r, 120));
        if (statut === "session" || statut === "signee") return false;
      }
      return !attente.current.length && !enVol.current.length;
    },
    [envoyer, statut],
  );

  return { etat, agir, statut, enAttente, dernier, volumeServeur, enLigne, vider };
}
