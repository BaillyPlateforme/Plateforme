/*
 * « Modifier ma demande », depuis l'écran de l'estimation : le formulaire
 * revient rempli, et le renvoi met à jour LA MÊME demande (PUT avec le jeton
 * de modification remis à la création) — pas de seconde demande, donc pas de
 * doublon dans le CRM ni dans Créagidem. Sur bureau et sur téléphone.
 */
import {
  DUREE_PARCOURS,
  TEL_FICTIF,
  VILLES,
  action,
  champ,
  choisirVille,
  distanceRouteKm,
  exigerEcritures,
  expect,
  montantAffiche,
  ouvrirPorte,
  remplirExpress,
  test,
  verifierChiffrage,
  verifierPagePropre,
} from "./formulaire-outils";
import { EXT, emailUnique, ipNeuve, requeteEn } from "../outils/banc";
import type { Page } from "@playwright/test";

/** Le bouton « Modifier » d'un groupe du récapitulatif (le panneau de gauche, hors de <main>, porte aussi les noms d'étapes). */
const modifierGroupe = (page: Page, groupe: string) =>
  page.getByRole("main").getByText(groupe, { exact: true }).locator("xpath=../..").getByRole("button", { name: "Modifier" });

test.describe.configure({ mode: "parallel", timeout: DUREE_PARCOURS });

test("devis express : « Modifier ma demande » met à jour la même demande, sans doublon", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("modif");
  await ouvrirPorte(page, "express");
  await remplirExpress(page, "Testeur Modification", email, "30");
  await action(page, "Obtenir mon estimation").click();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  const avant = await montantAffiche(page);

  const r = await db.demande(email);
  const devisAvant = await verifierChiffrage(db, r.id);
  const prixAvant = Number((await db.demandes(email))[0].estimation_prix);
  if (avant != null) expect(Math.round(prixAvant)).toBe(avant);

  // Le formulaire revient tel qu'il a été envoyé, et son bouton dit qu'il met à jour.
  await page.getByRole("button", { name: "Modifier ma demande" }).first().click();
  await expect(champ(page, "Nom")).toHaveValue("Testeur Modification");
  await expect(champ(page, "E-mail")).toHaveValue(email);
  await expect(page.getByLabel("Ville de départ")).toHaveValue("Lyon");
  await expect(page.getByLabel("Volume estimé")).toHaveValue("30");
  await expect(action(page, "Mettre à jour mon estimation")).toBeEnabled();

  // Plus de volume, une autre arrivée.
  await page.getByLabel("Volume estimé").fill("45");
  await choisirVille(page.getByLabel("Ville d'arrivée"), "bordeaux");
  await action(page, "Mettre à jour mon estimation").click();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  const apres = await montantAffiche(page);
  if (apres != null) {
    await expect(page.getByText("~45 m³")).toBeVisible();
    await expect(page.getByText("Lyon → Bordeaux", { exact: true })).toBeVisible();
  }

  // En base : toujours une seule demande, mise à jour.
  await expect.poll(async () => Number((await db.demandes(email))[0].volume_m3)).toBe(45);
  const lignes = await db.demandes(email);
  expect(lignes, "la modification ne crée pas de seconde demande").toHaveLength(1);
  expect(lignes[0].id).toBe(r.id);
  expect(lignes[0]).toMatchObject({ arrivee_ville: "Bordeaux", depart_ville: "Lyon", client_email: email });
  expect(Number(lignes[0].distance_km)).toBe(distanceRouteKm(VILLES.lyon, VILLES.bordeaux));

  // L'historique dit ce qui a changé, et que c'est le client.
  const modif = await db.attendreEvenement(r.id, "modified");
  expect(modif.payload.par).toBe("client");
  const champs = (modif.payload.changes as { champ: string }[]).map((c) => c.champ);
  expect(champs).toEqual(expect.arrayContaining(["Ville d'arrivée", "Volume", "Distance"]));

  // Le chiffrage est rejoué : une nouvelle estimation, plus chère (plus de volume, plus loin), et l'ancien devis brouillon remplacé.
  await expect.poll(async () => (await db.evenements(r.id)).filter((e) => e.type === "analysis").length, { timeout: 90_000 }).toBe(2);
  const prixApres = Number((await db.demandes(email))[0].estimation_prix);
  expect(prixApres).toBeGreaterThan(prixAvant);
  if (apres != null) expect(Math.round(prixApres)).toBe(apres);
  await expect.poll(async () => (await db.devis(r.id)).length, { message: "devis refait après la modification", timeout: 30_000 }).toBe(1);
  const devisApres = await db.devis(r.id);
  if (devisAvant) expect(devisApres.map((d) => d.id)).not.toContain(devisAvant.id);
  expect(Number(devisApres[0].montant_ttc)).toBe(prixApres);

  // Créagidem : toujours préparée, jamais envoyée — pas plus après la modification.
  const fiches = (await db.evenements(r.id)).filter((e) => e.type === "creagidem");
  expect(fiches.length).toBeGreaterThan(0);
  expect(fiches.every((f) => f.payload.statut !== "envoyee")).toBe(true);
  expect((await db.envois(email)).filter((e) => e.statut !== "fictif")).toEqual([]);

  await verifierPagePropre(page, visiteur);
});

test("devis express : « Demander un nouveau devis » repart d'un formulaire vide", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("nouveau");
  await ouvrirPorte(page, "express");
  await remplirExpress(page, "Testeur Nouveau Devis", email, "18");
  await action(page, "Obtenir mon estimation").click();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  await montantAffiche(page);

  await page.getByRole("button", { name: "Demander un nouveau devis" }).click();
  await expect(page.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();
  await expect(champ(page, "Nom")).toHaveValue("");
  await expect(champ(page, "E-mail")).toHaveValue("");
  await expect(page.getByLabel("Ville de départ")).toHaveValue("");
  // Un nouveau devis, pas une mise à jour : le bouton est celui d'une première demande.
  await expect(action(page, "Obtenir mon estimation")).toBeDisabled();
  await expect(action(page, "Mettre à jour mon estimation")).toHaveCount(0);
  expect(await db.demandes(email)).toHaveLength(1);
  await verifierPagePropre(page, visiteur);
});

test("devis complet : la modification depuis l'estimation met à jour la même demande", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("modif-complet");
  // Le raccourci de démonstration (?demo=1) remplit tout et mène à la relecture ; on y remplace le client par celui du test.
  await page.goto(`${EXT}/?mode=complet&demo=1`);
  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();
  await modifierGroupe(page, "Vous").click();
  await champ(page, "Prénom").fill("Testeur");
  await champ(page, "Nom").fill("Modification Complète");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(email);
  while (!(await page.getByRole("heading", { name: /Un dernier mot/ }).isVisible())) await action(page, "Continuer").click();
  await expect(page.getByRole("main").getByText(email)).toBeVisible();
  await action(page, "Envoyer ma demande").click();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  await montantAffiche(page);
  const r = await db.demande(email);
  expect(Number(r.volume_m3)).toBe(30);
  await db.attendreEvenement(r.id, "analysis");

  // Retour à la relecture, tout est là ; on change le volume depuis le récapitulatif.
  await page.getByRole("button", { name: "Modifier ma demande" }).first().click();
  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();
  await expect(action(page, "Mettre à jour ma demande")).toBeEnabled();
  await modifierGroupe(page, "Inventaire").click();
  await page.getByLabel("Volume estimé").fill("40");
  await action(page, "Continuer").click();
  await action(page, "Mettre à jour ma demande").click();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });

  await expect.poll(async () => Number((await db.demandes(email))[0].volume_m3)).toBe(40);
  const lignes = await db.demandes(email);
  expect(lignes, "pas de seconde demande").toHaveLength(1);
  expect(lignes[0].id).toBe(r.id);
  const modif = await db.attendreEvenement(r.id, "modified");
  expect(modif.payload.changes).toEqual(expect.arrayContaining([expect.objectContaining({ champ: "Volume" })]));
  await expect.poll(async () => (await db.evenements(r.id)).filter((e) => e.type === "analysis").length, { timeout: 90_000 }).toBe(2);
  await verifierPagePropre(page, visiteur);
});

// La référence d'un devis (DEV-AAAA-NNNN) valait « nombre de devis + 1 » : dès qu'un devis était effacé —
// « Modifier ma demande » efface le brouillon —, elle retombait sur une référence existante, l'insertion échouait
// sans bruit et toutes les demandes suivantes restaient sans devis (constaté en recette le 15/11/2026). Elle part
// désormais du plus grand numéro de l'année (devis-reference.ts).
test("chaque demande chiffrée a son devis, même après la modification d'une demande plus ancienne", async ({ db }) => {
  exigerEcritures();
  const corps = (email: string, volume: number) => ({
    client: { nom: "Testeur Numérotation", email },
    depart: { ville: "Lyon", code_postal: "69001" },
    arrivee: { ville: "Paris" },
    volume: { method: "explicit", volume_m3: volume },
    distance_km: 465,
    flexibilite: "Je ne sais pas encore",
    type_client: "particulier",
    details: { express: true },
  });
  const creer = async (email: string, volume: number) => {
    const api = await requeteEn(null, { extraHTTPHeaders: { "x-real-ip": ipNeuve() } });
    const rep = await api.post(EXT + "/api/requests", { data: corps(email, volume) });
    expect(rep.status(), await rep.text()).toBe(201);
    const j = await rep.json();
    await api.dispose();
    await db.attendreEvenement(j.id, "analysis");
    return j as { id: string; modification: string };
  };
  const a = await creer(emailUnique("numero-a"), 20);
  const b = await creer(emailUnique("numero-b"), 21);
  expect(await db.devis(a.id)).toHaveLength(1);
  expect(await db.devis(b.id)).toHaveLength(1);

  // A est modifiée par son client : son devis brouillon est effacé, puis refait.
  const api = await requeteEn(null, { extraHTTPHeaders: { "x-real-ip": ipNeuve(), "x-jeton-modification": a.modification } });
  const [{ client_email: emailA }] = await db.q<{ client_email: string }>("select client_email from public.requests where id = $1", [a.id]);
  const rep = await api.put(`${EXT}/api/requests/${a.id}`, { data: corps(emailA, 26) });
  expect(rep.status(), await rep.text()).toBe(200);
  await api.dispose();
  await expect.poll(async () => (await db.evenements(a.id)).filter((e) => e.type === "analysis").length, { timeout: 90_000 }).toBe(2);
  expect(await db.devis(a.id), "la demande modifiée retrouve un devis").toHaveLength(1);

  // Et la demande suivante, d'un autre client, a le sien.
  const c = await creer(emailUnique("numero-c"), 22);
  expect(await db.devis(c.id), "la demande suivante a son devis").toHaveLength(1);
});

