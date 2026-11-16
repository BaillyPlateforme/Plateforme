import fs from "node:fs";
import path from "node:path";
import { expect, test as preparation } from "@playwright/test";
import { ETAT, cible, projet } from "./outils/config.mjs";
import { lireComptes, nettoyer, preparerComptes } from "./outils/comptes.mjs";
import { cookiesDeSession, etatNavigateur } from "./outils/session.mjs";
import { buildPerime } from "./outils/serveurs.mjs";

/*
 * Avant les niveaux API et parcours : vérifier que les serveurs locaux
 * tournent sur le code du jour, effacer les restes d'un passage interrompu,
 * créer les comptes de test et ouvrir leurs sessions.
 */
const c = cible();

preparation("le build local correspond au code", async () => {
  preparation.skip(c.nom !== "local", "seulement pour les serveurs locaux");
  for (const app of ["externe", "interne"]) {
    const perime = buildPerime(app);
    expect(perime, `${app} : ${perime} — lancer « node construire.mjs »`).toBeNull();
  }
});

preparation("les comptes de test et leurs sessions", async () => {
  preparation.skip(c.base !== "recette", "aucun compte de test hors de la recette");
  preparation.setTimeout(120_000);
  // PARTAGE=1 (mise au point, plusieurs passages en même temps) : les comptes déjà préparés servent tels
  // quels, seules les sessions de plus de 30 minutes sont rouvertes ; rien n'est effacé.
  const partage = process.env.PARTAGE === "1" && fs.existsSync(path.join(ETAT, "comptes.json"));
  if (partage) {
    const frais = fs.existsSync(path.join(ETAT, "session-equipe.json")) && Date.now() - fs.statSync(path.join(ETAT, "session-equipe.json")).mtimeMs < 30 * 60_000;
    if (frais) return;
  } else await nettoyer();
  const comptes = partage ? lireComptes() : await preparerComptes();
  const p = projet("recette");
  for (const [sorte, compte] of Object.entries(comptes)) {
    const cookies = await cookiesDeSession(p, compte.email, compte.motDePasse);
    const origines = [...new Set([new URL(c.externe).origin, new URL(c.interne).origin].map((o) => (o.includes("localhost") ? "http://localhost" : o)))];
    fs.writeFileSync(path.join(ETAT, `session-${sorte}.json`), JSON.stringify(etatNavigateur(cookies, origines)), { mode: 0o600 });
  }
});
