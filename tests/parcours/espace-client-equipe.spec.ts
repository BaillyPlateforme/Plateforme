import { AVEC_COMPTES, EXT, INT, contexteEn, expect, requeteEn, surveiller, test } from "../outils/banc";
import { LENT, connecterClient, creerClientEspace, liensJournalises, ligne, lignes, nouveauLien, pageEnErreurSure, pageEspaceEnErreur, type ClientTest } from "./espace-client-outils";

/*
 * L'espace client vu de l'équipe (session « equipe ») : les écrans du
 * back-office, la fiche d'un espace, la boîte des messages — et l'aperçu
 * « Voir son espace », qui montre l'espace tel que le client le voit, en
 * lecture seule : rien ne s'y écrit au nom du client, aucune session de
 * client n'est ouverte.
 *
 * La boîte des messages n'est ouverte que sur le dossier d'un client de
 * test : ouverte sans dossier, elle choisit la première conversation et
 * marque lus ses messages — ceux d'un autre client.
 */

/** Une page de l'équipe : statut, pas de retour à la connexion, ni erreur JS, ni 5xx, ni page d'erreur. */
async function verifierPageEquipe(page: import("@playwright/test").Page, chemin: string) {
  const s = surveiller(page);
  const r = await page.goto(INT + chemin, { timeout: LENT });
  expect(r?.status(), `${chemin} : statut`).toBeLessThan(400);
  await expect(page, `${chemin} : la session de l'équipe tient`).not.toHaveURL(/\/login/);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  expect(await pageEnErreurSure(page), `${chemin} : page d'erreur`).toBeNull();
  expect(s.bilan(), `${chemin} : erreurs JS ou 5xx`).toEqual([]);
}

test.describe("le back-office de l'espace client", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");

  for (const chemin of ["", "/journal", "/reglages", "/cartons", "/destinations", "/sav", "/nouveau"]) {
    test(`/dashboard/espace-client${chemin} s'affiche sans erreur @lecture`, async ({ browser }) => {
      const ctx = await contexteEn(browser, "equipe");
      const page = await ctx.newPage();
      await verifierPageEquipe(page, `/dashboard/espace-client${chemin}`);
      await expect(page.getByText("Espace client").first()).toBeVisible();
      await ctx.close();
    });
  }

  test("une adresse d'aperçu forgée n'ouvre rien @lecture", async () => {
    const r = await requeteEn(null);
    const rep = await r.post(`${EXT}/espace-client/apercu`, { form: { jeton: "eyJjIjoieCJ9.faux" } });
    expect(rep.status()).toBe(303);
    expect(rep.headers().location).toBe("/espace-client/connexion?vue-equipe=invalide");
    expect(rep.headers()["set-cookie"] ?? "").not.toMatch(/bailly_espace_client_apercu=[^;]+;/);
    // Sans jeton, à la main : la même réponse.
    const get = await r.get(`${EXT}/espace-client/apercu`);
    expect(get.headers().location).toBe("/espace-client/connexion?vue-equipe=invalide");
  });
});

test.describe("l'espace d'un client vu par l'équipe", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");
  test.describe.configure({ mode: "default" });

  let c: ClientTest;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    c = await creerClientEspace(browser);
  });

  test("la fiche de l'espace et la boîte des messages du dossier s'affichent", async ({ browser }) => {
    const ctx = await contexteEn(browser, "equipe");
    const page = await ctx.newPage();
    await verifierPageEquipe(page, `/dashboard/espace-client/dossiers/${c.ecDossierId}`);
    await expect(page.getByText(c.reference).first()).toBeVisible();
    await verifierPageEquipe(page, `/dashboard/espace-client/messages?dossier=${c.ecDossierId}`);
    await expect(page.getByText(new RegExp(`${c.prenom} ${c.nom}|${c.reference}`)).first()).toBeVisible();
    // Un dossier d'espace qui n'existe pas : une réponse propre, pas une erreur.
    const s = surveiller(page);
    const r = await page.goto(`${INT}/dashboard/espace-client/dossiers/00000000-0000-0000-0000-000000000000`);
    expect(r?.status()).toBeLessThan(500);
    expect(s.bilan().filter((e) => !e.startsWith("console"))).toEqual([]);
    await ctx.close();
  });

  test("« Voir son espace » : l'espace du client en lecture seule, sans rien écrire en son nom", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await contexteEn(browser, "equipe");
    const page = await ctx.newPage();
    const s = surveiller(page);

    // L'ouverture depuis le CRM : la route de l'app interne porte le jeton à l'app externe (POST), qui pose le cookie d'aperçu.
    await page.goto(`${INT}/espace-client-apercu/${c.ecDossierId}`);
    await page.waitForURL(new RegExp(`^${EXT}/espace-client/${c.reference}`), { timeout: LENT });
    const bandeau = page.getByRole("region", { name: "Aperçu de l'équipe" });
    await expect(bandeau).toBeVisible();
    await expect(bandeau).toHaveAttribute("data-mode", "lecture");
    await expect(page.getByText(`Dossier : ${c.reference}`, { exact: true })).toBeVisible();
    expect(await pageEspaceEnErreur(page)).toBeNull();
    // L'ouverture est notée au dossier du CRM ; aucune session du client n'est ouverte.
    await expect.poll(async () => (await lignes("select id from crm.activite where dossier_id = $1 and libelle like 'Espace client ouvert en aperçu (lecture seule)%'", [c.crmDossierId])).length, { timeout: LENT }).toBe(1);

    // La discussion se lit, ne s'écrit pas.
    await page.goto(`${EXT}/espace-client/${c.reference}/conseiller`);
    const fil = page.locator(".fil-page");
    await expect(fil.getByText("Aperçu de l'équipe : la discussion se lit")).toBeVisible();
    await expect(fil.getByRole("textbox")).toBeDisabled();
    await expect(fil.getByRole("button", { name: "Envoyer" })).toBeDisabled();

    // Les CGV : l'envoi est arrêté avant de partir, avec un message.
    await page.goto(`${EXT}/espace-client/${c.reference}/documents#cgv`);
    const cgv = page.locator("#cgv form");
    await cgv.getByText(/J'ai lu et j'accepte les conditions générales de vente/).click();
    await cgv.getByText(/J'accepte le traitement de mes données personnelles/).click();
    await cgv.getByRole("button", { name: "Enregistrer mes acceptations" }).click();
    await expect(page.getByText(/lecture seule/i).last()).toBeVisible();
    await expect(page).not.toHaveURL(/ok=cgv/);

    // Le choix d'une pièce est arrêté au clic.
    const libre = page.locator("form.depot-libre label").first();
    await libre.click();
    await expect(page.getByText(/lecture seule/i).last()).toBeVisible();
    expect(s.bilan(), "aperçu : erreurs JS ou 5xx").toEqual([]);

    // Même en passant outre l'écran (un fichier posé directement dans le champ), le serveur refuse : rien n'est déposé.
    const contournement = await ctx.newPage();
    await contournement.goto(`${EXT}/espace-client/${c.reference}/documents`);
    await contournement.locator("form.depot-libre").getByLabel("Nom du document").fill("Dépôt forcé pendant l'aperçu");
    await contournement.locator('form.depot-libre input[type="file"]').setInputFiles({ name: "force.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await contournement.waitForLoadState("networkidle").catch(() => undefined);
    await contournement.close();

    // Rien n'a été écrit au nom du client.
    expect(await lignes("select id from public.ec_acceptations where dossier_id = $1", [c.ecDossierId]), "aucune acceptation").toEqual([]);
    expect(await lignes("select id from public.ec_documents where dossier_id = $1 and source = 'client'", [c.ecDossierId]), "aucune pièce").toEqual([]);
    expect(await lignes("select id from public.ec_messages where dossier_id = $1", [c.ecDossierId]), "aucun message").toEqual([]);
    expect(Number((await ligne<{ n: string }>("select count(*) n from public.ec_sessions where client_id = $1", [c.ecClientId]))!.n), "aucune session de client").toBe(0);

    // « Quitter » : l'aperçu se ferme, l'espace aussi.
    await page.goto(`${EXT}/espace-client/${c.reference}`);
    await page.getByRole("region", { name: "Aperçu de l'équipe" }).getByRole("link").first().click();
    await page.waitForURL(/\/espace-client\/connexion\?vue-equipe=terminee/, { timeout: LENT });
    await expect(page.getByText("Aperçu de l'équipe terminé")).toBeVisible();
    await page.goto(`${EXT}/espace-client/${c.reference}`);
    await expect(page).toHaveURL(/\/espace-client\/connexion/);
    await ctx.close();
  });

  test("l'aperçu est réservé à l'équipe : sans session, la connexion ; un autre compte, refusé", async ({ browser }) => {
    const r = await requeteEn(null);
    const sans = await r.get(`${INT}/espace-client-apercu/${c.ecDossierId}`);
    expect([302, 307]).toContain(sans.status());
    expect(sans.headers().location).toMatch(/\/login/);
    for (const sorte of ["terrain", "rh", "intrus"] as const) {
      const rs = await requeteEn(sorte);
      const rep = await rs.get(`${INT}/espace-client-apercu/${c.ecDossierId}`);
      expect(rep.status(), sorte).not.toBe(200);
      expect(await rep.text(), sorte).not.toContain('name="jeton"');
    }
    // Une navigation venue d'un autre site est refusée.
    const ctx = await contexteEn(browser, "equipe");
    const rep = await ctx.request.get(`${INT}/espace-client-apercu/${c.ecDossierId}`, { headers: { "sec-fetch-site": "cross-site" } });
    expect(rep.status()).toBe(403);
    await ctx.close();
  });
  test("« Envoyer le lien d'accès » puis « Couper les sessions » : le client connecté perd l'accès, le lien envoyé ne sert plus", async ({ browser }) => {
    test.setTimeout(300_000);
    // Le client entre dans son espace par un vrai lien.
    const client = await connecterClient(browser, c);
    const pc = await client.newPage();
    await pc.goto(`${EXT}/espace-client/${c.reference}`);
    await expect(pc.getByText(`Dossier : ${c.reference}`, { exact: true })).toBeVisible();

    // L'équipe, depuis la fiche de l'espace : un nouveau lien, puis la coupure. Chacun demande confirmation.
    const eq = await contexteEn(browser, "equipe");
    const page = await eq.newPage();
    const s = surveiller(page);
    page.on("dialog", (d) => d.accept());
    await page.goto(`${INT}/dashboard/espace-client/dossiers/${c.ecDossierId}`);
    const avant = await liensJournalises(c.email);
    await page.getByRole("button", { name: "Plus d’actions" }).click();
    await page.getByRole("menu").getByRole("button", { name: /Envoyer le lien d'accès/ }).click();
    const lienEquipe = await nouveauLien(c.email, avant);
    await page.getByRole("button", { name: "Plus d’actions" }).click();
    await page.getByRole("menu").getByRole("button", { name: /Couper les sessions/ }).click();
    await expect(page.getByText(/Sessions coupées/).first()).toBeVisible({ timeout: LENT });
    expect((await ligne<{ le: string | null }>("select sessions_revoquees_le as le from public.ec_clients where id = $1", [c.ecClientId]))!.le).not.toBeNull();
    expect(s.bilan(), "équipe : erreurs JS ou 5xx").toEqual([]);
    await eq.close();

    // Le client : sa session, ouverte avant la coupure, ne lit plus rien.
    await pc.goto(`${EXT}/espace-client/${c.reference}/documents`);
    await expect(pc).toHaveURL(/\/espace-client\/connexion/);
    expect((await client.request.get(`${EXT}/espace-client/discussion/${c.reference}`)).status()).not.toBe(200);
    await client.close();

    // Le lien envoyé juste avant la coupure ne sert plus.
    const autre = await browser.newContext();
    const pa = await autre.newPage();
    await pa.goto(lienEquipe);
    await expect(pa.getByRole("heading", { name: "Ce lien a déjà servi" })).toBeVisible();
    await expect(pa.getByRole("button", { name: /Accéder/ })).toHaveCount(0);
    await autre.close();

    // Un nouveau lien, demandé après la coupure, rouvre l'espace.
    const retour = await connecterClient(browser, c);
    await retour.close();
  });
});
