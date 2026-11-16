import type { BrowserContext } from "@playwright/test";
import { AVEC_COMPTES, EXT, INT, contexteEn, expect, surveiller, test } from "../outils/banc";
import { service } from "../outils/comptes.mjs";
import { LENT, cheminsDeposes, connecterClient, creerClientEspace, ligne, lignes, pageEspaceEnErreur, type ClientTest } from "./espace-client-outils";

/*
 * Ce que fait le client dans SON espace, de bout en bout, sur un client de
 * test : écrire à son conseiller (et l'équipe le lit dans le CRM), déposer
 * une pièce (et se voir refuser un mauvais fichier), accepter les CGV — la
 * check-list le coche —, marquer un tutoriel comme vu, se déconnecter (et
 * l'ancienne session ne lit plus rien). Les fichiers sont fabriqués ici.
 */

type Etat = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** Un PDF minimal, valide. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
/** Une image PNG d'un pixel. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
/** Un « PDF » de 10,5 Mo : au-delà de la limite de 10 Mo. */
const TROP_GROS = Buffer.alloc(Math.round(10.5 * 1024 * 1024), 0x20);

test.describe("les gestes du client dans son espace", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");
  test.describe.configure({ mode: "default" });

  let c: ClientTest;
  let etat: Etat;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    c = await creerClientEspace(browser);
    const ctx = await connecterClient(browser, c);
    etat = await ctx.storageState();
    await ctx.close();
  });

  test.afterAll(async () => {
    // Les fichiers déposés dans le seau privé : le nettoyage de la batterie efface les lignes, pas les fichiers.
    if (!c) return;
    const chemins = await cheminsDeposes([c.ecDossierId]);
    if (chemins.length) await service().storage.from("espace-client").remove(chemins);
  });

  test("un message au conseiller, avec une photo, arrive chez l'équipe — et le client voit qu'il est lu", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ storageState: etat });
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(`${EXT}/espace-client/${c.reference}/conseiller`);
    const fil = page.locator(".fil-page");
    await expect(fil.getByRole("heading", { name: /Écrivez à/ })).toBeVisible();

    // Une pièce d'un type refusé : le message le dit, rien ne part.
    await fil.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("bonjour") });
    await expect(fil.getByRole("alert")).toContainText("format non accepté");

    // Le message et sa photo.
    const texte = `Bonjour, question de la batterie ${Date.now()} : faut-il démonter le lit ?`;
    await fil.locator('input[type="file"]').setInputFiles({ name: "salon.png", mimeType: "image/png", buffer: PNG });
    await expect(fil.getByText("salon.png")).toBeVisible();
    await fil.getByRole("textbox", { name: /Votre message à/ }).fill(texte);
    await fil.getByRole("button", { name: "Envoyer" }).click();
    await expect(fil.locator(".fil-bulle").filter({ hasText: texte })).toBeVisible({ timeout: LENT });
    await expect(fil.locator(".fil-etat")).toContainText("Envoyé", { timeout: LENT });
    const m = await ligne<{ id: string; piece_nom: string | null; auteur: string }>("select id, piece_nom, auteur from public.ec_messages where dossier_id = $1 and corps = $2", [c.ecDossierId, texte]);
    expect(m).toMatchObject({ auteur: "client", piece_nom: "salon.png" });

    // L'équipe : Espace client › Messages, la conversation du dossier.
    const eq = await contexteEn(browser, "equipe");
    const pe = await eq.newPage();
    const se = surveiller(pe);
    await pe.goto(`${INT}/dashboard/espace-client/messages?dossier=${c.ecDossierId}`);
    await expect(pe.getByText(texte).first()).toBeVisible({ timeout: LENT });
    // La photo jointe s'affiche chez l'équipe : servie par sa propre porte (/api/data/espace-client/…), image décodée.
    const photo = pe.getByRole("img", { name: "salon.png" }).first();
    await expect(photo).toBeVisible({ timeout: LENT });
    await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth), { timeout: LENT }).toBeGreaterThan(0);
    // Vu à l'écran par l'équipe : marqué lu…
    await expect.poll(async () => (await ligne<{ lu: string | null }>("select lu_par_equipe_le as lu from public.ec_messages where id = $1", [m!.id]))?.lu ?? null, { timeout: LENT }).not.toBeNull();
    expect(se.bilan(), "équipe : erreurs JS ou 5xx").toEqual([]);
    await eq.close();

    // … et le client le voit : « Lu ».
    await page.reload();
    await expect(page.locator(".fil-page .fil-etat")).toContainText("Lu", { timeout: LENT });
    expect(s.bilan(), "client : erreurs JS ou 5xx").toEqual([]);
    await ctx.close();
  });

  test("une pièce se dépose ; un mauvais type et un fichier trop lourd sont refusés", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ storageState: etat });
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(`${EXT}/espace-client/${c.reference}/documents`);
    const avant = Number((await ligne<{ n: string }>("select count(*) n from public.ec_documents where dossier_id = $1", [c.ecDossierId]))!.n);

    // Les refus, dans le dépôt libre : rien ne part au serveur.
    const libre = page.locator("form.depot-libre");
    await libre.getByLabel("Nom du document").fill("Attestation de test");
    await libre.locator('input[type="file"]').setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
    await expect(libre.getByRole("alert")).toContainText("format non accepté");
    await libre.locator('input[type="file"]').setInputFiles({ name: "enorme.pdf", mimeType: "application/pdf", buffer: TROP_GROS });
    await expect(libre.getByRole("alert")).toContainText("dépasse 10 Mo");
    expect(Number((await ligne<{ n: string }>("select count(*) n from public.ec_documents where dossier_id = $1", [c.ecDossierId]))!.n)).toBe(avant);

    // Une pièce demandée : « Déposer », le fichier part aussitôt, la ligne passe à « Reçu ».
    const ligneAttendue = page.locator("#pieces .ck").filter({ has: page.locator("form.depot-piece") }).first();
    await expect(ligneAttendue).toBeVisible();
    const libelle = (await ligneAttendue.locator("strong").innerText()).split("\n")[0].trim();
    await ligneAttendue.locator('input[type="file"]').setInputFiles({ name: "piece-identite.pdf", mimeType: "application/pdf", buffer: PDF });
    await page.waitForURL(/documents\?ok=piece/, { timeout: LENT });
    const recue = page.locator("#pieces .ck.ok").filter({ hasText: "piece-identite.pdf" });
    await expect(recue).toBeVisible();
    await expect(recue.getByText("Reçu")).toBeVisible();
    expect(libelle.length).toBeGreaterThan(0);
    const doc = await ligne<{ id: string; source: string; mime: string }>("select id, source, mime from public.ec_documents where dossier_id = $1 and nom_fichier = 'piece-identite.pdf'", [c.ecDossierId]);
    expect(doc).toMatchObject({ source: "client", mime: "application/pdf" });

    // Le client relit sa pièce par son lien signé.
    const href = await recue.getByRole("link", { name: "piece-identite.pdf" }).getAttribute("href");
    const r = await ctx.request.get(EXT + href!);
    expect(r.status()).toBe(200);
    expect((await r.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await pageEspaceEnErreur(page)).toBeNull();
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("accepter les CGV et le RGPD coche la ligne de la check-list", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ storageState: etat });
    const page = await ctx.newPage();
    const s = surveiller(page);
    const ligneCgv = page.locator(".cl-espace li").filter({ hasText: "CGV et RGPD" });

    await page.goto(`${EXT}/espace-client/${c.reference}/tutos/check-list`);
    await expect(ligneCgv).toBeVisible();
    await expect(ligneCgv).not.toHaveClass(/fait/);

    await page.goto(`${EXT}/espace-client/${c.reference}/documents#cgv`);
    const form = page.locator("#cgv form");
    // Sans les cases : refusé, sous les cases.
    await form.getByRole("button", { name: "Enregistrer mes acceptations" }).click();
    await expect(form.locator(".has-error, [role=alert]").first()).toBeVisible();
    await form.getByText(/J'ai lu et j'accepte les conditions générales de vente/).click();
    await form.getByText(/J'accepte le traitement de mes données personnelles/).click();
    await form.getByRole("button", { name: "Enregistrer mes acceptations" }).click();
    await page.waitForURL(/documents\?ok=cgv/, { timeout: LENT });
    const acceptees = await lignes<{ type: string }>("select type from public.ec_acceptations where dossier_id = $1 order by type", [c.ecDossierId]);
    expect(acceptees.map((a) => a.type)).toEqual(["cgv", "rgpd"]);

    await page.goto(`${EXT}/espace-client/${c.reference}/tutos/check-list`);
    await expect(ligneCgv).toHaveClass(/fait/);
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("marquer un tutoriel comme vu", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ storageState: etat });
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(`${EXT}/espace-client/${c.reference}/tutos`);
    const premier = page.locator(`a[href^="/espace-client/${c.reference}/tutos/"]:not([href$="/check-list"])`).first();
    const href = await premier.getAttribute("href");
    await page.goto(EXT + href!);
    await page.getByRole("button", { name: /Marquer comme vu/ }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Tutoriel vu" }).first()).toBeVisible({ timeout: LENT });
    await expect.poll(async () => Number((await ligne<{ n: string }>("select count(*) n from public.ec_tutos_vus where client_id = $1", [c.ecClientId]))!.n), { timeout: LENT }).toBe(1);
    // Relu : toujours vu.
    await page.reload();
    await expect(page.getByText("Tutoriel vu").first()).toBeVisible();
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("la déconnexion ferme l'espace, et l'ancienne session ne lit plus rien", async ({ browser }) => {
    test.setTimeout(240_000);
    // Une session à part : celle des autres tests de ce fichier reste ouverte.
    const ctx = await connecterClient(browser, c);
    const avantDeconnexion = await ctx.storageState();
    const page = await ctx.newPage();
    const s = surveiller(page);
    await page.goto(`${EXT}/espace-client?choisir=1`);
    await page.getByRole("link", { name: "Déconnexion" }).click();
    await page.waitForURL(/\/espace-client\/connexion\?au-revoir=1/, { timeout: LENT });
    await expect(page.getByText("Vous êtes déconnecté. À bientôt !")).toBeVisible();
    await page.goto(`${EXT}/espace-client/${c.reference}`);
    await expect(page).toHaveURL(/\/espace-client\/connexion/);
    expect(s.bilan()).toEqual([]);
    await ctx.close();

    // Les cookies d'avant la déconnexion, rejoués : la session est fermée au registre, rien ne se lit.
    const rejeu = await browser.newContext({ storageState: avantDeconnexion });
    const p2 = await rejeu.newPage();
    await p2.goto(`${EXT}/espace-client/${c.reference}/documents`);
    await expect(p2).toHaveURL(/\/espace-client\/connexion/);
    const fil = await rejeu.request.get(`${EXT}/espace-client/discussion/${c.reference}`);
    expect(fil.status()).toBe(404);
    await rejeu.close();

    // La session des autres tests, elle, tient toujours.
    const autre = await browser.newContext({ storageState: etat });
    const p3 = await autre.newPage();
    await p3.goto(`${EXT}/espace-client/${c.reference}`);
    await expect(p3.getByText(`Dossier : ${c.reference}`, { exact: true })).toBeVisible();
    await autre.close();
  });
});
