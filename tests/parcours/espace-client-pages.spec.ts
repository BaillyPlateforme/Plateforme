import type { BrowserContext, Page } from "@playwright/test";
import { AVEC_COMPTES, EXT, expect, surveiller, test } from "../outils/banc";
import { LENT, connecterClient, creerClientEspace, ligne, pageEspaceEnErreur, type ClientTest } from "./espace-client-outils";

/*
 * Toutes les pages d'un dossier, vues par SON client, connecté par un vrai
 * lien : chacune s'affiche sans erreur JavaScript, sans réponse 5xx, sans
 * page d'erreur ni page introuvable. Le client de test a un devis envoyé
 * (recopié d'un devis du jeu de démonstration, qui n'est pas touché) et une
 * session de paiement ouverte, posée en base sur SON dossier, pour que les
 * pages « Devis » et « Paiement » aient de quoi s'afficher. Rien n'est payé.
 *
 * Un second client, maritime (vers le Canada), ouvert depuis la fiche du
 * dossier du CRM, montre le conteneur et les pièces du pays.
 */

type Etat = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** Ouvre une page du client et vérifie qu'elle tient : rend la page, ouverte. */
async function visiter(ctx: BrowserContext, chemin: string, attendu?: RegExp | string) {
  const page = await ctx.newPage();
  const s = surveiller(page);
  const r = await page.goto(EXT + chemin, { timeout: LENT });
  expect(r?.status(), `${chemin} : statut`).toBeLessThan(400);
  await expect(page, `${chemin} : la session tient (pas de retour à la connexion)`).not.toHaveURL(/\/espace-client\/connexion/);
  if (attendu) await expect(page.getByText(attendu).first()).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  expect(await pageEspaceEnErreur(page), `${chemin} : page d'erreur`).toBeNull();
  expect(s.bilan(), `${chemin} : erreurs JS ou 5xx`).toEqual([]);
  return { page, s };
}

const PAGES: [string, string | RegExp][] = [
  ["", /Dossier : BD-7777-/],
  ["/devis", /devis/i],
  ["/documents", /documents/i],
  ["/cartons", /cartons/i],
  ["/conseiller", "Votre conseiller"],
  ["/sav", /SAV|service après-vente|avarie/i],
  ["/services", /services/i],
  ["/tutos", /tuto/i],
  ["/tutos/check-list", "Check-list"],
  ["/visite", /visite/i],
];

test.describe("les pages du client, connecté à son espace", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");
  // Un client, une session : les pages se suivent dans le même worker (un échec relance le worker, et beforeAll avec lui).
  test.describe.configure({ mode: "default" });

  let c: ClientTest;
  let etat: Etat;
  let paiement: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    c = await creerClientEspace(browser, { avecDevis: true });
    // Une session de paiement ouverte sur SON dossier (arrhes de son devis, s'il a été projeté) : la page de paiement a de quoi s'afficher.
    const devis = await ligne<{ id: string; numero: string }>("select id, numero from public.ec_devis where dossier_id = $1 order by numero limit 1", [c.ecDossierId]);
    paiement = (await ligne<{ id: string }>(
      `insert into public.ec_sessions_paiement(cible, cible_id, dossier_id, montant, libelle, statut, reference)
       values ('devis_arrhes', coalesce($2::uuid, gen_random_uuid()), $1, 480, $3, 'ouverte', 'BATTERIE-PAIEMENT') returning id`,
      [c.ecDossierId, devis?.id ?? null, `Arrhes du devis ${devis?.numero ?? "de test"}`],
    ))!.id;
    const ctx = await connecterClient(browser, c);
    etat = await ctx.storageState();
    await ctx.close();
  });

  for (const [sous, attendu] of PAGES) {
    test(`la page ${sous || "de garde"} s'affiche sans erreur`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: etat });
      const { page } = await visiter(ctx, `/espace-client/${c.reference}${sous}`, attendu);
      if (sous === "") {
        // La page de garde : le nom du client et la frise.
        await expect(page.getByRole("link", { name: new RegExp(`${c.prenom} ${c.nom}`) })).toBeVisible();
        await expect(page.getByRole("heading", { name: /Mon déménagement/ })).toBeVisible();
      }
      if (sous === "/devis") await expect(page.getByText(/DV-7777-/).first()).toBeVisible();
      await ctx.close();
    });
  }

  test("chaque tutoriel s'ouvre sans erreur", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etat });
    const { page } = await visiter(ctx, `/espace-client/${c.reference}/tutos`);
    const liens = [...new Set(await page.locator(`a[href^="/espace-client/${c.reference}/tutos/"]`).evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))].filter((h) => !h.endsWith("/check-list"));
    expect(liens.length, "au moins un tutoriel publié").toBeGreaterThan(0);
    for (const href of liens) {
      const v = await visiter(ctx, href);
      await expect(v.page.getByRole("heading").first()).toBeVisible();
      await v.page.close();
    }
    // Un tutoriel qui n'existe pas : la page introuvable de l'espace, pas une erreur.
    const p = await ctx.newPage();
    const s = surveiller(p);
    const r = await p.goto(`${EXT}/espace-client/${c.reference}/tutos/tuto-qui-n-existe-pas`);
    expect(r?.status()).toBe(404);
    await expect(p.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("le paiement en attente se lit, dans l'espace et chez le prestataire simulé (sans payer)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etat });
    const retour = await visiter(ctx, `/espace-client/${c.reference}/paiement/${paiement}`, "Paiement en cours de confirmation");
    await expect(retour.page.getByText("480,00").first()).toBeVisible();
    const simule = await visiter(ctx, `/espace-client/paiement/${paiement}`, "SIMULATION");
    await expect(simule.page.getByRole("button", { name: /Payer/ })).toBeVisible();
    // Rien n'a bougé : la session reste ouverte.
    expect((await ligne<{ statut: string }>("select statut from public.ec_sessions_paiement where id = $1", [paiement]))!.statut).toBe("ouverte");
    await ctx.close();
  });

  test("le conteneur n'existe pas pour un déménagement national : page introuvable propre", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etat });
    const page = await ctx.newPage();
    const s = surveiller(page);
    const r = await page.goto(`${EXT}/espace-client/${c.reference}/conteneur`);
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("le sélecteur « Mes déménagements » s'affiche", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etat });
    const { page } = await visiter(ctx, "/espace-client?choisir=1", `Bonjour ${c.prenom}`);
    await expect(page.getByRole("link", { name: /Ouvrir ce dossier/ })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Déconnexion" })).toBeVisible();
    // Sans « choisir », un seul dossier mène droit à sa page de garde.
    await page.goto(`${EXT}/espace-client`);
    await expect(page).toHaveURL(new RegExp(`/espace-client/${c.reference}`));
    await ctx.close();
  });
});

test.describe("un déménagement maritime : conteneur et pièces du pays", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");

  test("ouvert depuis la fiche du CRM, son espace montre le conteneur et les documents du pays", async ({ browser }) => {
    test.setTimeout(300_000);
    const c = await creerClientEspace(browser, { maritime: true });
    const d = await ligne<{ portee: string; mode_transport: string; pays_destination: string }>("select portee, mode_transport, pays_destination from public.ec_dossiers where id = $1", [c.ecDossierId]);
    expect(d).toEqual({ portee: "international", mode_transport: "maritime", pays_destination: "CA" });
    const ctx = await connecterClient(browser, c);
    const pages: Page[] = [];
    for (const [sous, attendu] of [
      ["", "Montréal"],
      ["/conteneur", /conteneur/i],
      ["/documents", /pays|Canada|douane/i],
      ["/tutos/check-list", "Check-list"],
    ] as [string, string | RegExp][]) {
      pages.push((await visiter(ctx, `/espace-client/${c.reference}${sous}`, attendu)).page);
    }
    await ctx.close();
  });
});
