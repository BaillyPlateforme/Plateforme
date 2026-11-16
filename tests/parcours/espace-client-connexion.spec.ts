import { createHash, randomBytes } from "node:crypto";
import { AVEC_COMPTES, EXT, emailUnique, expect, surveiller, test } from "../outils/banc";
import { LENT, contexteClient, creerClientEspace, demanderLienParEcran, entrerParLien, liensJournalises, ligne, lignes, nouveauLien, pageEspaceEnErreur } from "./espace-client-outils";

/*
 * La connexion du client à son espace, sans mot de passe : l'adresse, le
 * lien reçu par e-mail (lu ici dans le journal de l'espace, le client de
 * test étant fictif), la page d'arrivée qui ne consomme rien, le clic
 * « Accéder ». Puis tout ce qui doit être refusé proprement : le lien déjà
 * servi, le lien remplacé par un plus récent, le jeton altéré, tronqué ou
 * absent — et l'adresse inconnue, qui reçoit la même réponse qu'une connue.
 */

/** L'empreinte que le registre ec_liens_acces garde à la place du jeton (acces.ts). */
const empreinte = (lien: string) => createHash("sha256").update(new URL(lien).searchParams.get("token_hash")!).digest("hex");

test.describe("connexion du client par lien", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");

  test("de bout en bout : l'adresse, le lien, « Accéder », l'espace ; le lien ne sert qu'une fois", async ({ browser }) => {
    test.setTimeout(300_000);
    const c = await creerClientEspace(browser);
    // Le premier lien, émis par l'équipe à l'ouverture de l'espace : il sera remplacé par celui que le client demande.
    const lienEquipe = await nouveauLien(c.email, []);

    const ctx = await contexteClient(browser);
    const page = await ctx.newPage();
    const s = surveiller(page);

    // 1. L'écran de connexion : l'adresse, le bouton, la confirmation.
    const lien = await demanderLienParEcran(page, c.email);
    await expect(page).toHaveURL(/\/espace-client\/connexion\?envoye=1/);
    await expect(page.getByText(c.email)).toBeVisible();
    await expect(page.getByText("Valable 15 minutes")).toBeVisible();
    expect(lien.startsWith(`${EXT}/espace-client/acces?token_hash=`), "le lien mène à l'app publique").toBe(true);

    // 2. Ouvrir le lien (deux fois, comme une messagerie qui l'inspecte) ne le consomme pas.
    const e = empreinte(lien);
    for (let i = 0; i < 2; i++) {
      await page.goto(lien);
      await expect(page.getByRole("heading", { name: `Bonjour ${c.prenom}` })).toBeVisible();
      await expect(page.getByText("Lien valide")).toBeVisible();
    }
    const inscrit = await ligne<{ utilise_at: string | null }>("select utilise_at from public.ec_liens_acces where empreinte = $1", [e]);
    expect(inscrit, "le lien est inscrit au registre").not.toBeNull();
    expect(inscrit!.utilise_at, "ouvrir la page d'arrivée ne consomme pas le lien").toBeNull();

    // 3. Le lien de l'équipe, plus ancien, remplacé par celui du client : la page d'arrivée le refuse d'emblée
    //    (le registre le clôt à l'émission du nouveau), sans proposer « Accéder », et il n'ouvre aucune session.
    await page.goto(lienEquipe);
    await expect(page.getByRole("button", { name: /Accéder à mon espace/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /déjà servi/ })).toBeVisible();
    expect(Number((await ligne<{ n: string }>("select count(*) n from public.ec_sessions where client_id = $1", [c.ecClientId]))!.n), "aucune session par le lien remplacé").toBe(0);
    await page.goto(`${EXT}/espace-client/${c.reference}`);
    await expect(page).toHaveURL(/\/espace-client\/connexion/);

    // 4. Le bon lien : « Accéder » ouvre la session et mène au dossier.
    await entrerParLien(page, lien, c.reference);
    await expect(page.getByRole("link", { name: new RegExp(`${c.prenom} ${c.nom}`) })).toBeVisible();
    expect(await pageEspaceEnErreur(page)).toBeNull();
    const session = await ligne<{ n: string }>("select count(*) n from public.ec_sessions where client_id = $1 and fermee_le is null and expire_le > now()", [c.ecClientId]);
    expect(Number(session!.n), "une session inscrite au registre").toBe(1);
    expect((await ligne<{ utilise_at: string | null }>("select utilise_at from public.ec_liens_acces where empreinte = $1", [e]))!.utilise_at).not.toBeNull();

    // Déjà connecté : la page de connexion mène droit à l'espace.
    await page.goto(`${EXT}/espace-client/connexion`);
    await expect(page).toHaveURL(new RegExp(`/espace-client/${c.reference}`));

    // 5. Le même lien, rouvert : refusé proprement, avec le chemin pour en demander un autre.
    const autre = await browser.newContext();
    const p2 = await autre.newPage();
    const s2 = surveiller(p2);
    await p2.goto(lien);
    await expect(p2.getByRole("heading", { name: "Ce lien a déjà servi" })).toBeVisible();
    await expect(p2.getByRole("button", { name: /Accéder/ })).toHaveCount(0);
    await p2.getByRole("link", { name: /Recevoir un nouveau lien/ }).click();
    await expect(p2).toHaveURL(/\/espace-client\/connexion\?erreur=utilise/);
    await expect(p2.getByRole("alert").filter({ hasText: "Ce lien a déjà servi" })).toBeVisible();
    await expect(p2.getByLabel("Adresse e-mail")).toBeVisible();

    // 6. Le jeton altéré d'un caractère, puis tronqué : « pas valide », sans session.
    const jeton = new URL(lien).searchParams.get("token_hash")!;
    const dernier = jeton.at(-1) === "a" ? "b" : "a";
    for (const faux of [jeton.slice(0, -1) + dernier, jeton.slice(0, Math.floor(jeton.length / 2))]) {
      await p2.goto(`${EXT}/espace-client/acces?token_hash=${encodeURIComponent(faux)}`);
      await expect(p2.getByRole("heading", { name: "Ce lien n'est pas valide" })).toBeVisible();
      await expect(p2.getByRole("button", { name: /Accéder/ })).toHaveCount(0);
    }
    // … et l'espace reste fermé à ce navigateur-là.
    await p2.goto(`${EXT}/espace-client/${c.reference}`);
    await expect(p2).toHaveURL(/\/espace-client\/connexion/);

    expect(s.bilan(), "client : erreurs JS ou 5xx").toEqual([]);
    expect(s2.bilan(), "second navigateur : erreurs JS ou 5xx").toEqual([]);
    await autre.close();
    await ctx.close();
  });

  test("une adresse inconnue reçoit exactement la même réponse qu'une adresse connue", async ({ browser }) => {
    test.setTimeout(300_000);
    const c = await creerClientEspace(browser);
    const inconnue = emailUnique("inconnu");

    const texteDe = async (email: string) => {
      const ctx = await contexteClient(browser);
      const page = await ctx.newPage();
      const s = surveiller(page);
      await page.goto(`${EXT}/espace-client/connexion`);
      await page.getByLabel("Adresse e-mail").fill(email);
      await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
      await expect(page.getByRole("heading", { name: "C'est envoyé." })).toBeVisible({ timeout: LENT });
      const url = new URL(page.url());
      const texte = (await page.locator(".connexion-form").innerText()).replaceAll(email, "<adresse>").replace(/\s+/g, " ").trim();
      expect(s.bilan()).toEqual([]);
      await ctx.close();
      return { texte, parametres: [...url.searchParams.keys()].sort().join(","), email: url.searchParams.get("email") };
    };

    const avant = await liensJournalises(c.email);
    const connue = await texteDe(c.email);
    const nulle = await texteDe(inconnue);
    expect(nulle.texte).toBe(connue.texte);
    expect(nulle.parametres).toBe(connue.parametres);
    // L'adresse connue a bien reçu un lien ; l'inconnue, rien — et aucun compte n'a été créé pour elle.
    await nouveauLien(c.email, avant);
    expect(await lignes("select id from public.ec_notifications where destinataire = $1", [inconnue])).toEqual([]);
    expect(await lignes("select id from auth.users where lower(email) = $1", [inconnue])).toEqual([]);
  });
});

test.describe("connexion : le lien remplacé par un plus récent", () => {
  test.skip(!AVEC_COMPTES, "les comptes de test n'existent qu'en recette");

  // Un lien remplacé par un plus récent (le client en redemande un, ou l'équipe lui en renvoie un) est refusé dès la
  // page d'arrivée : le registre ec_liens_acces le clôt à l'émission du nouveau (acces.ts, envoyerLienAuClient).
  test("un lien remplacé est refusé dès la page d'arrivée, sans proposer « Accéder »", async ({ browser }) => {
    test.setTimeout(300_000);
    const c = await creerClientEspace(browser);
    const ancien = await nouveauLien(c.email, []);
    const ctx = await contexteClient(browser);
    const page = await ctx.newPage();
    await demanderLienParEcran(page, c.email);
    await page.goto(ancien);
    await expect(page.getByRole("button", { name: /Accéder à mon espace/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /n'est plus valable|n'est pas valide|déjà servi|remplacé/ })).toBeVisible();
    await ctx.close();
  });
});

test.describe("connexion : refus sans aucune écriture", () => {
  test("jeton absent, de forme invalide ou inconnu : « Ce lien n'est pas valide » @lecture", async ({ page }) => {
    const s = surveiller(page);
    const cas = ["", "?token_hash=", "?token_hash=court", `?token_hash=${randomBytes(28).toString("hex")}`, "?token_hash=%3Cscript%3Ealert(1)%3C%2Fscript%3E", `?token_hash=${"a".repeat(300)}`];
    for (const q of cas) {
      const r = await page.goto(`${EXT}/espace-client/acces${q}`);
      expect(r?.status(), q).toBeLessThan(500);
      await expect(page.getByRole("heading", { name: "Ce lien n'est pas valide" }), q).toBeVisible();
      await expect(page.getByRole("button", { name: /Accéder/ })).toHaveCount(0);
    }
    await page.getByRole("link", { name: /Recevoir un nouveau lien/ }).click();
    await expect(page).toHaveURL(/\/espace-client\/connexion\?erreur=inconnu/);
    await expect(page.getByRole("alert").filter({ hasText: "Ce lien n'est pas valide" })).toBeVisible();
    expect(s.bilan()).toEqual([]);
  });

  test("une adresse mal écrite est refusée sous le champ, sans rien envoyer @lecture", async ({ page }) => {
    const s = surveiller(page);
    await page.goto(`${EXT}/espace-client/connexion`);
    await expect(page.getByRole("heading", { name: "Bonjour !" })).toBeVisible();
    await page.getByLabel("Adresse e-mail").fill("pas-une-adresse");
    await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
    await expect(page.getByLabel("Adresse e-mail")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#email-err")).not.toBeEmpty();
    await expect(page).toHaveURL(/\/espace-client\/connexion$/);
    expect(await pageEspaceEnErreur(page)).toBeNull();
    expect(s.bilan()).toEqual([]);
  });

  test("les messages d'erreur de la page de connexion se lisent @lecture", async ({ page }) => {
    const s = surveiller(page);
    for (const [erreur, texte] of [
      ["expire", "Ce lien a expiré"],
      ["utilise", "Ce lien a déjà servi"],
      ["inconnu", "Ce lien n'est pas valide"],
    ]) {
      await page.goto(`${EXT}/espace-client/connexion?erreur=${erreur}`);
      await expect(page.getByRole("alert").filter({ hasText: texte })).toBeVisible();
    }
    // Une erreur inconnue n'affiche rien d'étrange.
    await page.goto(`${EXT}/espace-client/connexion?erreur=%3Cb%3Ex`);
    await expect(page.locator(".flash.ko")).toHaveCount(0);
    await page.goto(`${EXT}/espace-client/connexion?au-revoir=1`);
    await expect(page.getByText("Vous êtes déconnecté. À bientôt !")).toBeVisible();
    expect(s.bilan()).toEqual([]);
  });
});
