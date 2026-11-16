import { devices, type Page } from "@playwright/test";
import { AVEC_COMPTES, EXT, INT, comptes, contexteEn, expect, requeteEn, surveiller, test } from "../outils/banc";
import { IDENTIFIANT_TERRAIN } from "../outils/comptes.mjs";
import { LENT, ligne, pageEnErreurSure } from "./espace-client-outils";

/*
 * L'outil terrain des déménageurs (/terrain, app de l'équipe), tenu au
 * téléphone : la connexion par identifiant court, le message d'un mauvais
 * mot de passe, la cloison (un compte « terrain » n'ouvre que l'outil), le
 * compte, et la porte fermée sans session.
 *
 * Le compte de test « batterie.terrain » est celui de la préparation. Son mot
 * de passe n'est jamais changé ici (d'autres passages s'en servent).
 */

/** Un téléphone : celui du projet « parcours-mobile », pour les contextes ouverts à la main. */
const TELEPHONE = (() => {
  const { defaultBrowserType: _, ...d } = devices["Pixel 7"];
  return d;
})();

/** Une page de l'outil : ni erreur JS, ni 5xx, ni page d'erreur, ni défilement horizontal au téléphone. */
async function verifierPageTerrain(page: Page, s: ReturnType<typeof surveiller>, chemin: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  expect(await pageEnErreurSure(page), `${chemin} : page d'erreur`).toBeNull();
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(debord, `${chemin} : la page déborde en largeur`).toBeLessThanOrEqual(1);
  expect(s.bilan(), `${chemin} : erreurs JS ou 5xx`).toEqual([]);
}

test.describe("outil terrain : la connexion", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");

  test("un déménageur se connecte avec son identifiant, voit ses chantiers, son compte, puis se déconnecte", async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext(TELEPHONE);
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(`${INT}/terrain/connexion`);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await page.getByLabel("Identifiant").fill(IDENTIFIANT_TERRAIN);
    await page.locator('input[name="password"]').fill(comptes().terrain.motDePasse);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(`${INT}/terrain`, { timeout: LENT });
    await expect(page.getByRole("heading", { name: "Bonjour Batterie" })).toBeVisible();
    await expect(page.getByText("Équipe de test").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Aujourd'hui" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Demain" })).toBeVisible();
    await verifierPageTerrain(page, s, "/terrain");

    // Le compte.
    await page.getByRole("link", { name: "Mon compte" }).click();
    await page.waitForURL(`${INT}/terrain/compte`);
    await expect(page.getByText(`Identifiant : ${IDENTIFIANT_TERRAIN}`)).toBeVisible();
    await expect(page.getByText("Mot de passe", { exact: true }).first()).toBeVisible();
    await verifierPageTerrain(page, s, "/terrain/compte");

    // Déjà connecté, la page de connexion mène aux chantiers.
    await page.goto(`${INT}/terrain/connexion`);
    await expect(page).toHaveURL(`${INT}/terrain`);

    // La déconnexion (de ce téléphone seulement).
    await page.goto(`${INT}/terrain/compte`);
    await page.getByRole("button", { name: /Se déconnecter/ }).click();
    await page.waitForURL(/\/terrain\/connexion/, { timeout: LENT });
    await page.goto(`${INT}/terrain`);
    await expect(page).toHaveURL(/\/terrain\/connexion/);
    await ctx.close();
  });

  test("un mauvais mot de passe, ou un identifiant inconnu, donne le même message lisible", async ({ browser }) => {
    const ctx = await browser.newContext(TELEPHONE);
    const page = await ctx.newPage();
    const s = surveiller(page);
    for (const [identifiant, mdp] of [
      [IDENTIFIANT_TERRAIN, "pas-le-bon-mot-de-passe-9!"],
      ["personne.inconnu", "pas-le-bon-mot-de-passe-9!"],
    ]) {
      await page.goto(`${INT}/terrain/connexion`);
      await page.getByLabel("Identifiant").fill(identifiant);
      await page.locator('input[name="password"]').fill(mdp);
      await page.getByRole("button", { name: "Se connecter" }).click();
      // (Next pose aussi un « role=alert » vide pour annoncer les changements de page : on vise celui du formulaire.)
      await expect(page.locator("form [role=alert]")).toHaveText("Identifiant ou mot de passe incorrect.", { timeout: LENT });
      await expect(page).toHaveURL(/\/terrain\/connexion/);
      // Le bouton se réarme.
      await expect(page.getByRole("button", { name: "Se connecter" })).toBeEnabled();
    }
    // Le refus de Supabase (400) est attendu ; rien d'autre.
    expect(s.bilan().filter((e) => !/status of 400/.test(e))).toEqual([]);
    await ctx.close();
  });
});

test.describe("outil terrain : la cloison du compte déménageur", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");

  test("le compte terrain est ramené à /terrain, et l'API du CRM lui répond 403 @lecture", async ({ browser }) => {
    const ctx = await contexteEn(browser, "terrain", TELEPHONE);
    const page = await ctx.newPage();
    for (const chemin of ["/dossiers", "/dashboard", "/dashboard/espace-client", "/clients", "/parcours", "/tablette", "/"]) {
      await page.goto(INT + chemin);
      await expect(page, chemin).toHaveURL(`${INT}/terrain`);
    }
    // L'espace client ne le reconnaît pas comme client.
    await page.goto(`${EXT}/espace-client`);
    await expect(page).toHaveURL(/\/espace-client\/connexion/);
    await ctx.close();

    const r = await requeteEn("terrain");
    for (const api of ["/api/data/clients", "/api/data/equipe", "/api/data/espace-client/dossiers"]) {
      const rep = await r.get(INT + api);
      expect(rep.status(), api).toBe(403);
    }
  });

  test("ses pages s'affichent : chantiers, compte, un chantier, un chantier introuvable @lecture", async ({ browser }) => {
    const ctx = await contexteEn(browser, "terrain", TELEPHONE);
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(`${INT}/terrain`);
    await expect(page.getByRole("heading", { name: "Bonjour Batterie" })).toBeVisible();
    await verifierPageTerrain(page, s, "/terrain");

    await page.goto(`${INT}/terrain/compte`);
    await expect(page.getByText(`Identifiant : ${IDENTIFIANT_TERRAIN}`)).toBeVisible();
    await verifierPageTerrain(page, s, "/terrain/compte");

    // Un chantier du planning, s'il y en a aujourd'hui ou demain : sa fiche s'ouvre.
    await page.goto(`${INT}/terrain`);
    const chantier = page.locator('a[href^="/terrain/dossier/"]').first();
    if (await chantier.count()) {
      const href = (await chantier.getAttribute("href"))!;
      await page.goto(INT + href);
      await expect(page.getByRole("link", { name: /Chantiers/ })).toBeVisible();
      await verifierPageTerrain(page, s, href);
    }

    // Un dossier hors du planning — qu'il n'existe pas, ou qu'il soit terminé depuis longtemps (jeu de démonstration,
    // lu seulement) — reçoit la même réponse, sans rien en montrer : un déménageur n'ouvre que ses chantiers d'hier à demain.
    const ancien = await ligne<{ id: number; nom: string }>(
      "select d.crm_dossier_id as id, c.nom from public.ec_dossiers d join public.ec_clients c on c.id = d.client_id where d.reference = 'BD-2024-0311'",
    );
    for (const id of [999999999, ...(ancien?.id ? [ancien.id] : [])]) {
      const r = await page.goto(`${INT}/terrain/dossier/${id}`);
      expect(r?.status(), `dossier ${id}`).toBeLessThan(500);
      await expect(page.getByText("Ce dossier n'est pas au planning"), `dossier ${id}`).toBeVisible();
      if (ancien?.nom) expect(await page.locator("body").innerText(), `dossier ${id}`).not.toContain(ancien.nom);
      await verifierPageTerrain(page, s, `/terrain/dossier/${id}`);
    }
    await ctx.close();
  });
});

test.describe("outil terrain : sans session", () => {
  test("/terrain et ses pages mènent à la connexion du terrain, son API répond 401 @lecture", async ({ browser }) => {
    const r = await requeteEn(null);
    for (const chemin of ["/terrain", "/terrain/compte", "/terrain/dossier/1"]) {
      const rep = await r.get(INT + chemin);
      expect([302, 303, 307, 308], chemin).toContain(rep.status());
      expect(rep.headers().location, chemin).toMatch(/\/terrain\/connexion/);
    }
    const api = await r.get(`${INT}/api/terrain/photos`);
    expect(api.status()).toBe(401);

    const ctx = await browser.newContext(TELEPHONE);
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(`${INT}/terrain`);
    await expect(page).toHaveURL(/\/terrain\/connexion/);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Connexion de l'équipe/ })).toHaveAttribute("href", "/login");
    await verifierPageTerrain(page, s, "/terrain/connexion");
    await ctx.close();
  });
});
