/*
 * Le compte « marketing » (une agence de Bailly — Noiise —, 20/11/2026) : il
 * n'ouvre que /leads, le suivi des leads en lecture seule, sans aucune
 * coordonnée de client ; toute autre page le ramène là, toute route API le
 * refuse. Un membre de l'équipe ouvre la même page, pour voir ce que voit
 * l'agence. Comptes de test : recette seulement.
 */
import fs from "node:fs";
import { AVEC_COMPTES, INT, comptes, contexteEn, expect, ipNeuve, requeteEn, surveiller, test } from "../outils/banc";

test.describe("compte marketing : le suivi des leads, et rien d'autre", () => {
  test.skip(!AVEC_COMPTES, "comptes de test seulement en recette");

  test("arrive sur /leads, en lecture seule, sans aucune coordonnée de client, export compris @lecture", async ({ browser }) => {
    // Les vraies coordonnées des leads de la recette, lues par l'équipe : aucune ne doit atteindre l'agence.
    const equipe = await requeteEn("equipe");
    const r = await equipe.get(INT + "/api/data/leads");
    expect(r.status()).toBe(200);
    const { leads } = (await r.json()) as { leads: { client_nom: string | null; client_email: string | null; client_tel: string | null; societe: string | null }[] };
    await equipe.dispose();
    const secrets = [...new Set(leads.flatMap((l) => [l.client_nom, l.client_email, l.client_tel, l.societe]).filter((v): v is string => !!v && v.trim().length >= 5))];

    const ctx = await contexteEn(browser, "marketing", { acceptDownloads: true });
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(INT + "/");
    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole("heading", { name: "Suivi des leads", level: 1 })).toBeVisible();

    // Rien à saisir, aucune fiche à ouvrir.
    await expect(page.locator("table select, table input, table button")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Fiche" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Contact" })).toHaveCount(0);

    // Ni dans la page ni dans les données de React qui l'accompagnent (le HTML les contient).
    const html = await page.content();
    for (const secret of secrets) expect(html, "une coordonnée de client dans la page de l'agence").not.toContain(secret);

    // L'export : les colonnes sans le client, et aucune coordonnée.
    const [telechargement] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Exporter/ }).click()]);
    const csv = fs.readFileSync((await telechargement.path())!, "utf8");
    expect(csv.split("\n")[0].replace(/^﻿/, "")).toBe("Date d'entrée;Parcours;Mutation;Priorité;Ville de départ;Ville d'arrivée;Statut;CA en attente;CA réalisé");
    for (const secret of secrets) expect(csv, "une coordonnée de client dans l'export de l'agence").not.toContain(secret);

    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("toute autre page la ramène au suivi des leads, toute route API la refuse @lecture", async ({ browser }) => {
    const ctx = await contexteEn(browser, "marketing");
    const page = await ctx.newPage();
    for (const chemin of ["/parcours", "/demandes?vue=leads", "/clients", "/dashboard/equipe", "/reglages", "/tablette", "/terrain"]) {
      await page.goto(INT + chemin);
      await expect(page, chemin).toHaveURL(/\/leads$/);
    }
    await ctx.close();

    const api = await requeteEn("marketing");
    for (const chemin of ["/api/data/leads", "/api/data/clients", "/api/data/demandes", "/api/dossiers"]) {
      expect((await api.get(INT + chemin)).status(), chemin).toBe(403);
    }
    await api.dispose();
  });

  test("se connecte par la page de l'équipe, arrive sur ses leads, et se déconnecte @lecture", async ({ browser }) => {
    const compte = comptes().marketing;
    const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Real-IP": ipNeuve() } });
    const page = await ctx.newPage();
    await page.goto(INT + "/login");
    await page.locator('input[type="email"]').fill(compte.email);
    await page.locator('input[type="password"]').fill(compte.motDePasse);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/leads$/, { timeout: 30_000 });
    await expect(page.getByText(compte.email)).toBeVisible();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL(/\/login/);
    await page.goto(INT + "/leads");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});

test.describe("le suivi des leads de l'agence, vu par les autres comptes", () => {
  test.skip(!AVEC_COMPTES, "comptes de test seulement en recette");

  test("un membre de l'équipe l'ouvre en aperçu ; un compte hors de l'équipe ou au rôle inconnu, non @lecture", async ({ browser }) => {
    const ctx = await contexteEn(browser, "equipe");
    const page = await ctx.newPage();
    await page.goto(INT + "/leads");
    await expect(page.getByRole("heading", { name: "Suivi des leads", level: 1 })).toBeVisible();
    await expect(page.getByText(/Aperçu de l'équipe/)).toBeVisible();
    await ctx.close();

    for (const sorte of ["intrus", "inconnu"] as const) {
      const autre = await contexteEn(browser, sorte);
      const p = await autre.newPage();
      await p.goto(INT + "/leads");
      await expect(p, sorte).toHaveURL(/\/login/);
      await autre.close();
    }
  });
});

test("le suivi des leads de l'agence : sans session, la page mène à la connexion @lecture", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(INT + "/leads");
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});
