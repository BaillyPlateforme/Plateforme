import { createHmac } from "node:crypto";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";
import { AVEC_COMPTES, EXT, INT, expect, requeteEn, surveiller, test } from "../outils/banc";
import { RACINE, lireEnv } from "../outils/config.mjs";
import { connecterClient, creerClientEspace, ligne, type ClientTest } from "./espace-client-outils";

/*
 * Les cloisons de l'espace client. Le client A, connecté, ne doit RIEN voir
 * du client B (un autre client de test) ni du jeu de démonstration
 * (BD-2026-0147, lu sans rien modifier) : ni dossier, ni discussion, ni
 * fichier — même avec un lien de fichier correctement signé —, ni session de
 * paiement. Il n'entre pas non plus dans l'app de l'équipe. Sans session,
 * toute page de l'espace mène à la connexion.
 *
 * Les liens de fichiers sont signés ici avec la clé du serveur (dérivée de la
 * clé de service, comme lib/espace-client/config.ts) : c'est ce qui prouve
 * que le refus vient de la propriété du dossier, et non de la signature. Un
 * lien du client A vers SA pièce, signé de même, est servi (témoin).
 */

type Etat = Awaited<ReturnType<BrowserContext["storageState"]>>;

const DEMO = "BD-2026-0147";

/** Un lien de fichier signé comme le fait le serveur (fichiers.ts, lienFichier). */
function lienSigne(type: string, id: string, { exp = Math.floor(Date.now() / 1000) + 300, alterer = false } = {}) {
  const env = lireEnv(path.join(RACINE, "apps/externe/.env.local"));
  const racine = process.env.ESPACE_CLIENT_SECRET || env.ESPACE_CLIENT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  const cle = createHmac("sha256", racine).update("espace-client:fichier").digest();
  let sig = createHmac("sha256", cle).update(`${type}:${id}:${exp}`).digest("base64url");
  if (alterer) sig = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  return `${EXT}/espace-client/fichier/${type}/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
}

/** Une pièce posée en base sur un dossier, sans fichier dans le seau : l'espace sert alors une page témoin en PDF. */
async function pieceTemoin(ecDossierId: string, libelle: string) {
  return (await ligne<{ id: string }>(
    `insert into public.ec_documents(dossier_id, categorie, libelle, source, chemin, nom_fichier, taille_octets, mime, created_by)
     values ($1, 'autre', $2, 'equipe', $3, 'temoin-batterie.pdf', 1000, 'application/pdf', 'batterie') returning id`,
    [ecDossierId, libelle, `fichiers/${ecDossierId}/absent-temoin-batterie.pdf`],
  ))!.id;
}

test.describe("cloisons : un client connecté ne voit que son espace", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");
  test.describe.configure({ mode: "default" });

  let a: ClientTest;
  let b: ClientTest;
  let etatA: Etat;
  const ids = { docA: "", docB: "", docDemo: "", paiementB: "", demoNom: "" };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(420_000);
    a = await creerClientEspace(browser);
    b = await creerClientEspace(browser);
    ids.docA = await pieceTemoin(a.ecDossierId, "Pièce témoin du client A");
    ids.docB = await pieceTemoin(b.ecDossierId, "Pièce témoin du client B");
    ids.paiementB = (await ligne<{ id: string }>(
      "insert into public.ec_sessions_paiement(cible, cible_id, dossier_id, montant, libelle, statut) values ('devis_arrhes', gen_random_uuid(), $1, 350, 'Arrhes du client B', 'ouverte') returning id",
      [b.ecDossierId],
    ))!.id;
    // Le jeu de démonstration : lu seulement.
    const demo = await ligne<{ doc: string | null; nom: string }>(
      "select (select doc.id from public.ec_documents doc where doc.dossier_id = d.id order by doc.created_at limit 1) as doc, c.nom from public.ec_dossiers d join public.ec_clients c on c.id = d.client_id where d.reference = $1",
      [DEMO],
    );
    ids.docDemo = demo?.doc ?? "";
    ids.demoNom = demo?.nom ?? "";
    const ctx = await connecterClient(browser, a);
    etatA = await ctx.storageState();
    await ctx.close();
  });

  test("le dossier d'un autre client répond « introuvable », sans rien en montrer", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etatA });
    const page = await ctx.newPage();
    const s = surveiller(page);
    for (const ref of [b.reference, DEMO]) {
      for (const sous of ["", "/documents", "/devis", "/conseiller", "/tutos/check-list", "/cartons"]) {
        const r = await page.goto(`${EXT}/espace-client/${ref}${sous}`);
        expect(r?.status(), `${ref}${sous}`).toBe(404);
        await expect(page.getByRole("heading", { name: "Cette page n'existe pas" }), `${ref}${sous}`).toBeVisible();
        const texte = await page.locator("body").innerText();
        expect(texte, `${ref}${sous} : le nom du client B`).not.toContain(b.nom);
        if (ids.demoNom) expect(texte, `${ref}${sous} : le nom du client de démonstration`).not.toContain(ids.demoNom);
      }
    }
    // Son propre dossier, lui, s'ouvre.
    await page.goto(`${EXT}/espace-client/${a.reference}`);
    await expect(page.getByText(`Dossier : ${a.reference}`, { exact: true })).toBeVisible();
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("la discussion d'un autre dossier ne se lit ni ne se marque lue", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etatA });
    for (const ref of [b.reference, DEMO]) {
      const lire = await ctx.request.get(`${EXT}/espace-client/discussion/${ref}`);
      expect(lire.status(), `GET ${ref}`).toBe(404);
      expect(await lire.json()).toEqual({ erreur: "Introuvable." });
      const marquer = await ctx.request.post(`${EXT}/espace-client/discussion/${ref}`);
      expect(marquer.status(), `POST ${ref}`).toBe(404);
    }
    // La sienne se lit.
    const sienne = await ctx.request.get(`${EXT}/espace-client/discussion/${a.reference}`);
    expect(sienne.status()).toBe(200);
    expect(await sienne.json()).toMatchObject({ messages: [], lectureSeule: false });
    await ctx.close();
  });

  test("un fichier d'un autre client est refusé, même par un lien correctement signé", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etatA });
    // Témoin : SA pièce, par un lien signé de la même façon, est servie.
    const sienne = await ctx.request.get(lienSigne("doc", ids.docA));
    expect(sienne.status(), "la pièce du client A (témoin de la signature)").toBe(200);
    expect(sienne.headers()["content-type"]).toContain("application/pdf");

    for (const [qui, id] of [["client B", ids.docB], ["démonstration", ids.docDemo]] as const) {
      if (!id) continue;
      const r = await ctx.request.get(lienSigne("doc", id));
      expect(r.status(), `pièce du ${qui}`).toBe(404);
      expect(await r.text()).toBe("Introuvable.");
    }
    // Sans signature, signature altérée, lien expiré : refusés avant même de chercher la pièce.
    expect((await ctx.request.get(`${EXT}/espace-client/fichier/doc/${ids.docA}`)).status()).toBe(403);
    expect((await ctx.request.get(lienSigne("doc", ids.docA, { alterer: true }))).status()).toBe(403);
    expect((await ctx.request.get(lienSigne("doc", ids.docA, { exp: Math.floor(Date.now() / 1000) - 10 }))).status()).toBe(403);
    // Un type inconnu ne sert rien.
    expect((await ctx.request.get(lienSigne("archive", ids.docA))).status()).toBeGreaterThanOrEqual(400);
    await ctx.close();
  });

  test("la session de paiement d'un autre client est introuvable", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etatA });
    const page = await ctx.newPage();
    const s = surveiller(page);
    for (const chemin of [`/espace-client/paiement/${ids.paiementB}`, `/espace-client/${a.reference}/paiement/${ids.paiementB}`, `/espace-client/${b.reference}/paiement/${ids.paiementB}`]) {
      const r = await page.goto(EXT + chemin);
      expect(r?.status(), chemin).toBe(404);
      await expect(page.getByText("Arrhes du client B")).toHaveCount(0);
    }
    expect(s.bilan()).toEqual([]);
    await ctx.close();
  });

  test("la session du client n'ouvre pas l'app de l'équipe", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: etatA });
    const page = await ctx.newPage();
    for (const chemin of ["/dossiers", "/dashboard/espace-client", "/terrain", "/tablette"]) {
      await page.goto(INT + chemin);
      await expect(page, chemin).toHaveURL(new RegExp(`^${EXT}/espace-client`));
    }
    const api = await ctx.request.get(`${INT}/api/data/clients`, { maxRedirects: 0 });
    expect(api.status()).toBe(403);
    await ctx.close();
  });
});

test.describe("cloisons : sans session", () => {
  test("toute page de l'espace mène à la connexion, les routes de données ne rendent rien @lecture", async ({ page }) => {
    const r = await requeteEn(null);
    for (const chemin of [
      "/espace-client",
      `/espace-client/${DEMO}`,
      ...["devis", "documents", "cartons", "conseiller", "conteneur", "sav", "services", "tutos", "tutos/check-list", "tutos/bien-remplir-un-carton", "visite", "paiement/00000000-0000-0000-0000-000000000000"].map((x) => `/espace-client/${DEMO}/${x}`),
      "/espace-client/paiement/00000000-0000-0000-0000-000000000000",
    ]) {
      const rep = await r.get(EXT + chemin);
      expect([302, 303, 307, 308], `${chemin} : redirection`).toContain(rep.status());
      expect(rep.headers().location ?? "", `${chemin} : vers la connexion`).toMatch(/\/espace-client\/connexion/);
    }
    // La discussion : le proxy la renvoie à la connexion, avant même la route (qui répondrait 404).
    const fil = await r.get(`${EXT}/espace-client/discussion/${DEMO}`);
    expect([307, 404]).toContain(fil.status());
    if (fil.status() === 307) expect(fil.headers().location).toMatch(/\/espace-client\/connexion/);
    else expect(await fil.json()).toEqual({ erreur: "Introuvable." });
    const fichier = await r.get(`${EXT}/espace-client/fichier/doc/00000000-0000-0000-0000-000000000000?exp=1&sig=x`);
    expect(fichier.status()).toBe(404);
    // Dans le navigateur : la page de connexion, sans erreur.
    const s = surveiller(page);
    await page.goto(`${EXT}/espace-client/${DEMO}/documents`);
    await expect(page).toHaveURL(/\/espace-client\/connexion/);
    await expect(page.getByRole("heading", { name: "Bonjour !" })).toBeVisible();
    expect(s.bilan()).toEqual([]);
  });
});
