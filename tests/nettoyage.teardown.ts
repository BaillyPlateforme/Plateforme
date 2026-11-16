import fs from "node:fs";
import path from "node:path";
import { expect, test as nettoyage } from "@playwright/test";
import { ETAT } from "./outils/config.mjs";
import { nettoyer } from "./outils/comptes.mjs";

/* Après les niveaux API et parcours : tout ce que la batterie a créé en recette est effacé, et on le vérifie. */
nettoyage("rien de la batterie ne reste en recette", async () => {
  nettoyage.setTimeout(120_000);
  if (process.env.GARDER === "1" || process.env.PARTAGE === "1") return;
  const { retires, restes } = await nettoyer();
  fs.writeFileSync(path.join(ETAT, "nettoyage.json"), JSON.stringify({ le: new Date().toISOString(), retires, restes }, null, 2));
  for (const f of fs.readdirSync(ETAT)) if (f.startsWith("session-")) fs.rmSync(path.join(ETAT, f));
  expect(restes, "lignes de test restées en recette").toEqual({});
});
