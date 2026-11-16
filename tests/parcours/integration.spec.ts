/*
 * Le devis dans une page du site officiel (WordPress de Bailly) : un bloc
 * <div data-bailly-devis> et le script public/integration.js posent un cadre
 * (iframe) qui affiche le formulaire, et le tiennent à la hauteur de son
 * contenu. Le site officiel est simulé : la page est servie par le test à son
 * adresse réelle (https://www.demenagements-bailly.com/devis-test/).
 *
 * Un site tiers ne doit PAS pouvoir afficher le formulaire : l'en-tête
 * Content-Security-Policy « frame-ancestors » de l'app ne nomme que le site
 * officiel (et l'app de l'équipe).
 *
 * Bureau seulement. Sur ce poste, l'app répond sur http://localhost : Chrome
 * bloque d'office une page publique qui appelle une adresse locale (Local
 * Network Access) — la permission est accordée au contexte, ce qu'aucun vrai
 * visiteur n'a à faire (l'app réelle est publique).
 */
import type { BrowserContext, FrameLocator, Page } from "@playwright/test";
import { DUREE_PARCOURS, TEL_FICTIF, champ, choisirVille, exigerEcritures, expect, test, verifierPagePropre } from "./formulaire-outils";
import { EXT, LOCAL, emailUnique } from "../outils/banc";

test.describe.configure({ mode: "parallel", timeout: DUREE_PARCOURS });

const OFFICIEL = "https://www.demenagements-bailly.com/devis-test/";
const TIERS = "https://site-tiers.example/devis/";

/** La page d'un site qui pose le bloc du devis — sous un menu fixe de 80 px, comme le site officiel. */
const pageHote = (attributs: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Devis — site hôte</title></head>
<body style="margin:0;font-family:sans-serif">
  <header style="position:fixed;top:0;left:0;right:0;height:80px;background:#1b1a18;color:#fff;z-index:10">Menu du site</header>
  <main style="padding-top:120px">
    <h1>Demander un devis</h1>
    <div data-bailly-devis ${attributs}><a href="${EXT}/">Faire ma demande de devis</a></div>
  </main>
  <footer style="height:1200px;background:#eee">Pied du site</footer>
  <script src="${EXT}/integration.js" async></script>
</body></html>`;

/**
 * Sert la page hôte à l'adresse voulue. `?cas=` choisit les attributs du bloc ;
 * le reste de l'adresse (parcours, mode…) est lu par le script lui-même.
 */
async function servirHote(context: BrowserContext, adresse: string, cas: Record<string, string> = { "": 'data-decalage="80"' }) {
  if (LOCAL) await context.grantPermissions(["local-network-access"]);
  const prefixe = adresse.replace(/\/$/, "");
  await context.route(
    (url) => url.href.startsWith(prefixe),
    (route) => {
      const c = new URL(route.request().url()).searchParams.get("cas") ?? "";
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: pageHote(cas[c] ?? cas[""]) });
    },
  );
}

const cadre = (page: Page) => page.locator("[data-bailly-devis] iframe");
const devis = (page: Page): FrameLocator => page.frameLocator("[data-bailly-devis] iframe");

/** La hauteur du cadre (posée par le script) et celle du contenu qu'il affiche. */
async function hauteurs(page: Page) {
  const duCadre = await cadre(page).evaluate((e) => parseInt((e as HTMLIFrameElement).style.height, 10));
  const frame = page.frames().find((f) => f.url().startsWith(EXT));
  const duContenu = frame
    ? await frame.evaluate(() => {
        // Le bloc du formulaire : le plus haut des <div> de <body> (Next en pose un premier, vide et caché).
        const blocs = [...document.body.children].filter((e) => e.tagName === "DIV");
        return blocs.length ? Math.max(...blocs.map((e) => Math.ceil(e.getBoundingClientRect().height))) : -1;
      })
    : -1;
  return { duCadre, duContenu };
}

/** Le cadre a la hauteur exacte de son contenu (à un pixel près). */
async function cadreAjuste(page: Page) {
  await expect
    .poll(async () => {
      const h = await hauteurs(page);
      return h.duContenu > 0 && Math.abs(h.duCadre - h.duContenu) <= 1;
    }, { message: "hauteur du cadre = hauteur du contenu" })
    .toBe(true);
  return (await hauteurs(page)).duCadre;
}

test("le site officiel affiche le devis en cadre, à la hauteur de son contenu @lecture", async ({ page, context, visiteur }) => {
  await servirHote(context, OFFICIEL);
  await page.goto(OFFICIEL);

  await expect(cadre(page)).toHaveAttribute("src", `${EXT}/?integre=1`);
  await expect(cadre(page)).toHaveAttribute("title", "Demande de devis — Bailly Déménagement");
  // Le lien de secours laissé dans le bloc cède la place au cadre.
  await expect(page.getByRole("link", { name: "Faire ma demande de devis" })).toHaveCount(0);

  const d = devis(page);
  await expect(d.getByRole("heading", { name: /Votre déménagement, estimé en temps réel/ })).toBeVisible();
  await expect(d.getByRole("button", { name: /Je suis un particulier/ })).toBeVisible();
  // Intégré : ni l'en-tête, ni le pied du site de la plateforme — le site officiel a les siens.
  await expect(d.getByText("Estimations indicatives, sans valeur de devis contractuel.")).toHaveCount(0);
  await expect(d.getByRole("banner")).toHaveCount(0);

  // Le script règle d'abord 900 px, puis la hauteur que la page lui annonce.
  const portes = await cadreAjuste(page);
  expect(portes).not.toBe(900);

  // Une porte, puis le devis express : le cadre suit, sans barre de défilement à lui.
  await d.getByRole("button", { name: /Je suis un particulier/ }).click();
  await d.getByRole("button", { name: /Commencer le devis express/ }).click();
  await expect(d.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();
  await expect(d.getByRole("button", { name: "Choix du devis" })).toBeVisible();
  await expect(d.getByRole("button", { name: "Accueil" })).toHaveCount(0);
  const formulaire = await cadreAjuste(page);
  expect(formulaire).toBeGreaterThan(portes);

  // « Choix du devis » ramène aux portes, dans le même cadre.
  await d.getByRole("button", { name: "Choix du devis" }).click();
  await expect(d.getByRole("button", { name: /Commencer le devis express/ })).toBeVisible();
  await cadreAjuste(page);
  await expect(page).toHaveURL(OFFICIEL);
  await verifierPagePropre(page, visiteur);
});

test("un site tiers ne peut pas afficher le devis : frame-ancestors ne nomme que le site officiel @lecture", async ({ page, context }) => {
  // L'en-tête lui-même.
  const rep = await page.request.get(`${EXT}/?integre=1`);
  const csp = rep.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/frame-ancestors\s/);
  expect(csp).toContain("https://www.demenagements-bailly.com");
  expect(csp).not.toContain("site-tiers.example");
  expect(csp).not.toMatch(/frame-ancestors[^;]*\*/);

  // Et son effet, dans le navigateur.
  await servirHote(context, TIERS);
  const refus = page.waitForEvent("console", (m) => /frame-ancestors/.test(m.text()));
  await page.goto(TIERS);
  await expect(cadre(page)).toHaveCount(1);
  await refus;
  await expect(devis(page).getByRole("button", { name: /Je suis un particulier/ })).toHaveCount(0);
  expect(page.frames().some((f) => f.url().startsWith(EXT)), "le cadre ne charge pas l'app").toBe(false);
});

test("data-parcours, data-mode, data-transfert — et l'adresse de la page — choisissent la porte @lecture", async ({ page, context, visiteur }) => {
  await servirHote(context, OFFICIEL, {
    "": "",
    entreprise: 'data-parcours="entreprise"',
    express: 'data-parcours="particulier" data-mode="express"',
    projet: 'data-parcours="entreprise" data-transfert="projet"',
  });
  const d = devis(page);

  // Un bloc dédié aux entreprises : leurs deux branches, sans retour aux trois portes.
  await page.goto(`${OFFICIEL}?cas=entreprise`);
  await expect(cadre(page)).toHaveAttribute("src", `${EXT}/?integre=1&parcours=entreprise`);
  await expect(d.getByRole("heading", { name: /Déménagez votre entreprise/ })).toBeVisible();
  await expect(d.getByRole("button", { name: /Décrire mon transfert/ })).toBeVisible();
  await expect(d.getByRole("button", { name: /Présenter mon projet/ })).toBeVisible();
  await expect(d.getByRole("button", { name: /Je suis un particulier/ })).toHaveCount(0);
  await expect(d.getByRole("button", { name: "Retour" })).toHaveCount(0);

  // Le devis express, ouvert directement.
  await page.goto(`${OFFICIEL}?cas=express`);
  await expect(cadre(page)).toHaveAttribute("src", `${EXT}/?integre=1&parcours=particulier&mode=express`);
  await expect(d.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();

  // Le projet important d'une entreprise.
  await page.goto(`${OFFICIEL}?cas=projet`);
  await expect(cadre(page)).toHaveAttribute("src", `${EXT}/?integre=1&parcours=entreprise&transfert=projet`);
  await expect(d.getByPlaceholder(/Nous déménageons notre siège/)).toBeVisible();

  // Sans attribut, l'adresse de la page décide : /devis/?parcours=mutation.
  await page.goto(`${OFFICIEL}?parcours=mutation`);
  await expect(cadre(page)).toHaveAttribute("src", `${EXT}/?integre=1&parcours=mutation`);
  await expect(d.getByLabel(/Par quelle entreprise/)).toBeVisible();

  await verifierPagePropre(page, visiteur);
});

test("une demande envoyée depuis le cadre arrive en base, et la page du site revient sur le formulaire", async ({ page, context, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("cadre");
  await servirHote(context, OFFICIEL, { "": 'data-parcours="particulier" data-mode="express" data-decalage="80"' });
  await page.goto(OFFICIEL);
  const d = devis(page);
  const corps = d.locator("body");

  await expect(d.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();
  await champ(corps, "Nom").fill("Testeur Cadre");
  await champ(corps, "E-mail").fill(email);
  await champ(corps, "Téléphone").fill(TEL_FICTIF);
  await choisirVille(d.getByLabel("Ville de départ"), "lyon");
  await choisirVille(d.getByLabel("Ville d'arrivée"), "paris");
  await d.getByLabel("Volume estimé").fill("16");
  // Le bouton est en bas du cadre : la page du site a défilé jusqu'à lui, le haut du formulaire est sorti de l'écran.
  await d.getByRole("button", { name: "Obtenir mon estimation" }).click();
  await expect(d.getByRole("heading", { name: /Génération de votre estimation|Votre estimation est prête/ })).toBeVisible();

  // Le formulaire a demandé à revenir en haut : la page remonte sur le cadre, sous son menu fixe (data-decalage=80).
  await expect.poll(async () => Math.round((await cadre(page).boundingBox())?.y ?? -1), { message: "haut du cadre sous le menu" }).toBe(80 + 12);

  await expect(d.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  await cadreAjuste(page);
  await expect(page).toHaveURL(OFFICIEL);
  const r = await db.demande(email);
  expect(r).toMatchObject({ source: "form", client_nom: "Testeur Cadre", depart_ville: "Lyon", arrivee_ville: "Paris" });
  expect(Number(r.volume_m3)).toBe(16);
  await verifierPagePropre(page, visiteur);
});
