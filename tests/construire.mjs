#!/usr/bin/env node
/*
 * Construit les deux apps pour la batterie locale : `next build`, avec les
 * adresses locales et les réglages qui ne laissent rien sortir
 * (outils/serveurs.mjs). Les variables NEXT_PUBLIC_* sont gravées au build :
 * un build fait pour la production ne sert pas ici, et inversement.
 *
 *   node construire.mjs            les deux apps
 *   node construire.mjs externe    une seule
 *   node construire.mjs --si-perime  seulement celles dont le code a changé
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DOSSIER_APP, buildPerime, envServeur } from "./outils/serveurs.mjs";

const args = process.argv.slice(2);
const siPerime = args.includes("--si-perime");
const apps = args.filter((a) => !a.startsWith("--"));
const liste = apps.length ? apps : ["externe", "interne"];

let echec = false;
for (const app of liste) {
  if (siPerime && !buildPerime(app)) {
    console.log(`[construire] ${app} : build à jour.`);
    continue;
  }
  console.log(`[construire] ${app} : next build…`);
  const debut = Date.now();
  const r = spawnSync("npx", ["next", "build"], { cwd: DOSSIER_APP(app), env: { ...process.env, ...envServeur() }, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[construire] ${app} : ÉCHEC du build.`);
    echec = true;
    continue;
  }
  fs.writeFileSync(path.join(DOSSIER_APP(app), ".next", "batterie.json"), JSON.stringify({ le: new Date().toISOString() }));
  console.log(`[construire] ${app} : construit en ${Math.round((Date.now() - debut) / 1000)} s.`);
}
process.exit(echec ? 1 : 0);
