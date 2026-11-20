/*
 * Le banc commun des tests Playwright : la cible, les comptes, une requête
 * ouverte avec la session d'un compte, une adresse IP neuve par test.
 */
import fs from "node:fs";
import path from "node:path";
import { test as base, expect, request as fabriqueRequetes, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test";
import { ETAT, cible as lireCible, emailDeTest } from "./config.mjs";
import { secrets } from "./serveurs.mjs";

export type Sorte = "equipe" | "intrus" | "inconnu" | "rh" | "client" | "terrain" | "marketing";
export const SORTES: Sorte[] = ["equipe", "intrus", "inconnu", "rh", "client", "terrain"];

export const C = lireCible();
export const LOCAL = C.nom === "local";
export const AVEC_COMPTES = C.base === "recette";
export const EXT = C.externe;
export const INT = C.interne;

export const fichierSession = (sorte: Sorte) => path.join(ETAT, `session-${sorte}.json`);
export const SECRETS = (LOCAL ? secrets() : null) as null | Record<"emails" | "diagnostic" | "taches" | "sms" | "brevo", string>;

let compteurIp = 0;
/**
 * Une adresse IP de documentation (RFC 5737) propre au test : sur les serveurs
 * locaux, sans le bord de Railway, X-Real-IP est lu tel quel — chaque test a
 * ainsi ses propres compteurs de limites, sans gêner les autres.
 */
export function ipNeuve(): string {
  compteurIp += 1;
  const n = (process.pid * 37 + compteurIp * 7919 + Date.now()) % 65_000;
  return `198.51.${Math.floor(n / 254) % 254}.${(n % 254) + 1}`;
}

let compteurEmail = 0;
/** Une adresse de test unique (préfixe reconnu par le nettoyage). */
export function emailUnique(etiquette = "demande"): string {
  compteurEmail += 1;
  return emailDeTest(`${etiquette}.${Date.now().toString(36)}${process.pid.toString(36)}${compteurEmail}`);
}

/** Une requête HTTP ouverte avec la session d'un compte de test (ou sans session). */
export async function requeteEn(sorte: Sorte | null, extra: Parameters<typeof fabriqueRequetes.newContext>[0] = {}): Promise<APIRequestContext> {
  return fabriqueRequetes.newContext({
    storageState: sorte ? fichierSession(sorte) : undefined,
    maxRedirects: 0,
    ...extra,
  });
}

/** Un navigateur ouvert avec la session d'un compte. */
export async function contexteEn(browser: Browser, sorte: Sorte, options: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ storageState: fichierSession(sorte), ...options });
}

export const comptes = (): Record<Sorte, { id: string; email: string; motDePasse: string }> =>
  JSON.parse(fs.readFileSync(path.join(ETAT, "comptes.json"), "utf8"));

/**
 * Surveille une page : erreurs JavaScript, réponses 5xx, appels d'API refusés.
 * `bilan()` rend ce qui s'est mal passé depuis l'ouverture.
 */
export function surveiller(page: import("@playwright/test").Page) {
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(`JS : ${e.message.split("\n")[0]}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() >= 500) erreurs.push(`${r.status()} ${u.pathname}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 4\d\d|Download the React DevTools/.test(m.text())) erreurs.push(`console : ${m.text().slice(0, 200)}`);
  });
  return { bilan: () => [...erreurs], vider: () => erreurs.splice(0) };
}

/** Une page d'erreur de Next ou de l'app (frontière d'erreur, 404, 500) ? */
export async function pageEnErreur(page: import("@playwright/test").Page): Promise<string | null> {
  const texte = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const motifs = [/Application error/i, /Internal Server Error/i, /This page could not be found/i, /Une erreur est survenue/i, /Unhandled Runtime Error/i, /Something went wrong/i];
  // (Pas de motif « 500 … erreur » : un tutoriel qui parle de « 1 500 € » puis d'« erreurs » passait pour une page cassée.)
  const m = motifs.find((x) => x.test(texte));
  return m ? texte.slice(0, 200) : null;
}

export const test = base;
export { expect };
