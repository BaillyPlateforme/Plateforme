/*
 * Les portails des entreprises clientes, dans l'app publique :
 *
 *   /pro/<code>/<nom>   l'espace pro d'une entreprise : le lien remis à ses
 *                       salariés. C'est le code qui ouvre l'espace ; sans lui
 *                       (ou avec un faux), « Cet espace n'est pas disponible ».
 *   /rh/connexion, /rh  l'espace RH : un compte RH ne voit que SON entreprise ;
 *                       l'équipe Bailly choisit l'entreprise à regarder ; tout
 *                       autre compte est renvoyé, proprement.
 *
 * Bureau seulement. Les comptes de test (tests/.etat) n'existent qu'en recette.
 */
import type { Page } from "@playwright/test";
import { DUREE_PARCOURS, TEL_FICTIF, action, champ, choisirVille, exigerEcritures, expect, test, verifierPagePropre } from "./formulaire-outils";
import { AVEC_COMPTES, EXT, INT, comptes, emailUnique, fichierSession, requeteEn, surveiller, type Sorte } from "../outils/banc";

test.describe.configure({ mode: "parallel", timeout: DUREE_PARCOURS });

type Espace = { id: string; slug: string; nom: string; titre?: string; actif: boolean; code: string; parcours: string };

/** Les espaces pro de la recette, avec leur code, tels que l'équipe les lit (session de test « equipe »). */
async function espacesPro(): Promise<Espace[]> {
  const r = await requeteEn("equipe");
  const rep = await r.get(INT + "/api/data/espaces-pro");
  expect(rep.status(), "lecture des espaces par l'équipe").toBe(200);
  const espaces = (await rep.json()).espaces as Espace[];
  await r.dispose();
  return espaces;
}

async function espace(slug: string): Promise<Espace> {
  const e = (await espacesPro()).find((x) => x.slug === slug);
  test.skip(!e || !e.actif || !e.code, `espace « ${slug} » absent ou en pause en recette`);
  return e!;
}

const titreAttendu = (e: Espace) => e.titre?.trim() || (e.slug === "standard" ? "Votre déménagement professionnel" : `Votre déménagement avec ${e.nom}`);

async function espaceIndisponible(page: Page, chemin: string) {
  const rep = await page.goto(EXT + chemin);
  expect(rep?.status(), chemin).toBeLessThan(500);
  await expect(page.getByRole("heading", { name: /Cet espace n.est pas disponible/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Faire une estimation" })).toHaveAttribute("href", "/");
  // Le titre ne dit rien de l'entreprise, et la page ne se référence pas.
  await expect(page).toHaveTitle("Espace pro — Bailly Déménagement");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
}

/*
 * La page de connexion RH précharge son lien « Aller à l'espace équipe » (/login), que l'app publique
 * redirige vers l'app de l'équipe, sur une autre origine : le navigateur refuse la réponse (CORS) et
 * l'écrit en console. Défaut connu, prouvé par son propre test (plus bas) ; les autres tests de ces
 * pages l'écartent pour vérifier ce qui les concerne.
 */
function sansPrechargementLogin(bilan: string[]): string[] {
  const lies = bilan.filter((e) => /\/login\?_rsc=|Failed to fetch RSC payload for [^ ]*\/login/.test(e));
  if (!lies.length) return bilan;
  return bilan.filter((e) => !lies.includes(e) && e !== "console : Failed to load resource: net::ERR_FAILED");
}

/** Le bilan de la page, sans le défaut connu du préchargement de /login. */
async function pagePropre(page: Page, visiteur: { bilan: () => string[] }) {
  await verifierPagePropre(page, { bilan: () => sansPrechargementLogin(visiteur.bilan()) });
}

/* ───────────────────────── Les espaces pro ───────────────────────── */

test("/pro, un code faux, un nom sans code : « Cet espace n'est pas disponible », sans erreur @lecture", async ({ page, visiteur }) => {
  await espaceIndisponible(page, "/pro");
  await espaceIndisponible(page, "/pro/carrefour");
  await espaceIndisponible(page, "/pro/zzzzzzzzzz/carrefour");
  await espaceIndisponible(page, "/pro/zzzzzzzzzz/standard?demande=1");
  await verifierPagePropre(page, visiteur);
});

test("le lien de l'espace pro standard : son accueil, son formulaire, et un nom faux ramené au bon lien @lecture", async ({ page, visiteur }) => {
  test.skip(!AVEC_COMPTES, "les codes se lisent avec la session de l'équipe (recette)");
  const e = await espace("standard");

  // Le nom du lien n'est qu'une étiquette : un autre nom, avec le bon code, ramène au lien exact.
  await page.goto(`${EXT}/pro/${e.code}/une-autre-entreprise`);
  await expect(page).toHaveURL(`${EXT}/pro/${e.code}/${e.slug}`);
  await expect(page.getByRole("heading", { name: titreAttendu(e) })).toBeVisible();
  await expect(page).toHaveTitle(`${titreAttendu(e)} — Bailly Déménagement`);
  await expect(page.getByText("Espace réservé aux entreprises")).toBeVisible();

  // « Commencer ma demande » : le formulaire de l'espace, à la même adresse ; « Accueil » y ramène.
  await page.getByRole("button", { name: "Commencer ma demande" }).click();
  await expect(page.getByRole("heading", { name: e.parcours === "express" ? /Estimation rapide|Demande rapide/ : /Parlez-nous de vous/ })).toBeVisible();
  await expect(page.getByText(/Espace pro/).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Accueil" }).click();
  await expect(page.getByRole("button", { name: "Commencer ma demande" })).toBeVisible();

  // ?demande=1 saute l'accueil (un lien glissé dans un intranet).
  await page.goto(`${EXT}/pro/${e.code}/${e.slug}?demande=1`);
  await expect(page.getByRole("button", { name: "Commencer ma demande" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: e.parcours === "express" ? /Estimation rapide|Demande rapide/ : /Parlez-nous de vous/ })).toBeVisible();
  await verifierPagePropre(page, visiteur);
});

test("une demande faite par le lien Carrefour porte l'espace, et paraît dans l'espace RH de Carrefour", async ({ page, visiteur, db, browser }) => {
  exigerEcritures();
  test.skip(!AVEC_COMPTES);
  const e = await espace("carrefour");
  const email = emailUnique("carrefour");

  await page.goto(`${EXT}/pro/${e.code}/${e.slug}`);
  await expect(page.getByRole("heading", { name: titreAttendu(e) })).toBeVisible();
  await expect(page.getByText(`Espace réservé aux collaborateurs de ${e.nom}`)).toBeVisible();
  await page.getByRole("button", { name: "Commencer ma demande" }).click();

  // Le parcours de l'espace : ses questions seulement, ses étapes, jusqu'à l'envoi.
  await expect(page.getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Entreprise" })).toHaveCount(0);
  await champ(page, "Prénom").fill("Testeur");
  await champ(page, "Nom").fill("Carrefour Batterie");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(email);
  await action(page, "Continuer").click();
  await choisirVille(page.getByLabel(/^Ville/), "lille");
  await page.getByLabel(/^Surface habitable/).fill("70");
  await action(page, "Continuer").click();
  await choisirVille(page.getByLabel(/^Ville/), "bordeaux");
  await page.getByLabel(/^Surface habitable/).fill("75");
  // Jusqu'à l'inventaire : les étapes que l'espace garde (prestations, démontage) passent avec leurs valeurs par défaut.
  while (!(await page.getByRole("button", { name: /Je connais mon volume/ }).isVisible())) {
    await expect(action(page, "Continuer")).toBeEnabled();
    await action(page, "Continuer").click();
  }
  await page.getByLabel("Volume estimé").fill("35");
  await action(page, "Continuer").click();
  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();
  await action(page, "Envoyer ma demande").click();
  await expect(page.getByRole("heading", { name: "Demande envoyée" })).toBeVisible({ timeout: 60_000 });

  // En base : la demande est rattachée à l'espace, comme une mobilité portée par l'employeur.
  const r = await db.demande(email);
  expect(r.raw_payload.espace).toMatchObject({ slug: "carrefour" });
  expect(r.raw_payload.mutation_pro).toBe(true);
  expect(r.raw_payload.societe).toBe(e.nom);
  expect(r.raw_payload.espace_code).toBeUndefined();
  await verifierPagePropre(page, visiteur);

  // L'espace RH de Carrefour la montre, dans ses collaborateurs.
  const rh = await browser.newContext({ storageState: fichierSession("rh"), viewport: { width: 1440, height: 900 } });
  const pageRh = await rh.newPage();
  const s = surveiller(pageRh);
  await pageRh.goto(`${EXT}/rh#collaborateurs`);
  await pageRh.getByPlaceholder("Collaborateur, ville, référence…").fill("Carrefour Batterie");
  await expect(pageRh.getByText("Testeur Carrefour Batterie").first()).toBeVisible({ timeout: 45_000 });
  expect(s.bilan()).toEqual([]);
  await rh.close();
});

/* ───────────────────────── L'espace RH ───────────────────────── */

/** Ouvre une page avec la session d'un compte de test, et la surveille. */
async function pageEn(browser: import("@playwright/test").Browser, sorte: Sorte) {
  const ctx = await browser.newContext({ storageState: fichierSession(sorte), viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  return { ctx, page, s: surveiller(page) };
}

test("/rh sans session : renvoi vers la connexion RH @lecture", async ({ page, visiteur }) => {
  await page.goto(EXT + "/rh");
  await expect(page).toHaveURL(`${EXT}/rh/connexion`);
  await expect(page.getByRole("heading", { name: "Connexion à votre espace" })).toBeVisible();
  await expect(page.getByLabel("Adresse e-mail professionnelle")).toBeFocused();
  await pagePropre(page, visiteur);
});

test("connexion RH : un mauvais mot de passe est refusé avec un message clair @lecture", async ({ page, visiteur }) => {
  test.skip(!AVEC_COMPTES);
  await page.goto(EXT + "/rh/connexion");
  await page.getByLabel("Adresse e-mail professionnelle").fill(comptes().rh.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("pas-le-bon-mot-de-passe");
  await page.getByRole("button", { name: "Accéder à mon espace RH" }).click();
  // (Le second « alert » de la page est l'annonceur de navigation de Next, vide.)
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Adresse e-mail ou mot de passe incorrect.");
  await expect(page).toHaveURL(`${EXT}/rh/connexion`);
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("pas-le-bon-mot-de-passe");

  // « Mot de passe oublié ? » : pas de lien de réinitialisation, mais à qui s'adresser.
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await expect(page.getByText(/contactez votre interlocuteur Bailly Déménagement, ou le standard/)).toBeVisible();
  await pagePropre(page, visiteur);
});

test("connexion RH : le bon mot de passe ouvre l'espace de SON entreprise, ses vues et son lien @lecture", async ({ page, visiteur }) => {
  test.skip(!AVEC_COMPTES);
  const rh = comptes().rh;
  await page.goto(EXT + "/rh/connexion");
  await page.getByLabel("Adresse e-mail professionnelle").fill(rh.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(rh.motDePasse);
  await page.getByRole("button", { name: "Accéder à mon espace RH" }).click();

  await expect(page).toHaveURL(`${EXT}/rh`);
  await expect(page.getByRole("heading", { name: "Tableau de bord", exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Espace RH de Carrefour, opéré par Bailly Déménagement/)).toBeVisible();
  // Un compte RH ne voit que le réel : pas de bandeau d'aperçu de l'équipe.
  await expect(page.getByText(/aperçu équipe/i)).toHaveCount(0);

  await page.getByRole("button", { name: /Collaborateurs/ }).first().click();
  await expect(page.getByRole("heading", { name: "Collaborateurs", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#collaborateurs$/);
  await page.getByRole("button", { name: /Budget/ }).first().click();
  await expect(page.getByRole("heading", { name: "Budget", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Lien salariés/ }).click();
  await expect(page.getByRole("heading", { name: "Lien salariés", exact: true })).toBeVisible();

  // Le lien à transmettre aux salariés mène à l'espace pro de Carrefour.
  const lien = (await page.getByText(/\/pro\/[a-z0-9]+\/carrefour/).first().innerText()).trim();
  const chemin = lien.slice(lien.indexOf("/pro/"));
  // Un rechargement rouvre la même vue (#lien).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lien salariés", exact: true })).toBeVisible();
  await pagePropre(page, visiteur);

  await page.goto(EXT + chemin);
  await expect(page.getByRole("heading", { name: /Votre déménagement avec Carrefour/ })).toBeVisible();
});

test("un compte de l'équipe sur /rh choisit l'entreprise à regarder @lecture", async ({ browser }) => {
  test.skip(!AVEC_COMPTES);
  const { ctx, page, s } = await pageEn(browser, "equipe");
  await page.goto(EXT + "/rh");
  await expect(page.getByRole("heading", { name: "Quel espace voulez-vous voir ?" })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("link", { name: /Carrefour/ }).click();
  await expect(page).toHaveURL(/\/rh\?apercu=carrefour/);
  await expect(page.getByRole("heading", { name: "Tableau de bord", exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Espace RH de Carrefour/)).toBeVisible();
  expect(s.bilan()).toEqual([]);
  await ctx.close();
});

test("un client de l'espace client ou un déménageur sur /rh : renvoyé à la connexion RH @lecture", async ({ browser }) => {
  test.skip(!AVEC_COMPTES);
  for (const sorte of ["client", "terrain"] as const) {
    const { ctx, page, s } = await pageEn(browser, sorte);
    await page.goto(EXT + "/rh");
    await expect(page, sorte).toHaveURL(`${EXT}/rh/connexion`);
    await expect(page.getByRole("heading", { name: "Connexion à votre espace" })).toBeVisible();
    const rep = await page.request.get(EXT + "/api/rh/donnees");
    expect(rep.status(), `${sorte} : données RH`).toBe(401);
    expect(sansPrechargementLogin(s.bilan())).toEqual([]);
    await ctx.close();
  }
});

// Un compte connecté qui n'est ni RH ni membre actif de l'équipe — sans rôle (inscription ouverte, ou membre
// de l'équipe désactivé) ou au rôle inconnu : le proxy l'envoie de /rh à /rh/connexion?refus=1, qui dit
// pourquoi. Avant, la page recevait 401 de /api/rh/donnees et partait vers /rh/connexion, que le proxy
// renvoyait aussitôt vers /rh : une boucle sans fin.
test("un compte sans droit (hors équipe, ou rôle inconnu) sur /rh : refus propre, sans boucle de redirections @lecture", async ({ browser }) => {
  test.skip(!AVEC_COMPTES);
  for (const sorte of ["intrus", "inconnu"] as const) {
    const { ctx, page, s } = await pageEn(browser, sorte);
    const navigations: string[] = [];
    page.on("framenavigated", (f) => f === page.mainFrame() && navigations.push(new URL(f.url()).pathname));
    await page.goto(EXT + "/rh");
    // Attente fixe, voulue : on mesure ce qui se passe PENDANT six secondes (une boucle y fait des dizaines de tours).
    await page.waitForTimeout(6_000);
    expect(navigations.length, `${sorte} : navigations en 6 s (${navigations.slice(0, 6).join(" → ")}…)`).toBeLessThanOrEqual(3);
    await expect(page.getByText(/Connexion à votre espace|n.avez pas accès|Accès refusé|Espace indisponible/).first()).toBeVisible();
    expect((await page.request.get(EXT + "/api/rh/donnees")).status()).toBe(401);
    expect(sansPrechargementLogin(s.bilan())).toEqual([]);
    await ctx.close();
  }
});

// La page de connexion RH portait un <Link href="/login"> (« Aller à l'espace équipe ») vers une adresse que
// l'app publique redirige vers l'app de l'équipe, sur une autre origine : Next le préchargeait, le navigateur
// refusait la réponse (CORS) et l'écrivait en console. C'est désormais un simple lien vers l'app de l'équipe.
test("connexion RH : aucune erreur en console, et « Aller à l'espace équipe » mène à la connexion de l'équipe @lecture", async ({ page, visiteur }) => {
  await page.goto(EXT + "/rh/connexion");
  await page.waitForLoadState("networkidle");
  await verifierPagePropre(page, visiteur);
  await page.getByRole("link", { name: "Aller à l'espace équipe" }).click();
  await expect(page).toHaveURL(new RegExp(`^${INT}/login`));
  expect(visiteur.bilan()).toEqual([]);
});

