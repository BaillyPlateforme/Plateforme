"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Operation } from "@/lib/visite/regles";
import { appliquerOp, enfiler, type EtatSaisie } from "./etat";
import {
  cleFile, cleInstantane, cleNonEnregistrees, decrireOperation, etatDeDepart, issueEnvoi, prochainLot, remettreEnTete, type Instantane, type Issue,
} from "./file";

/*
 * L'enregistrement continu de la saisie.
 *
 * Chaque geste devient une opération, appliquée aussitôt à l'écran et mise en
 * file. La file part au serveur par lots, quelques instants après le dernier
 * geste ; tant que le serveur n'a pas répondu, elle reste dans le stockage
 * de la tablette (localStorage). Rien ne se perd donc si l'onglet se ferme, si
 * la tablette se met en veille ou si le réseau tombe chez le client : au
 * retour sur la visite, les opérations restées en file sont rejouées sur
 * l'état du serveur, puis envoyées ; au retour du réseau, elles partent
 * d'elles-mêmes, dans l'ordre (file.ts). Quand l'onglet passe en
 * arrière-plan, la file part aussi par navigator.sendBeacon, qui survit à la
 * fermeture.
 *
 * Les opérations sont rejouables sans effet de bord (voir operations.ts) :
 * un lot envoyé deux fois ne fait rien de plus qu'une.
 *
 * La tablette garde aussi la dernière vue de la saisie (l'instantané) : une
 * page servie sans réseau repart de là (voir file.ts, etatDeDepart).
 */

export type Statut = "enregistre" | "modifie" | "envoi" | "hors_ligne" | "erreur" | "session" | "signee";

/** Une modification que le serveur n'a pas prise : compte-rendu signé entre-temps, ou opération refusée. */
export type NonEnregistree = { description: string; raison: "fige" | "illisible"; le: number; op: Operation };

const DELAI_MS = 700;
const ATTENTES_MS = [2_000, 5_000, 10_000, 20_000];
/** fetch keepalive et sendBeacon refusent un corps de plus de 64 Ko. */
const PLAFOND_KEEPALIVE = 60_000;

function lire<T>(cle: string): T | null {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: unknown) {
  try {
    if (valeur == null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Stockage plein ou interdit (navigation privée) : la file reste en mémoire.
  }
}

function lireFile(visiteId: number): Operation[] {
  const lu = lire<{ ops?: Operation[] }>(cleFile(visiteId));
  return Array.isArray(lu?.ops) ? lu.ops : [];
}

export interface ContexteEnregistrement<E> {
  /** L'heure du serveur à laquelle la page a été lue (visites.maj_le). */
  majLe: string | null;
  /** Qui tient la tablette : une vue gardée par un autre compte n'est pas reprise. */
  utilisateur: number | null;
  /** De quoi rouvrir la visite sans réseau, gardé avec l'instantané. */
  entete?: E;
}

export function useEnregistrement<E = unknown>(visiteId: number, initial: EtatSaisie, volumeInitial: number, contexte: ContexteEnregistrement<E>) {
  const url = `/api/visites/${visiteId}/operations`;
  const [etat, setEtat] = useState(initial);
  const [statut, setStatutEtat] = useState<Statut>("enregistre");
  const [enAttente, setEnAttente] = useState(0);
  const [dernier, setDernier] = useState<number | null>(null);
  const [volumeServeur, setVolumeServeur] = useState(volumeInitial);
  const [enLigne, setEnLigne] = useState(true);
  const [nonEnregistrees, setNonEnregistrees] = useState<NonEnregistree[]>([]);
  const [origine, setOrigine] = useState<"serveur" | "tablette">("serveur");

  const attente = useRef<Operation[]>([]);
  const enVol = useRef<Operation[]>([]);
  const minuteur = useRef<number | null>(null);
  const essai = useRef(0);
  const unParUn = useRef(false);
  const statutRef = useRef<Statut>("enregistre");
  const etatRef = useRef(initial);
  const majServeur = useRef(contexte.majLe);
  const ctx = useRef(contexte);
  /** L'état lu sur le serveur, à l'ouverture de la page. */
  const serveur = useRef(initial);

  useEffect(() => {
    ctx.current = contexte;
  });

  const setStatut = useCallback((s: Statut | ((x: Statut) => Statut)) => {
    const v = typeof s === "function" ? s(statutRef.current) : s;
    statutRef.current = v;
    setStatutEtat(v);
  }, []);

  const persister = useCallback(() => {
    ecrire(cleFile(visiteId), enVol.current.length + attente.current.length ? { ops: [...enVol.current, ...attente.current], le: Date.now() } : null);
    setEnAttente(enVol.current.length + attente.current.length);
  }, [visiteId]);

  /** La vue de la saisie, gardée sur la tablette : ce qui est à l'écran, et l'heure du serveur du dernier lot confirmé. */
  const garderInstantane = useCallback(() => {
    const i: Instantane<E> = { v: 1, etat: etatRef.current, majLe: majServeur.current, le: Date.now(), utilisateur: ctx.current.utilisateur, entete: ctx.current.entete };
    ecrire(cleInstantane(visiteId), i);
  }, [visiteId]);

  const mettreDeCote = useCallback(
    (ops: Operation[], raison: NonEnregistree["raison"]) => {
      if (!ops.length) return;
      const lues = lire<NonEnregistree[]>(cleNonEnregistrees(visiteId)) ?? [];
      const ajout = ops.map((op) => ({ description: decrireOperation(op, etatRef.current), raison, le: Date.now(), op }));
      const toutes = [...lues, ...ajout];
      ecrire(cleNonEnregistrees(visiteId), toutes);
      setNonEnregistrees(toutes);
    },
    [visiteId],
  );

  const envoyerRef = useRef<() => void>(() => undefined);

  const planifier = useCallback((ms: number) => {
    if (minuteur.current) window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => envoyerRef.current(), ms);
  }, []);

  /** Envoie le prochain lot. Rend l'issue (null : rien à envoyer, ou un lot déjà en route). */
  const envoyer = useCallback(async (): Promise<Issue | null> => {
    if (enVol.current.length || !attente.current.length) return null;
    if (statutRef.current === "signee") return null;
    const [lot, reste] = prochainLot(attente.current, unParUn.current);
    enVol.current = lot;
    attente.current = reste;
    persister();
    setStatut("envoi");
    const corps = JSON.stringify({ ops: lot });
    let r: Response | null = null;
    try {
      r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: corps, keepalive: corps.length < PLAFOND_KEEPALIVE });
    } catch {
      r = null;
    }
    const issue = issueEnvoi(r ? r.status : null);
    switch (issue) {
      case "ok": {
        const rep = (await r!.json().catch(() => null)) as { volume?: number; majLe?: string } | null;
        if (typeof rep?.volume === "number") setVolumeServeur(rep.volume);
        if (typeof rep?.majLe === "string") majServeur.current = rep.majLe;
        enVol.current = [];
        essai.current = 0;
        if (!attente.current.length) unParUn.current = false;
        persister();
        garderInstantane();
        setDernier(Date.now());
        if (attente.current.length) {
          setStatut("modifie");
          planifier(150);
        } else setStatut("enregistre");
        break;
      }
      case "fige":
        // Signée ailleurs (ou visite abandonnée) : plus rien ne s'enregistre. Les modifications restent sur la tablette, montrées.
        mettreDeCote([...enVol.current, ...attente.current], "fige");
        enVol.current = [];
        attente.current = [];
        persister();
        setStatut("signee");
        break;
      case "session":
        // La session est tombée : la file reste sur la tablette, elle repartira après la reconnexion.
        attente.current = remettreEnTete(enVol.current, attente.current);
        enVol.current = [];
        persister();
        setStatut("session");
        planifier(15_000);
        break;
      case "illisible":
        if (lot.length > 1) {
          // Une opération du lot est refusée : elles repartent une à une, pour n'écarter que la fautive.
          unParUn.current = true;
          attente.current = remettreEnTete(enVol.current, attente.current);
          enVol.current = [];
          persister();
          planifier(50);
        } else {
          mettreDeCote(enVol.current, "illisible");
          enVol.current = [];
          if (!attente.current.length) unParUn.current = false;
          persister();
          setStatut(attente.current.length ? "modifie" : "erreur");
          if (attente.current.length) planifier(50);
        }
        break;
      default:
        // Réseau absent ou serveur indisponible : le lot repart en tête, et on réessaie.
        attente.current = remettreEnTete(enVol.current, attente.current);
        enVol.current = [];
        persister();
        setStatut(issue === "reseau" ? "hors_ligne" : "erreur");
        planifier(ATTENTES_MS[Math.min(essai.current++, ATTENTES_MS.length - 1)]);
    }
    return issue;
  }, [garderInstantane, mettreDeCote, persister, planifier, setStatut, url]);

  useEffect(() => {
    envoyerRef.current = () => void envoyer();
  }, [envoyer]);

  /** Un geste : appliqué à l'écran, mis en file, envoyé dans un instant. */
  const agir = useCallback(
    (op: Operation) => {
      setEtat((e) => appliquerOp(e, op));
      attente.current = enfiler(attente.current, op);
      persister();
      setStatut((s) => (s === "session" || s === "signee" || s === "hors_ligne" ? s : "modifie"));
      planifier(statutRef.current === "hors_ligne" ? 3_000 : DELAI_MS);
    },
    [persister, planifier, setStatut],
  );

  // L'instantané suit l'écran, un instant après le dernier geste ; il est aussi écrit dès la reprise (plus bas), et
  // quand la page passe en arrière-plan ou se ferme.
  const premier = useRef(true);
  useEffect(() => {
    etatRef.current = etat;
    if (premier.current) {
      premier.current = false;
      return;
    }
    const t = window.setTimeout(garderInstantane, 400);
    return () => window.clearTimeout(t);
  }, [etat, garderInstantane]);

  // La reprise : ce qui était resté en file sur cette tablette est rejoué, puis envoyé.
  useEffect(() => {
    const restes = lireFile(visiteId);
    const lu = lire<Instantane<E>>(cleInstantane(visiteId));
    const u = ctx.current.utilisateur;
    const inst = lu && lu.v === 1 && lu.etat && (lu.utilisateur == null || u == null || lu.utilisateur === u) ? lu : null;
    const ecartees = lire<NonEnregistree[]>(cleNonEnregistrees(visiteId)) ?? [];
    // Le stockage de la tablette est une source extérieure : l'état suit au tour suivant, une fois la page montée.
    const t = window.setTimeout(() => {
      if (ecartees.length) setNonEnregistrees(ecartees);
      const d = etatDeDepart(serveur.current, majServeur.current, inst, restes);
      if (d.origine === "tablette") {
        majServeur.current = inst!.majLe;
        setOrigine("tablette");
      }
      if (d.origine === "tablette" || restes.length) {
        etatRef.current = d.etat;
        setEtat(d.etat);
      }
      // La vue de départ est gardée tout de suite : une page rechargée aussitôt la retrouve.
      garderInstantane();
      if (restes.length) {
        attente.current = restes;
        persister();
        planifier(300);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [visiteId, persister, planifier, garderInstantane]);

  // Le réseau : l'état se lit sur la tablette, et le retour du réseau relance l'envoi.
  useEffect(() => {
    const maj = () => {
      setEnLigne(navigator.onLine);
      if (navigator.onLine) {
        essai.current = 0;
        if (statutRef.current === "hors_ligne") setStatut(attente.current.length ? "modifie" : "enregistre");
        planifier(200);
      } else setStatut((s) => (s === "session" || s === "signee" ? s : "hors_ligne"));
    };
    const revenir = () => {
      if (document.visibilityState === "visible" && attente.current.length) planifier(200);
    };
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    document.addEventListener("visibilitychange", revenir);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
      document.removeEventListener("visibilitychange", revenir);
    };
  }, [planifier, setStatut]);

  // L'onglet passe en arrière-plan ou se ferme : la file part par balise, qui survit à la fermeture.
  useEffect(() => {
    const balise = () => {
      garderInstantane();
      if (statutRef.current === "signee" || typeof navigator.sendBeacon !== "function") return;
      // Les opérations dans l'ordre, tant que le corps tient dans la balise ; le reste partira au retour.
      const ops: Operation[] = [];
      for (const op of [...enVol.current, ...attente.current].slice(0, 200)) {
        if (JSON.stringify({ ops: [...ops, op] }).length > PLAFOND_KEEPALIVE) break;
        ops.push(op);
      }
      if (ops.length) navigator.sendBeacon(url, new Blob([JSON.stringify({ ops })], { type: "text/plain" }));
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
  }, [url, garderInstantane]);

  /**
   * Attend que la file soit vide (avant une photo, avant le compte-rendu).
   * Rend vrai si tout est enregistré ; faux dès que le réseau manque, sans
   * insister : la file repartira d'elle-même.
   */
  const vider = useCallback(
    async (delaiMs = 10_000) => {
      const fin = Date.now() + delaiMs;
      while (Date.now() < fin) {
        if (!attente.current.length && !enVol.current.length) return true;
        if (statutRef.current === "session" || statutRef.current === "signee") return false;
        if (attente.current.length && !enVol.current.length) {
          const issue = await envoyer();
          if (issue === "reseau" || issue === "serveur" || issue === "session" || issue === "fige") return false;
        } else await new Promise((r) => setTimeout(r, 120));
      }
      return !attente.current.length && !enVol.current.length;
    },
    [envoyer],
  );

  /** Le commercial a transmis la liste au bureau : elle est effacée de la tablette. */
  const oublierNonEnregistrees = useCallback(() => {
    ecrire(cleNonEnregistrees(visiteId), null);
    setNonEnregistrees([]);
  }, [visiteId]);

  return { etat, agir, statut, enAttente, dernier, volumeServeur, enLigne, vider, nonEnregistrees, oublierNonEnregistrees, origine };
}
