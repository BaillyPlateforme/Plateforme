import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { modeDonnees, type ModeDonnees } from "./config";
import { amorcer, donneesVides, VERSION_DONNEES } from "./seed";
import type { Donnees } from "./types";

/*
 * Où vivent les données de l'espace client.
 *
 * Une seule interface, deux réalisations, choisies par ESPACE_CLIENT_DONNEES :
 *
 * - la démonstration (par défaut) : un document en mémoire, amorcé par les
 *   profils A à D de la v0. Il repart de zéro au redémarrage du serveur, ou
 *   sur « Réinitialiser la démo ». Elle ne touche jamais Supabase : la
 *   démonstration tourne même quand le projet est injoignable.
 *
 * - le stockage : le même document, en JSON, dans un seau privé
 *   « espace-client » de Supabase Storage — exactement comme les espaces pro
 *   (src/lib/espaces-pro.ts). Pas de table, donc pas de migration ; le seau se
 *   crée tout seul au premier enregistrement.
 *
 * Toutes les écritures passent par `modifier`, qui les met en file : deux
 * actions simultanées du même serveur ne s'écrasent pas. Entre deux serveurs,
 * c'est le dernier qui écrit qui gagne — acceptable pour une seule instance
 * Railway, à revoir le jour où l'on passera en tables.
 */

export interface DepotDonnees {
  readonly mode: ModeDonnees;
  lire(): Promise<Donnees>;
  /** Applique `fn` à une copie, puis l'enregistre si `fn` n'a pas levé d'erreur. */
  modifier<T>(fn: (d: Donnees) => T | Promise<T>): Promise<T>;
  reinitialiser(): Promise<void>;
}

type Coffre = typeof globalThis & {
  __ecMemoire?: Donnees;
  __ecStockage?: { a: number; d: Donnees } | null;
  __ecFile?: Promise<unknown>;
};
// Sur globalThis plutôt que dans une variable du module : Next charge ce
// fichier une fois pour les pages et une autre pour les routes, et deux copies
// de la mémoire ne verraient pas les mêmes dossiers.
const coffre = globalThis as Coffre;

/** Une écriture à la fois, dans l'ordre d'arrivée. */
function enFile<T>(tache: () => Promise<T>): Promise<T> {
  const suite = (coffre.__ecFile ?? Promise.resolve()).then(tache, tache);
  coffre.__ecFile = suite.catch(() => undefined);
  return suite;
}

/** Complète un document lu (ancienne version, champ ajouté depuis) avec les listes vides. */
function completer(brut: Partial<Donnees>): Donnees {
  const vide = donneesVides();
  const d = { ...vide, ...brut, version: VERSION_DONNEES } as Donnees;
  for (const k of Object.keys(vide) as (keyof Donnees)[]) {
    if (k !== "version" && !Array.isArray(d[k])) (d as unknown as Record<string, unknown>)[k] = vide[k];
  }
  return d;
}

class DepotMemoire implements DepotDonnees {
  readonly mode = "demo" as const;

  async lire() {
    if (!coffre.__ecMemoire || coffre.__ecMemoire.version !== VERSION_DONNEES) coffre.__ecMemoire = amorcer();
    return coffre.__ecMemoire;
  }

  modifier<T>(fn: (d: Donnees) => T | Promise<T>) {
    return enFile(async () => {
      const copie = structuredClone(await this.lire());
      const r = await fn(copie);
      coffre.__ecMemoire = copie;
      return r;
    });
  }

  async reinitialiser() {
    coffre.__ecMemoire = amorcer();
  }
}

const SEAU = "espace-client";
const FICHIER = "donnees.json";
/** Les pages relisent le document à chaque affichage : quelques secondes de mémoire suffisent. */
const DUREE_CACHE = 5_000;
const DELAI = 8_000;

const introuvable = (message: string) => /not found|does not exist|no such|404/i.test(message);

/** Supabase qui ne répond pas ne doit pas figer la page : passé le délai, on abandonne. */
export function avecDelai<T>(promesse: PromiseLike<T>, ms = DELAI, message = "Le stockage ne répond pas."): Promise<T> {
  return new Promise<T>((ok, ko) => {
    const minuteur = setTimeout(() => ko(new Error(message)), ms);
    Promise.resolve(promesse).then(
      (v) => {
        clearTimeout(minuteur);
        ok(v);
      },
      (e) => {
        clearTimeout(minuteur);
        ko(e);
      },
    );
  });
}

export async function creerSeau() {
  const { error } = await avecDelai(createServiceClient().storage.createBucket(SEAU, { public: false }));
  if (error && !/exist/i.test(error.message)) throw new Error(`Création du stockage impossible : ${error.message}`);
}

class DepotStockage implements DepotDonnees {
  readonly mode = "stockage" as const;

  private async telecharger(): Promise<Donnees> {
    const { data, error } = await avecDelai(createServiceClient().storage.from(SEAU).download(FICHIER));
    if (error || !data) {
      // Rien d'enregistré encore : le point de départ. Toute autre erreur se
      // voit, plutôt que de faire croire à un espace vide.
      if (error && !introuvable(error.message)) throw new Error(`Espace client indisponible : ${error.message}`);
      return donneesVides();
    }
    try {
      return completer(JSON.parse(await data.text()) as Partial<Donnees>);
    } catch {
      throw new Error("Les données de l'espace client sont illisibles.");
    }
  }

  async lire() {
    const c = coffre.__ecStockage;
    if (c && Date.now() - c.a < DUREE_CACHE) return c.d;
    const d = await this.telecharger();
    coffre.__ecStockage = { a: Date.now(), d };
    return d;
  }

  private async ecrire(d: Donnees) {
    const corps = JSON.stringify(d);
    const stockage = createServiceClient().storage;
    const envoyer = () =>
      avecDelai(stockage.from(SEAU).upload(FICHIER, corps, { upsert: true, contentType: "application/json", cacheControl: "0" }));
    let { error } = await envoyer();
    if (error && introuvable(error.message)) {
      await creerSeau();
      ({ error } = await envoyer());
    }
    if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
    coffre.__ecStockage = { a: Date.now(), d };
  }

  modifier<T>(fn: (d: Donnees) => T | Promise<T>) {
    return enFile(async () => {
      // Relu à la source avant d'écrire : le cache a pu vieillir.
      const d = await this.telecharger();
      const r = await fn(d);
      await this.ecrire(d);
      return r;
    });
  }

  async reinitialiser() {
    throw new Error("Les données réelles ne se réinitialisent pas.");
  }
}

const memoire = new DepotMemoire();
const stockage = new DepotStockage();

/** Le dépôt choisi par l'environnement. */
export function depot(): DepotDonnees {
  return modeDonnees() === "stockage" ? stockage : memoire;
}

export const lireDonnees = () => depot().lire();
export const modifierDonnees = <T>(fn: (d: Donnees) => T | Promise<T>) => depot().modifier(fn);

export function nouvelId(prefixe: string) {
  return `${prefixe}-${randomUUID().slice(0, 8)}`;
}

export const maintenant = () => new Date().toISOString();

export { SEAU };
