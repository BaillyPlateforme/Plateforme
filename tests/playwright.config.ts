import { defineConfig, devices } from "@playwright/test";
import { cible } from "./outils/config.mjs";
import { DOSSIER_APP, PORTS, URL_PRETE, envServeur } from "./outils/serveurs.mjs";

/*
 * Les niveaux « API » et « parcours » de la batterie (Playwright).
 *
 *   CIBLE=local    (défaut) lance les deux apps construites par construire.mjs,
 *                  sur la base de recette, rien ne sort ; prépare les comptes de
 *                  test avant, nettoie tout après ;
 *   CIBLE=recette  les services déployés de la recette ;
 *   CIBLE=prod     la production, lecture seule : seuls les tests marqués
 *                  @lecture tournent (le lanceur passe --grep @lecture).
 */
const c = cible();
const local = c.nom === "local";
const avecComptes = c.base === "recette";
// Le nom du passage : fixé une fois dans le processus principal, hérité par les processus de test.
process.env.BATTERIE_PASSAGE ??= process.env.PARTAGE === "1" ? String(process.pid) : "";
const suffixe = process.env.BATTERIE_NOM ? `-${process.env.BATTERIE_NOM}` : process.env.BATTERIE_PASSAGE ? `-${process.env.BATTERIE_PASSAGE}` : "";

export default defineConfig({
  testDir: ".",
  // En mode partagé, chaque passage a ses propres dossiers de résultats : un passage voisin ne les efface pas.
  outputDir: `resultats/playwright${suffixe}`,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.PARTAGE === "1" ? 2 : local ? 4 : 2,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: `resultats/rapport-playwright${suffixe}`, open: "never" }], ["json", { outputFile: `resultats/playwright${suffixe}.json` }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  projects: [
    { name: "preparation", testMatch: /preparation\.setup\.ts/, teardown: avecComptes ? "nettoyage" : undefined },
    { name: "nettoyage", testMatch: /nettoyage\.teardown\.ts/ },
    { name: "api", testDir: "api", dependencies: ["preparation"] },
    { name: "parcours", testDir: "parcours", dependencies: ["preparation"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "parcours-mobile",
      testDir: "parcours",
      testMatch: /\.mobile\.spec\.ts$|formulaire.*\.spec\.ts$/,
      dependencies: ["preparation"],
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: local
    ? (["externe", "interne"] as const).map((app) => ({
        command: `npx next start -p ${PORTS[app]}`,
        cwd: DOSSIER_APP(app),
        url: URL_PRETE[app],
        env: { ...(process.env as Record<string, string>), ...envServeur() },
        // PARTAGE=1 : les serveurs déjà lancés (serveurs.mjs --lancer) servent à plusieurs passages.
        reuseExistingServer: process.env.PARTAGE === "1",
        timeout: 120_000,
        stdout: "pipe" as const,
        stderr: "pipe" as const,
      }))
    : undefined,
});
