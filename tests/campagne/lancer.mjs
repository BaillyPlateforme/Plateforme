/*
 * La campagne de bout en bout, puis son rapport.
 *
 *   cd tests
 *   node construire.mjs                          (si le code a changé depuis le dernier build)
 *   node campagne/lancer.mjs                     les 100 scénarios (photos ignorées sans Gemini)
 *   AVEC_GEMINI=1 node campagne/lancer.mjs       avec la vraie analyse des photos (≤ 6 appels)
 *   node campagne/lancer.mjs -g "#012"           un scénario
 *
 * Les serveurs locaux déjà lancés (`node outils/serveurs.mjs --lancer`) sont
 * repris ; sinon Playwright les lance (Gemini selon AVEC_GEMINI). Pour les
 * photos, les serveurs doivent eux aussi tourner avec AVEC_GEMINI=1.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const TESTS = path.resolve(ICI, "..");
const args = process.argv.slice(2);
if (!args.some((a) => a === "-g" || a.startsWith("--grep"))) {
  // Un passage complet repart d'un relevé vide.
  fs.rmSync(path.join(ICI, "resultats", "scenarios"), { recursive: true, force: true });
}
const r = spawnSync("npx", ["playwright", "test", "-c", "campagne/playwright.config.ts", ...args], { cwd: TESTS, stdio: "inherit", env: { ...process.env, CIBLE: "local" } });
spawnSync("node", [path.join(ICI, "rapport.mjs")], { cwd: TESTS, stdio: "inherit" });
process.exit(r.status ?? 1);
