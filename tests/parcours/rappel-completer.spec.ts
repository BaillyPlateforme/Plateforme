/*
 * Les deux pages où mènent les messages envoyés au client :
 *
 *   /rappel/<id>        le bouton « Je souhaite être rappelé » : ouvrir la page
 *                       inscrit la demande au tableau des rappels (une fois) ;
 *   /completer/<jeton>  le lien « complétez votre demande » d'une demande
 *                       incomplète : le client donne ce qui manque, la demande
 *                       est chiffrée, et le lien ne sert plus.
 *
 * Un identifiant ou un jeton faux, inconnu ou absent doit donner une page
 * propre de la marque — jamais une erreur serveur.
 */
import { DUREE_PARCOURS, action, barre, exigerEcritures, expect, test, verifierChiffrage, verifierPagePropre } from "./formulaire-outils";
import { EXT, emailUnique, requeteEn } from "../outils/banc";
import type { APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "parallel", timeout: DUREE_PARCOURS });

const UUID_INCONNU = "00000000-0000-4000-8000-000000000000";

/** Crée une demande par l'API, sous l'adresse IP du test ; rend son identifiant. */
async function creerDemande(api: APIRequestContext, corps: Record<string, unknown>): Promise<string> {
  const rep = await api.post(EXT + "/api/requests", { data: corps });
  expect(rep.status(), await rep.text()).toBe(201);
  return (await rep.json()).id as string;
}

test("/rappel avec un identifiant faux ou inconnu : une page claire, sans erreur serveur @lecture", async ({ page, visiteur }) => {
  for (const id of ["pas-un-identifiant", UUID_INCONNU]) {
    const rep = await page.goto(`${EXT}/rappel/${id}`);
    expect(rep?.status()).toBe(200);
    await expect(page.getByRole("status")).toHaveText(/Votre demande n.est pas partie/);
    await expect(page.getByText(/Réessayez, ou appelez-nous directement/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "01 69 10 35 35" })).toHaveAttribute("href", /^tel:/);
  }
  await verifierPagePropre(page, visiteur);
});

test("/rappel sans identifiant : la page introuvable de la marque @lecture", async ({ page, visiteur }) => {
  const rep = await page.goto(`${EXT}/rappel`);
  expect(rep?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
  // Rien d'autre que le 404 attendu de la page elle-même.
  expect(visiteur.bilan().filter((e) => !/404/.test(e))).toEqual([]);
});

test("/rappel d'une vraie demande : le rappel est inscrit au tableau, une seule fois", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("rappel");
  const api = await requeteEn(null, { extraHTTPHeaders: { "x-real-ip": visiteur.ip } });
  const id = await creerDemande(api, {
    client: { nom: "Testeur Rappel", email },
    depart: { ville: "Lyon", code_postal: "69001" },
    arrivee: { ville: "Paris" },
    volume: { method: "explicit", volume_m3: 20 },
    distance_km: 465,
    type_client: "particulier",
    details: { express: true },
  });
  await api.dispose();

  await page.goto(`${EXT}/rappel/${id}`);
  await expect(page.getByRole("status")).toHaveText(/C.est bien noté/);
  await expect(page.getByText(/Un conseiller vous rappelle au plus vite/)).toBeVisible();
  const rappel = await db.attendreEvenement(id, "rappel");
  expect(rappel.payload.statut).toBe("a_rappeler");

  // Le client reclique le lien de son message : pas de seconde carte au tableau.
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(/C.est bien noté/);
  expect((await db.evenements(id)).filter((e) => e.type === "rappel")).toHaveLength(1);
  await verifierPagePropre(page, visiteur);
});

test("/completer avec un jeton faux, inconnu ou absent : une page claire, sans erreur serveur @lecture", async ({ page, visiteur }) => {
  for (const jeton of ["pas-un-jeton", UUID_INCONNU]) {
    const rep = await page.goto(`${EXT}/completer/${jeton}`);
    expect(rep?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Ce lien n.est plus actif/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Faire une estimation" })).toHaveAttribute("href", "/");
  }
  await verifierPagePropre(page, visiteur);

  const rep = await page.goto(`${EXT}/completer`);
  expect(rep?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
});

test("/completer avec le vrai jeton : le client donne son volume, la demande est chiffrée et le lien ne sert plus", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("completer");
  const api = await requeteEn(null, { extraHTTPHeaders: { "x-real-ip": visiteur.ip } });
  // Une demande sans volume : incomplète, elle reçoit un jeton de complétion.
  const id = await creerDemande(api, {
    client: { nom: "Testeur Complétion", email },
    depart: { ville: "Lyon", code_postal: "69001" },
    arrivee: { ville: "Paris" },
    distance_km: 465,
    type_client: "particulier",
    details: { express: true },
  });
  await api.dispose();
  const incomplete = await db.attendreEvenement(id, "incomplete");
  expect(incomplete.payload.manque).toEqual(["Volume"]);
  const [{ jeton }] = await db.q<{ jeton: string }>("select completion_token::text as jeton from public.requests where id = $1", [id]);
  expect(jeton).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto(`${EXT}/completer/${jeton}`);
  await expect(page.getByRole("heading", { name: /Testeur, complétez votre demande/ })).toBeVisible();
  await expect(barre(page)).toContainText("Il manque : volume à déménager");
  const valider = action(page, "Valider ma demande");
  await expect(valider).toBeDisabled();
  // Ce qui est déjà connu est là, l'e-mail n'est pas modifiable.
  await expect(page.getByLabel(/^Nom/)).toHaveValue("Testeur Complétion");
  await expect(page.getByLabel(/^E-mail/)).toHaveValue(email);
  await expect(page.getByLabel(/^E-mail/)).not.toBeEditable();

  await page.getByLabel("Volume estimé").fill("25");
  await expect(barre(page)).toContainText("Tout y est");
  await valider.click();
  await expect(page.getByRole("heading", { name: /Merci, c.est complet/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/\(~25 m³\)/)).toBeVisible();

  // En base : le volume, le jeton effacé, la trace de la complétion, puis le chiffrage.
  const [r] = await db.q("select volume_m3, volume_method, completion_token from public.requests where id = $1", [id]);
  expect(Number(r.volume_m3)).toBe(25);
  expect(r.volume_method).toBe("explicit");
  expect(r.completion_token).toBeNull();
  const fait = await db.attendreEvenement(id, "completed");
  expect(fait.payload.rempli).toEqual([{ champ: "Volume", valeur: "25 m³" }]);
  await verifierChiffrage(db, id);
  const fiches = (await db.evenements(id)).filter((e) => e.type === "creagidem");
  expect(fiches.every((f) => f.payload.statut !== "envoyee")).toBe(true);
  expect((await db.envois(email)).filter((e) => e.statut !== "fictif")).toEqual([]);
  await verifierPagePropre(page, visiteur);

  // Le lien a servi : le client qui reclique lit qu'il n'est plus actif.
  await page.goto(`${EXT}/completer/${jeton}`);
  await expect(page.getByRole("heading", { name: /Ce lien n.est plus actif/ })).toBeVisible();
});
