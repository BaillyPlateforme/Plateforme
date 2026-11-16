import type { Page, Request } from "@playwright/test";
import { AVEC_COMPTES, INT, contexteEn, emailUnique, expect, requeteEn, surveiller, test } from "../outils/banc";
import { avecBase, ligne, lignes, pageEnErreurSure } from "./espace-client-outils";

/*
 * La tablette du commercial (/tablette), pour la visite technique chez le
 * client : l'accueil (visites du jour), la saisie d'une visite en cours, le
 * compte-rendu d'une visite signée — sur une tablette tenue à l'horizontale
 * (1180 × 820, tactile), puis à la verticale.
 *
 * Les visites sont celles de la recette, lues en base sans rien modifier :
 * la saisie s'enregistre au fil des gestes (useEnregistrement), donc ici on
 * ne fait que naviguer entre les rubriques — et on vérifie qu'aucune
 * opération n'est partie au serveur.
 */

const TABLETTE = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false, deviceScaleFactor: 2 };
const PORTRAIT = { ...TABLETTE, viewport: { width: 820, height: 1180 } };

async function verifierPageTablette(page: Page, s: ReturnType<typeof surveiller>, chemin: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  expect(await pageEnErreurSure(page), `${chemin} : page d'erreur`).toBeNull();
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(debord, `${chemin} : la page déborde en largeur`).toBeLessThanOrEqual(1);
  expect(s.bilan(), `${chemin} : erreurs JS ou 5xx`).toEqual([]);
}

/** La hauteur et la largeur d'une cible au doigt. */
async function taille(page: Page, selecteur: ReturnType<Page["locator"]>) {
  const b = await selecteur.boundingBox();
  return { h: b?.height ?? 0, w: b?.width ?? 0 };
}

test.describe("la tablette de visite technique", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");

  test("l'accueil s'affiche, à l'horizontale comme à la verticale @lecture", async ({ browser }) => {
    for (const [nom, options] of [["horizontale", TABLETTE], ["verticale", PORTRAIT]] as const) {
      const ctx = await contexteEn(browser, "equipe", options);
      const page = await ctx.newPage();
      const s = surveiller(page);
      await page.goto(`${INT}/tablette`);
      await expect(page, nom).toHaveURL(`${INT}/tablette`);
      await expect(page.getByRole("heading", { name: /^Bonjour / })).toBeVisible();
      await expect(page.getByText("Aujourd'hui").first()).toBeVisible();
      await expect(page.getByText("Une visite sans rendez-vous")).toBeVisible();
      await expect(page.getByLabel("Dossier")).toBeVisible();
      const bouton = page.getByRole("button", { name: /Ouvrir la visite/ });
      expect((await taille(page, bouton)).h, `${nom} : bouton assez grand pour le doigt`).toBeGreaterThanOrEqual(44);
      await verifierPageTablette(page, s, `/tablette (${nom})`);
      await ctx.close();
    }
  });

  test("une visite en cours s'ouvre ; on passe d'une rubrique à l'autre au doigt, sans rien enregistrer @lecture", async ({ browser }) => {
    const visite = await ligne<{ id: number; ref: string }>(
      "select v.id, d.ref from crm.visites v join crm.dossiers d on d.id = v.dossier_id where v.statut = 'en_cours' order by v.id limit 1",
    );
    test.skip(!visite, "aucune visite en cours dans la recette");

    for (const [nom, options] of [["horizontale", TABLETTE], ["verticale", PORTRAIT]] as const) {
      const ctx = await contexteEn(browser, "equipe", options);
      const page = await ctx.newPage();
      const s = surveiller(page);
      const ecritures: string[] = [];
      page.on("request", (r: Request) => {
        if (r.method() !== "GET" && /\/api\/visites\//.test(r.url())) ecritures.push(`${r.method()} ${new URL(r.url()).pathname}`);
      });

      await page.goto(`${INT}/tablette/${visite!.id}`);
      await expect(page).toHaveURL(`${INT}/tablette/${visite!.id}`);
      await expect(page.getByText(visite!.ref).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Compte-rendu/ })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Pièces et rubriques" })).toBeVisible();
      await verifierPageTablette(page, s, `/tablette/${visite!.id} (${nom})`);

      // Au doigt : les rubriques « Accès » puis « Options et remarques », puis retour.
      const rail = page.getByRole("navigation", { name: "Pièces et rubriques" });
      const acces = rail.getByRole("button", { name: /Accès/ });
      const options2 = rail.getByRole("button", { name: /Options et remarques/ });
      for (const b of [acces, options2]) {
        const t = await taille(page, b);
        expect(t.h, `${nom} : rubrique assez haute pour le doigt`).toBeGreaterThanOrEqual(44);
      }
      await acces.tap();
      await expect(acces).toHaveClass(/actif/);
      await options2.tap();
      await expect(options2).toHaveClass(/actif/);
      await expect(acces).not.toHaveClass(/actif/);
      const premierePiece = rail.locator("li button").first();
      if (await premierePiece.count()) {
        await premierePiece.tap();
        await expect(premierePiece).toHaveAttribute("aria-current", "true");
      }
      // L'état de l'enregistrement reste « Enregistré » : rien n'a été modifié.
      await expect(page.getByText("Enregistré").first()).toBeVisible();
      expect(ecritures, `${nom} : aucune opération envoyée`).toEqual([]);
      expect(s.bilan()).toEqual([]);
      await ctx.close();
    }
  });

  test("le compte-rendu d'une visite signée se lit ; une visite inconnue est introuvable @lecture", async ({ browser }) => {
    const signee = await ligne<{ id: number }>("select id from crm.visites where statut = 'signee' order by id limit 1");
    const ctx = await contexteEn(browser, "equipe", TABLETTE);
    const page = await ctx.newPage();
    const s = surveiller(page);
    if (signee) {
      // La saisie d'une visite signée renvoie à son compte-rendu.
      await page.goto(`${INT}/tablette/${signee.id}`);
      await expect(page).toHaveURL(`${INT}/tablette/${signee.id}/signature`);
      await verifierPageTablette(page, s, `/tablette/${signee.id}/signature`);
    }
    const r = await page.goto(`${INT}/tablette/999999999`);
    expect(r?.status()).toBe(404);
    expect(s.bilan().filter((e) => !e.startsWith("console"))).toEqual([]);
    await ctx.close();
  });

  /*
   * Retours de Céline (16/11/2026) : la saisie automatique des objets, la
   * répartition entre les destinations du dossier, et le travail hors
   * connexion — les gestes faits sans réseau arrivent au serveur au retour
   * du réseau, une seule fois. Écrit en base : un dossier fictif, effacé à la fin.
   */
  test("hors connexion : la saisie continue et arrive une seule fois au retour du réseau ; saisie automatique et destinations", async ({ browser }) => {
    const f = await avecBase(async (db) => {
      const [cl] = (await db.query("insert into crm.clients (type, nom, email) values ('particulier', 'Batterie tablette hors connexion', $1) returning id", [emailUnique("tablette")])).rows;
      const [d] = (await db.query("insert into crm.dossiers (ref, client_id, statut) values ($1, $2, 'visite') returning id", [`BT-TAB-${Date.now().toString(36)}`, cl.id])).rows;
      const etapes = [
        ["depart", "1 rue de Rivoli, 75001 Paris", "Paris"],
        ["garde_meuble", "Garde-meuble, 92230 Gennevilliers", "Gennevilliers"],
        ["arrivee", "1 place Bellecour, 69002 Lyon", "Lyon"],
      ];
      for (const [i, [genre, adresse, ville]] of etapes.entries())
        await db.query("insert into crm.etapes_trajet (dossier_id, ordre, genre, adresse, ville) values ($1, $2, $3, $4, $5)", [d.id, i, genre, adresse, ville]);
      const [v] = (await db.query("insert into crm.visites (dossier_id, options) values ($1, '[]') returning id", [d.id])).rows;
      return { client: cl.id as number, dossier: d.id as number, visite: v.id as number };
    });
    const ctx = await contexteEn(browser, "equipe", TABLETTE);
    try {
      const page = await ctx.newPage();
      await page.goto(`${INT}/tablette/${f.visite}`);
      await page.getByRole("button", { name: "Salon", exact: true }).tap();

      // « ta » propose les tables ; chaque lettre resserre ; une touche ajoute l'objet.
      const recherche = page.getByPlaceholder(/Tapez un objet/);
      await recherche.pressSequentially("ta");
      await expect(page.getByRole("option", { name: /Table basse/ })).toBeVisible();
      await expect(page.getByRole("option", { name: /Tapis/ })).toBeVisible();
      await recherche.pressSequentially("ble b");
      await expect(page.getByRole("option")).toHaveCount(1);
      await page.getByRole("option", { name: /Table basse/ }).tap();
      await expect(recherche).toHaveValue("");

      // Deux destinations (garde-meuble, arrivée) : la table basse part au garde-meuble.
      await expect(page.getByRole("radiogroup", { name: "Destination de la pièce" }).getByRole("radio", { checked: true })).toHaveText("Arrivée");
      await page.getByLabel("Destination : Table basse").selectOption({ label: "Garde-meuble" });
      await expect(page.getByText("Enregistré", { exact: true })).toBeVisible({ timeout: 30_000 });

      // Le réseau tombe : la saisie continue, le bandeau dit ce qui attend.
      await ctx.setOffline(true);
      await recherche.pressSequentially("refri");
      await page.getByRole("option", { name: /Réfrigérateur/ }).tap();
      await expect(page.getByText(/^Hors connexion — 1 modification en attente$/)).toBeVisible({ timeout: 15_000 });
      expect(await lignes("select 1 from crm.inventaire where dossier_id = $1 and libelle = 'Réfrigérateur'", [f.dossier])).toHaveLength(0);

      // Il revient : tout part de soi-même, une seule fois.
      await ctx.setOffline(false);
      await expect(page.getByText(/Réseau revenu : tout est enregistré|Tout est enregistré/)).toBeVisible({ timeout: 60_000 });
      const inv = await lignes<{ libelle: string; destination: string; n: number }>(
        "select libelle, destination, count(*) over (partition by cle)::int as n from crm.inventaire where dossier_id = $1 order by libelle",
        [f.dossier],
      );
      expect(inv).toEqual([
        { libelle: "Réfrigérateur", destination: "Arrivée", n: 1 },
        { libelle: "Table basse", destination: "Garde-meuble", n: 1 },
      ]);
    } finally {
      await ctx.close();
      await avecBase((db) => db.query("delete from crm.clients where id = $1", [f.client]));
    }
  });

  test("sans session, la tablette mène à la connexion de l'équipe @lecture", async () => {
    const r = await requeteEn(null);
    for (const chemin of ["/tablette", "/tablette/1", "/tablette/1/signature"]) {
      const rep = await r.get(INT + chemin);
      expect([302, 303, 307, 308], chemin).toContain(rep.status());
      expect(rep.headers().location, chemin).toMatch(/\/login/);
    }
    // Un compte RH, un compte sans rôle : pas de tablette.
    for (const sorte of ["rh", "intrus"] as const) {
      const rep = await (await requeteEn(sorte)).get(`${INT}/tablette`);
      expect(rep.status(), sorte).not.toBe(200);
    }
  });
});
