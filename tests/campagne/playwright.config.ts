import { defineConfig, devices } from "@playwright/test";
import { cible } from "../outils/config.mjs";
import { DOSSIER_APP, PORTS, URL_PRETE, envServeur } from "../outils/serveurs.mjs";

/*
 * La campagne de 100 simulations du formulaire public (tests/campagne).
 *
 * À part de la batterie : `node lanceur.mjs` ne la lance jamais (la
 * configuration principale ne regarde que api/ et parcours/). Elle tourne
 * sur les serveurs LOCAUX de la batterie, branchés sur la base de RECETTE,
 * envois désactivés et Créagidem inactif — jamais ailleurs.
 *
 *   node campagne/lancer.mjs                 la campagne entière, puis le rapport
 *   AVEC_GEMINI=1 …                          les scénarios « photos » avec la vraie analyse
 *   GARDER=1 …                               ne rien effacer à la fin (mise au point)
 *   npx playwright test -c campagne/playwright.config.ts -g "#012"   un seul scénario
 */
const c = cible();
if (c.nom !== "local") throw new Error("La campagne ne tourne que sur les serveurs locaux (CIBLE=local) : elle écrit en recette.");
// Les serveurs déjà lancés (outils/serveurs.mjs --lancer) servent tels quels.
process.env.BATTERIE_PASSAGE ??= "campagne";

export default defineConfig({
  testDir: ".",
  outputDir: "resultats/sortie",
  timeout: 240_000,
  expect: { timeout: 25_000 },
  fullyParallel: true,
  workers: Number(process.env.CAMPAGNE_OUVRIERS ?? 4),
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "resultats/playwright.json" }], ["html", { outputFolder: "resultats/html", open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  projects: [
    { name: "preparation-campagne", testMatch: /preparation-campagne\.setup\.ts/, teardown: "nettoyage-campagne" },
    { name: "nettoyage-campagne", testMatch: /nettoyage-campagne\.teardown\.ts/ },
    {
      name: "campagne",
      testMatch: /campagne\.spec\.ts/,
      dependencies: ["preparation-campagne"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: (["externe", "interne"] as const).map((app) => ({
    command: `npx next start -p ${PORTS[app]}`,
    cwd: DOSSIER_APP(app),
    url: URL_PRETE[app],
    env: { ...(process.env as Record<string, string>), ...envServeur() },
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  })),
});
