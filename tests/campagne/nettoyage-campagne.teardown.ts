import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as nettoyage } from "@playwright/test";
import { ETAT } from "../outils/config.mjs";
import { bilanDevis, nettoyerCampagne } from "./nettoyage.mjs";

/*
 * Après la campagne : le bilan qui demande toutes les demandes à la fois (les
 * références de devis, uniques ?), puis tout ce que la campagne a créé en
 * recette est effacé — et on vérifie qu'il ne reste rien.
 */
const RES = path.join(path.dirname(fileURLToPath(import.meta.url)), "resultats");

nettoyage("rien de la campagne ne reste en recette", async () => {
  nettoyage.setTimeout(240_000);
  fs.mkdirSync(RES, { recursive: true });
  const bilan = await bilanDevis();
  fs.writeFileSync(path.join(RES, "bilan-devis.json"), JSON.stringify({ le: new Date().toISOString(), ...bilan }, null, 2));
  if (process.env.GARDER === "1") return;
  const { retires, restes } = await nettoyerCampagne();
  const trace = { le: new Date().toISOString(), retires, restes };
  fs.writeFileSync(path.join(RES, "nettoyage.json"), JSON.stringify(trace, null, 2));
  fs.writeFileSync(path.join(ETAT, "nettoyage.json"), JSON.stringify(trace, null, 2));
  for (const f of fs.readdirSync(ETAT)) if (f.startsWith("session-")) fs.rmSync(path.join(ETAT, f));
  expect(restes, "lignes de la campagne restées en recette").toEqual({});
});
