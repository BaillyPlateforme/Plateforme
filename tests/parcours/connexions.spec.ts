/*
 * L'écran de connexion de l'équipe, dans un vrai navigateur : mauvais mot de
 * passe, compte hors de l'équipe, connexion réussie, chemin de retour, et
 * aucune redirection hors de chez Bailly quel que soit le paramètre « redirect ».
 */
import { AVEC_COMPTES, INT, comptes, expect, surveiller, test } from "../outils/banc";

test.skip(!AVEC_COMPTES, "comptes de test seulement en recette");

async function seConnecter(page: import("@playwright/test").Page, email: string, motDePasse: string, adresse = "/login") {
  await page.goto(INT + adresse);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(motDePasse);
  await page.locator('button[type="submit"]').first().click();
}

test("un mauvais mot de passe donne un message, et on reste sur la connexion", async ({ page }) => {
  const s = surveiller(page);
  await seConnecter(page, comptes().equipe.email, "pas-le-bon-mot-de-passe");
  await expect(page.locator("body")).toContainText(/incorrect|invalide|erreur|mot de passe/i);
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(s.bilan().filter((e) => !/400|auth\/v1/.test(e))).toEqual([]);
});

test("un compte qui n'est pas de l'équipe est refusé, même avec le bon mot de passe", async ({ page }) => {
  await seConnecter(page, comptes().intrus.email, comptes().intrus.motDePasse);
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.goto(INT + "/dossiers");
  await expect(page).toHaveURL(/\/login/);
});

test("l'équipe entre, et revient à la page demandée avant la connexion", async ({ page }) => {
  const s = surveiller(page);
  await page.goto(INT + "/clients");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fclients/);
  await page.locator('input[type="email"]').fill(comptes().equipe.email);
  await page.locator('input[type="password"]').fill(comptes().equipe.motDePasse);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => u.pathname === "/clients", { timeout: 30_000 });
  expect(s.bilan()).toEqual([]);
});

for (const cible of ["//evil.example", "https://evil.example", "/\\evil.example", "/%2F%2Fevil.example", "javascript:alert(1)", "\\\\evil.example", "/\t/evil.example", "/%5Cevil.example"]) {
  test(`après connexion, redirect=${JSON.stringify(cible)} reste chez Bailly`, async ({ page }) => {
    const ailleurs: string[] = [];
    page.on("request", (r) => {
      // Seules comptent les requêtes réellement envoyées à un autre site (l'adresse de connexion contient le mot).
      if (/evil\.example$/.test(new URL(r.url()).hostname)) ailleurs.push(r.url());
    });
    page.on("dialog", (d) => {
      ailleurs.push(`dialogue : ${d.message()}`);
      d.dismiss().catch(() => {});
    });
    await seConnecter(page, comptes().equipe.email, comptes().equipe.motDePasse, `/login?redirect=${encodeURIComponent(cible)}`);
    await page.waitForURL((u) => u.pathname !== "/login" || u.origin !== new URL(INT).origin, { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded");
    expect(new URL(page.url()).origin).toBe(new URL(INT).origin);
    expect(ailleurs, ailleurs.join("\n")).toEqual([]);
  });
}
