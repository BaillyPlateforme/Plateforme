import fs from "node:fs";
import path from "node:path";
import { expect, test as preparation } from "@playwright/test";
import { ETAT, cible, projet } from "../outils/config.mjs";
import { lireComptes, preparerComptes } from "../outils/comptes.mjs";
import { cookiesDeSession, etatNavigateur } from "../outils/session.mjs";
import { buildPerime } from "../outils/serveurs.mjs";
import { nettoyerCampagne } from "./nettoyage.mjs";

/*
 * Avant la campagne : les serveurs locaux tournent sur le code du jour, la
 * recette ne garde rien d'un passage interrompu, les comptes de test et leurs
 * sessions sont prêts (le compte « equipe » ouvre le CRM).
 */
const c = cible();

preparation("le build local correspond au code", async () => {
  for (const app of ["externe", "interne"]) {
    const perime = buildPerime(app);
    expect(perime, `${app} : ${perime} — lancer « node construire.mjs »`).toBeNull();
  }
});

preparation("la recette est propre, les comptes de test et leurs sessions sont prêts", async () => {
  preparation.setTimeout(180_000);
  const frais = (f: string) => fs.existsSync(path.join(ETAT, f)) && Date.now() - fs.statSync(path.join(ETAT, f)).mtimeMs < 30 * 60_000;
  // Comptes et sessions de moins de 30 minutes (un autre passage en cours, ou la mise au point) : repris tels quels.
  if (fs.existsSync(path.join(ETAT, "comptes.json")) && frais("session-equipe.json")) return;
  if (process.env.GARDER !== "1") await nettoyerCampagne();
  const comptes = fs.existsSync(path.join(ETAT, "comptes.json")) && process.env.GARDER === "1" ? lireComptes() : await preparerComptes();
  const p = projet("recette");
  for (const [sorte, compte] of Object.entries(comptes) as [string, { email: string; motDePasse: string }][]) {
    const cookies = await cookiesDeSession(p, compte.email, compte.motDePasse);
    fs.writeFileSync(path.join(ETAT, `session-${sorte}.json`), JSON.stringify(etatNavigateur(cookies, ["http://localhost"])), { mode: 0o600 });
  }
  expect(c.base).toBe("recette");
});
