/*
 * « Mot de passe oublié » et le lien à usage unique (20/11/2026) : le mot de
 * passe d'un compte de l'équipe n'est plus transmis par e-mail, chacun le
 * choisit par un lien qui ne sert qu'une fois.
 *
 * Sans compte : la page de demande répond pareil pour toute adresse, et un
 * lien mal formé ou périmé ne mène nulle part. Avec les comptes de recette :
 * le parcours entier, sur le compte jetable « motdepasse » (agent) — un admin
 * fabrique le lien depuis L'équipe, le lien ouvre la session avec le nouveau
 * mot de passe, l'ancien ne marche plus, et le lien ne resert pas.
 */
import { randomBytes } from "node:crypto";
import type { Browser } from "@playwright/test";
import { AVEC_COMPTES, INT, contexteEn, expect, ipNeuve, surveiller, test } from "../outils/banc";
import { lireComptes } from "../outils/comptes.mjs";

// Le message, dans la zone principale : Next pose aussi sur chaque page une zone « alerte » vide (__next-route-announcer__).
const PERIME = /n'est plus valable/;

/** Un navigateur sans session, avec sa propre adresse IP (ses propres plafonds). */
const contexteNeuf = (browser: Browser) => browser.newContext({ extraHTTPHeaders: { "X-Real-IP": ipNeuve() } });

test.describe("mot de passe : sans compte", () => {
  test("la connexion mène à « Mot de passe oublié ? »", async ({ browser }) => {
    const ctx = await contexteNeuf(browser);
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(INT + "/login");
    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
    await expect(page).toHaveURL(/\/login\/mot-de-passe$/);
    await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("une adresse sans compte reçoit la même réponse qu'une autre", async ({ browser }) => {
    const ctx = await contexteNeuf(browser);
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(INT + "/login/mot-de-passe");
    await page.locator('input[name="email"]').fill(`personne.${Date.now().toString(36)}@example.com`);
    await page.getByRole("button", { name: /Recevoir le lien/ }).click();
    await expect(page.getByRole("status")).toContainText("Si cette adresse est celle d'un compte de l'équipe, le lien vient de partir.");
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("un lien mal formé ne montre pas le formulaire", async ({ browser }) => {
    const ctx = await contexteNeuf(browser);
    const page = await ctx.newPage();
    await page.goto(INT + "/login/mot-de-passe/choisir?jeton=court");
    await expect(page.locator("main").getByRole("alert")).toContainText(PERIME);
    await expect(page.locator('input[name="nouveau"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Recevoir un nouveau lien" })).toHaveAttribute("href", "/login/mot-de-passe");
    await ctx.close();
  });

  test("un lien périmé : une saisie trop courte est refusée sans rien consommer, puis le lien est refusé", async ({ browser }) => {
    const ctx = await contexteNeuf(browser);
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(INT + `/login/mot-de-passe/choisir?jeton=${"0a".repeat(28)}`);
    // La page ne laisse pas filer l'adresse (et son jeton) vers un autre site.
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

    // Trop court : la règle répond avant le jeton (le navigateur exige déjà 10 caractères, on le contourne).
    await page.locator('input[name="nouveau"]').evaluate((e: HTMLInputElement) => e.removeAttribute("minlength"));
    await page.locator('input[name="confirmation"]').evaluate((e: HTMLInputElement) => e.removeAttribute("minlength"));
    await page.locator('input[name="nouveau"]').fill("court1");
    await page.locator('input[name="confirmation"]').fill("court1");
    await page.getByRole("button", { name: /Enregistrer et me connecter/ }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("au moins 10 caractères");
    await expect(page.locator('input[name="nouveau"]')).toBeVisible();

    // Bonne saisie, faux jeton : Supabase le refuse, et la page propose un nouveau lien.
    const mdp = `Essai-${randomBytes(9).toString("base64url")}`;
    await page.locator('input[name="nouveau"]').fill(mdp);
    await page.locator('input[name="confirmation"]').fill(mdp);
    await page.getByRole("button", { name: /Enregistrer et me connecter/ }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(PERIME);
    await expect(page.getByRole("link", { name: "Recevoir un nouveau lien" })).toBeVisible();
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });
});

test.describe("mot de passe : le parcours entier", () => {
  test.skip(!AVEC_COMPTES, "comptes de test seulement en recette");
  test.describe.configure({ mode: "serial" });

  test("un admin fabrique le lien, le membre choisit son mot de passe et entre ; le lien ne resert pas", async ({ browser }) => {
    const cible = (lireComptes() as Record<string, { email: string; motDePasse: string }>).motdepasse;
    test.skip(!cible, "compte « motdepasse » absent : la préparation des comptes n'a pas tourné avec cette version");

    // 1. L'admin (compte « equipe ») fabrique le lien depuis L'équipe.
    const admin = await contexteEn(browser, "equipe");
    const pageAdmin = await admin.newPage();
    await pageAdmin.goto(INT + "/dashboard/equipe");
    const ligne = pageAdmin.locator(`tr[data-membre="${cible.email}"]`);
    await ligne.getByRole("button", { name: "Lien mot de passe" }).click();
    const champ = pageAdmin.locator("[data-lien-mot-de-passe] input");
    await expect(champ).toHaveValue(/\/login\/mot-de-passe\/choisir\?jeton=/);
    const lien = new URL(await champ.inputValue());
    const chemin = lien.pathname + lien.search;
    await admin.close();

    // 2. Le membre ouvre le lien (sans session), choisit son mot de passe, et entre dans le CRM.
    const nouveau = `Bt-${randomBytes(12).toString("base64url")}7`;
    const ctx = await contexteNeuf(browser);
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(INT + chemin);
    await page.locator('input[name="nouveau"]').fill(nouveau);
    await page.locator('input[name="confirmation"]').fill(nouveau);
    await page.getByRole("button", { name: /Enregistrer et me connecter/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });

    // « Changer mon mot de passe », dans le menu du compte : la même page, l'adresse déjà remplie.
    await page.getByRole("button", { name: /^Compte :/ }).click();
    await page.getByRole("menuitem", { name: "Changer mon mot de passe" }).click();
    await expect(page.getByRole("heading", { name: "Changer mon mot de passe" })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toHaveValue(cible.email);
    expect(s.bilan()).toEqual([]);
    await ctx.close();

    // 3. Le même lien ne resert pas.
    const ctx2 = await contexteNeuf(browser);
    const page2 = await ctx2.newPage();
    await page2.goto(INT + chemin);
    const autre = `Bt-${randomBytes(12).toString("base64url")}8`;
    await page2.locator('input[name="nouveau"]').fill(autre);
    await page2.locator('input[name="confirmation"]').fill(autre);
    await page2.getByRole("button", { name: /Enregistrer et me connecter/ }).click();
    await expect(page2.locator("main").getByRole("alert")).toContainText(PERIME);

    // 4. L'ancien mot de passe ne marche plus, le nouveau si.
    await page2.goto(INT + "/login");
    await page2.locator('input[type="email"]').fill(cible.email);
    await page2.locator('input[type="password"]').fill(cible.motDePasse);
    await page2.locator('button[type="submit"]').first().click();
    await expect(page2.locator("main").getByRole("alert")).toContainText(/incorrect/i);
    await page2.locator('input[type="password"]').fill(nouveau);
    await page2.locator('button[type="submit"]').first().click();
    await page2.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    await ctx2.close();
  });
});
