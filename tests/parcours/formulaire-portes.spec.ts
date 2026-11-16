/*
 * Les trois portes du formulaire public, de la première page jusqu'à l'effet
 * en base — sur bureau (projet « parcours ») et sur téléphone (« parcours-mobile »).
 *
 *   particulier · devis express   → estimation à l'écran, devis brouillon ;
 *   particulier · devis complet   → sept étapes, volume par liste de meubles ;
 *   salarié muté                  → fiche de visite, sans prix, rappel inscrit ;
 *   entreprise · petit transfert  → mobilier compté, sans prix, rappel inscrit ;
 *   entreprise · projet important → description et créneau, rappel inscrit.
 *
 * Pour chacune : la demande créée avec les bons champs, puis sa suite —
 * fiche Créagidem préparée et jamais envoyée (CREAGIDEM_MODE=inactif,
 * environnement « batterie-locale »), messages journalisés sans départ
 * (adresse @example.com : statut « fictif » au journal des envois).
 */
import {
  Base,
  DUREE_PARCOURS,
  champ,
  TEL_FICTIF,
  VILLES,
  action,
  barre,
  bloc,
  choisirVille,
  distanceRouteKm,
  exigerEcritures,
  expect,
  montantAffiche,
  ouvrirPorte,
  repondre,
  test,
  verifierChiffrage,
  verifierPagePropre,
} from "./formulaire-outils";
import { emailUnique } from "../outils/banc";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "parallel", timeout: DUREE_PARCOURS });

/** La suite commune à toute demande du site : Créagidem préparée, messages journalisés, rien de parti. */
async function verifierSuiteSansEnvoi(db: Base, id: string, email: string) {
  const fiche = await db.attendreEvenement(id, "creagidem");
  expect(["preparee", "incomplete"], `fiche Créagidem : ${JSON.stringify(fiche.payload.motif)}`).toContain(fiche.payload.statut);
  expect(fiche.payload.statut).not.toBe("envoyee");
  expect(fiche.payload.environnement).toBe("batterie-locale");

  // L'accusé de réception au client : inscrit à l'historique de la demande, jamais parti.
  const message = await db.attendreEvenement(id, "message", (p) => p.event === "demande_recue" && p.channel === "email");
  expect(message.payload.status).toBe("ignore");
  expect(String(message.payload.to).toLowerCase()).toBe(email);

  await expect.poll(async () => (await db.envois(email)).length, { message: "envoi journalisé", timeout: 60_000 }).toBeGreaterThan(0);
  const envois = await db.envois(email);
  for (const e of envois) {
    expect(e.statut, `envoi ${e.cle}`).toBe("fictif");
    expect(e.brevo_id).toBeNull();
    expect(e.reference).toBe(id);
  }
  // Rien d'autre n'est parti vers cette adresse : ni « envoyé », ni « bac à sable ».
  expect(envois.filter((e) => ["envoye", "bac_a_sable", "incertain", "en_cours"].includes(e.statut))).toEqual([]);
}

/** L'écran de fin des parcours sans prix : « Demande envoyée », et la référence de la demande. */
async function referenceAffichee(page: Page): Promise<string> {
  await expect(page.getByRole("heading", { name: "Demande envoyée" })).toBeVisible({ timeout: 60_000 });
  const ref = (await page.getByText(/^Référence/).innerText()).replace(/^Référence\s*/, "").trim();
  expect(ref).toMatch(/^[0-9a-f]{8}$/);
  return ref;
}

test("particulier, devis express : de l'accueil à l'estimation, puis la demande et sa suite en base", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("express");
  await ouvrirPorte(page, "express");
  await expect(page.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();

  await champ(page, "Nom").fill("Batterie Express");
  await champ(page, "E-mail").fill(email);
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await choisirVille(page.getByLabel("Ville de départ"), "lyon");
  await choisirVille(page.getByLabel("Ville d'arrivée"), "toulouse");
  const km = distanceRouteKm(VILLES.lyon, VILLES.toulouse);
  await expect(page.getByText(`${km} km`).filter({ visible: true }).first()).toBeVisible();

  await page.getByRole("radio", { name: "Une période" }).click();
  await page.getByRole("button", { name: "Dès que possible" }).click();
  await page.getByLabel("Volume estimé").fill("30");
  await expect(barre(page)).toContainText("30 m³ à déménager");

  await action(page, "Obtenir mon estimation").click();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  const total = await montantAffiche(page);
  if (total != null) {
    await expect(page.getByText("Lyon → Toulouse", { exact: true })).toBeVisible();
    await expect(page.getByText("~30 m³")).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Je souhaite être rappelé" })).toBeVisible();

  // En base : la demande, telle que saisie.
  const r = await db.demande(email);
  expect(r).toMatchObject({
    source: "form",
    client_nom: "Batterie Express",
    client_tel: TEL_FICTIF,
    depart_ville: "Lyon",
    depart_code_postal: "69001",
    arrivee_ville: "Toulouse",
    volume_method: "explicit",
    flexibilite: "Dès que possible",
    date_souhaitee: null,
    completion_token: null,
  });
  expect(Number(r.volume_m3)).toBe(30);
  expect(Number(r.distance_km)).toBe(km);
  expect(r.raw_payload.details.express).toBe(true);
  expect(r.raw_payload.type_client).toBe("particulier");

  const types = (await db.evenements(r.id)).map((e) => e.type);
  expect(types).toContain("created");
  expect(types).toContain("jeton_modification");
  expect(types).not.toContain("incomplete");

  // La suite : le chiffrage (devis brouillon, au montant affiché), puis Créagidem et les messages.
  const devis = await verifierChiffrage(db, r.id);
  if (total != null) expect(Math.round(Number((await db.demandes(email))[0].estimation_prix))).toBe(total);
  await verifierSuiteSansEnvoi(db, r.id, email);

  // « Je souhaite être rappelé » : la demande entre au tableau des rappels de l'équipe.
  await page.getByRole("button", { name: "Je souhaite être rappelé" }).click();
  await expect(page.getByRole("status")).toContainText("C'est bien noté");
  const rappel = await db.attendreEvenement(r.id, "rappel");
  expect(rappel.payload).toMatchObject({ statut: "a_rappeler", devis_id: devis?.id ?? null });

  await verifierPagePropre(page, visiteur);
});

test("particulier, devis complet : sept étapes, volume par liste de meubles", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("complet");
  await ouvrirPorte(page, "complet");

  // 1. Vous
  await expect(page.getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await expect(action(page, "Continuer")).toBeDisabled();
  await expect(barre(page)).toContainText("Indiquez votre nom");
  await champ(page, "Prénom").fill("Testeur");
  await champ(page, "Nom").fill("Batterie");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(email);
  await page.getByRole("radio", { name: "Une date précise" }).click();
  await page.getByLabel("Date souhaitée").fill("2027-03-15");
  await page.getByRole("button", { name: /Garantie dommages Luxe/ }).click();
  await repondre(page, "Avez-vous un piano ?", "Oui");
  await action(page, "Continuer").click();

  // 2. Départ : l'adresse saisie telle quelle, la ville choisie dans la liste.
  await expect(page.getByRole("heading", { name: /D'où partez-vous/ })).toBeVisible();
  await page.getByLabel("Adresse de départ").fill("12 rue des Essais");
  await choisirVille(page.getByLabel(/^Ville/), "lyon");
  await expect(page.getByLabel("Code postal")).toHaveValue("69001");
  await expect(barre(page)).toContainText("Indiquez la surface habitable");
  await page.getByLabel(/^Étage/).fill("3");
  await page.getByLabel(/^Surface habitable/).fill("65");
  await repondre(page, "Ascenseur ?", "Non");
  await action(page, "Continuer").click();

  // 3. Arrivée : sans surface connue, le type de logement la remplace.
  await expect(page.getByRole("heading", { name: /Où allez-vous/ })).toBeVisible();
  await choisirVille(page.getByLabel(/^Ville/), "toulouse");
  await page.getByLabel(/^Étage/).fill("1");
  await page.getByRole("button", { name: "Je ne connais pas la surface" }).click();
  await expect(barre(page)).toContainText("Indiquez votre type de logement");
  await page.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: "T3" }).click();
  await repondre(page, "Ascenseur ?", "Oui");
  await action(page, "Continuer").click();

  // 4. Prestations : sans choix, la formule Standard est retenue — et annoncée.
  await expect(page.getByRole("radiogroup", { name: "Formule de déménagement" })).toBeVisible();
  await expect(barre(page)).toContainText("la formule Standard sera retenue");
  await action(page, "Continuer").click();

  // 5. Emballage
  await expect(page.getByRole("heading", { name: /Vos meubles à démonter/ })).toBeVisible();
  await bloc(page, /Meubles type IKEA/).getByRole("button", { name: /Démontage possible/ }).click();
  await action(page, "Continuer").click();

  // 6. Inventaire : la liste des meubles.
  await expect(page.getByRole("heading", { name: /Quel volume à déménager/ })).toBeVisible();
  await expect(action(page, "Continuer")).toBeDisabled();
  await page.getByRole("button", { name: /Je liste mes meubles/ }).click();
  await page.getByRole("button", { name: "Canapé 3 places", exact: true }).click();
  await page.getByRole("button", { name: "Lit double (+ matelas)", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un Lit double (+ matelas)" }).click();
  await page.getByRole("button", { name: "Carton standard", exact: true }).click();
  // 1,5 + 2 × 1,5 + 0,1 = 4,6 m³
  await expect(page.getByText("4.6 m³").filter({ visible: true }).first()).toBeVisible();
  await action(page, "Continuer").click();

  // 7. Relecture et envoi
  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();
  const recap = page.locator("dl").filter({ hasText: "Client" });
  await expect(recap).toContainText("Testeur Batterie");
  await expect(page.getByText("4.6 m³ (liste de meubles)")).toBeVisible();
  await expect(page.getByText(/Garantie dommages Luxe/).filter({ visible: true }).first()).toBeVisible();
  await page.getByLabel(/^Message/).fill("Essai de la batterie : merci de ne pas traiter.");
  if (grandEcran(page)) await expect(page.getByRole("complementary")).toContainText("Lyon → Toulouse");
  // Un double clic sur « Envoyer » : une seule demande doit naître.
  await action(page, "Envoyer ma demande").dblclick();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  if ((await montantAffiche(page)) != null) await expect(page.getByText("~4.6 m³")).toBeVisible();

  const r = await db.demande(email);
  expect(r).toMatchObject({
    client_nom: "Testeur Batterie",
    depart_adresse: "12 rue des Essais",
    depart_ville: "Lyon",
    depart_code_postal: "69001",
    depart_etage: 3,
    depart_ascenseur: false,
    arrivee_ville: "Toulouse",
    arrivee_etage: 1,
    arrivee_ascenseur: true,
    type_logement_arrivee: "T3",
    volume_method: "list",
    formule: "standard",
    flexibilite: null,
  });
  expect((await db.q("select date_souhaitee::text as d from public.requests where id = $1", [r.id]))[0].d).toBe("2027-03-15");
  expect(Number(r.volume_m3)).toBe(4.6);
  expect(Number(r.distance_km)).toBe(distanceRouteKm(VILLES.lyon, VILLES.toulouse));
  expect(r.raw_payload).toMatchObject({
    assurance: "luxe",
    piano: true,
    articles_lourds: false,
    mutation_pro: false,
    commentaire: "Essai de la batterie : merci de ne pas traiter.",
    services: { emballage: true, demontage: true, montage: true },
  });
  expect(r.raw_payload.details.depart.surface).toBe("65");
  expect(r.raw_payload.details.emballage.ikea).toBe("possible");
  expect((await db.items(r.id)).map((i) => [i.label, i.quantite, Number(i.volume_unitaire_m3)])).toEqual([
    ["Canapé 3 places", 1, 1.5],
    ["Carton standard", 1, 0.1],
    ["Lit double (+ matelas)", 2, 1.5],
  ]);

  await verifierChiffrage(db, r.id);
  await verifierSuiteSansEnvoi(db, r.id, email);
  expect(await db.demandes(email), "une seule demande malgré le double clic").toHaveLength(1);
  await verifierPagePropre(page, visiteur);
});

test("salarié muté : la fiche de visite jusqu'à la confirmation, sans prix, rappel inscrit", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("mu"); // courte : une adresse longue fait déborder la relecture au téléphone (voir formulaire-validation)
  await ouvrirPorte(page, "mutation");

  await expect(page.getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await champ(page, "Prénom").fill("Testeur");
  await champ(page, "Nom").fill("Mutation");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(email);
  await expect(barre(page)).toContainText("Indiquez l'entreprise qui vous mute");
  // Une société qui n'a pas d'espace pro : le formulaire reste celui de tout le monde.
  await page.getByLabel(/Par quelle entreprise/).fill("Batterie Essais Industries");
  await expect(barre(page)).toContainText("Indiquez la période souhaitée");
  await page.getByRole("radio", { name: "Partiel" }).click();
  await page.getByLabel("Date souhaitée").fill("2027-04-20");
  await repondre(page, "Avez-vous des objets lourds ou particuliers ?", "Oui");
  await page.getByLabel("Lesquels ?").fill("Un piano droit");
  await action(page, "Continuer").click();

  await expect(page.getByRole("heading", { name: /D'où partez-vous/ })).toBeVisible();
  await champ(page, "Adresse").fill("3 place des Essais");
  await choisirVille(page.getByLabel(/^Ville/), "nantes");
  await page.getByLabel(/^Étage/).fill("2");
  await page.getByLabel(/^Surface habitable/).fill("58");
  await repondre(page, "Ascenseur ?", "Oui");
  await page.getByRole("button", { name: "Cave" }).click();
  await action(page, "Continuer").click();

  await expect(page.getByRole("heading", { name: /Où allez-vous/ })).toBeVisible();
  await choisirVille(page.getByLabel(/^Ville/), "lille");
  await page.getByRole("button", { name: "Je ne connais pas la surface" }).click();
  await page.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: "Maison" }).click();
  await action(page, "Continuer").click();

  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();
  await page.getByPlaceholder(/Ce que nous devons savoir/).fill("Essai de la batterie, mutation.");
  await expect(page.getByText("Batterie Essais Industries").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/2e étage · ascenseur · 58 m² · cave/)).toBeVisible();
  // Aucun prix dans ce parcours.
  await expect(page.getByText(/€/)).toHaveCount(0);
  await action(page, "Envoyer ma demande").click();

  const ref = await referenceAffichee(page);
  await expect(page.getByText(/organiser la visite technique/)).toBeVisible();
  await expect(page.getByText(/€/)).toHaveCount(0);

  const r = await db.demande(email);
  expect(r.id.startsWith(ref)).toBe(true);
  expect(r).toMatchObject({
    client_nom: "Testeur Mutation",
    depart_adresse: "3 place des Essais",
    depart_ville: "Nantes",
    depart_etage: 2,
    depart_ascenseur: true,
    arrivee_ville: "Lille",
    type_logement_arrivee: "Maison",
    volume_m3: null,
    completion_token: null,
  });
  expect(r.raw_payload).toMatchObject({
    mutation_pro: true,
    societe: "Batterie Essais Industries",
    articles_lourds: true,
    articles_lourds_detail: "Un piano droit",
    commentaire: "Essai de la batterie, mutation.",
    details: { parcours: "mutation", demenagement: "partiel", depart: { annexes: ["cave"] } },
  });
  expect(r.raw_payload.espace ?? null).toBeNull();

  // Sans prix : ni estimation ni devis ; la demande va droit au tableau des rappels.
  const rappel = await db.attendreEvenement(r.id, "rappel");
  expect(rappel.payload.statut).toBe("a_rappeler");
  await verifierSuiteSansEnvoi(db, r.id, email);
  const types = (await db.evenements(r.id)).map((e) => e.type);
  expect(types).not.toContain("incomplete");
  expect(types).not.toContain("analysis");
  expect(await db.devis(r.id)).toEqual([]);
  await verifierPagePropre(page, visiteur);
});

test("entreprise, petit transfert : société, adresses, mobilier, puis la confirmation", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("transfert");
  await ouvrirPorte(page, "transfert");

  await expect(page.getByRole("heading", { name: /Votre société/ }).first()).toBeVisible();
  await champ(page, "Société").fill("Batterie Essais SARL");
  await champ(page, "Votre nom").fill("Testeur Transfert");
  await page.getByLabel(/^Fonction/).fill("Office manager");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await expect(action(page, "Continuer")).toBeDisabled();
  await champ(page, "E-mail").fill(email);
  await page.getByRole("radio", { name: "Une période" }).click();
  await page.getByRole("button", { name: "Le mois prochain" }).click();
  await action(page, "Continuer").click();

  const depart = bloc(page, "Les locaux de départ");
  const arrivee = bloc(page, "Les locaux d'arrivée");
  await choisirVille(depart.getByLabel(/^Ville/), "paris");
  await expect(barre(page)).toContainText("Indiquez la ville d'arrivée");
  await choisirVille(arrivee.getByLabel(/^Ville/), "bordeaux");
  await action(page, "Continuer").click();

  await expect(page.getByRole("heading", { name: /Que déménagez-vous/ })).toBeVisible();
  await expect(barre(page)).toContainText("Indiquez au moins un élément");
  await champ(page, "Bureaux").fill("4");
  await page.getByRole("button", { name: "Ajouter : Photocopieurs et imprimantes" }).click();
  await repondre(page, "Avez-vous du matériel lourd ou particulier ?", "Non");
  await page.getByPlaceholder(/Accès, horaires/).fill("Essai de la batterie, transfert.");
  if (grandEcran(page)) await expect(page.getByRole("complementary")).toContainText("5 éléments");
  await action(page, "Envoyer ma demande").click();

  const ref = await referenceAffichee(page);
  await expect(page.getByText(/Votre demande de transfert est transmise/)).toBeVisible();

  const r = await db.demande(email);
  expect(r.id.startsWith(ref)).toBe(true);
  expect(r).toMatchObject({ client_nom: "Testeur Transfert", depart_ville: "Paris", arrivee_ville: "Bordeaux", volume_method: "list", flexibilite: "Le mois prochain" });
  expect(Number(r.volume_m3)).toBeCloseTo(4 * 0.8 + 1, 2);
  expect(r.raw_payload).toMatchObject({
    type_client: "entreprise",
    societe: "Batterie Essais SARL",
    details: { parcours: "entreprise", transfert: "simple", fonction: "Office manager" },
  });
  expect((await db.items(r.id)).map((i) => [i.label, i.quantite])).toEqual([
    ["Bureaux", 4],
    ["Photocopieurs et imprimantes", 1],
  ]);
  await db.attendreEvenement(r.id, "rappel");
  await verifierSuiteSansEnvoi(db, r.id, email);
  expect(await db.devis(r.id)).toEqual([]);
  await verifierPagePropre(page, visiteur);
});

test("entreprise, projet important : description, villes, contact et créneau de rappel", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("projet");
  await ouvrirPorte(page, "projet");

  await expect(page.getByRole("heading", { name: /Votre projet/ }).first()).toBeVisible();
  await page.getByPlaceholder(/Nous déménageons notre siège/).fill("Court");
  await expect(barre(page)).toContainText("Décrivez votre projet en quelques mots");
  await page.getByPlaceholder(/Nous déménageons notre siège/).fill("Essai de la batterie : siège de 40 postes et archives.");
  await choisirVille(page.getByLabel("Ville de départ"), "paris");
  await choisirVille(page.getByLabel("Ville d'arrivée"), "lyon");
  await page.getByLabel(/^Nombre de postes/).fill("40");
  await page.getByLabel(/^Surface des locaux/).fill("600");
  await page.getByRole("button", { name: "Dans 2 à 3 mois" }).click();
  await action(page, "Continuer").click();

  await expect(page.getByRole("heading", { name: /Comment vous joindre/ })).toBeVisible();
  await champ(page, "Société").fill("Batterie Projets SA");
  await champ(page, "Votre nom").fill("Testeur Projet");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(email);
  await page.getByRole("button", { name: /Une visio/ }).click();
  await page.getByRole("radio", { name: "Le matin" }).click();
  await action(page, "Envoyer ma demande").click();

  const ref = await referenceAffichee(page);
  await expect(page.getByText(/Votre projet est transmis/)).toBeVisible();

  const r = await db.demande(email);
  expect(r.id.startsWith(ref)).toBe(true);
  expect(r).toMatchObject({ client_nom: "Testeur Projet", depart_ville: "Paris", depart_code_postal: "75011", arrivee_ville: "Lyon", flexibilite: "Dans 2 à 3 mois", volume_m3: null });
  expect(r.raw_payload).toMatchObject({
    type_client: "entreprise",
    societe: "Batterie Projets SA",
    commentaire: "Essai de la batterie : siège de 40 postes et archives.",
    details: { parcours: "entreprise", transfert: "projet", postes: 40, surface_locaux: 600, rendez_vous: "Une visio", creneau: "Une visio · Le matin" },
  });
  const rappel = await db.attendreEvenement(r.id, "rappel");
  expect(rappel.payload).toMatchObject({ statut: "a_rappeler", creneau: "Une visio · Le matin" });
  await verifierSuiteSansEnvoi(db, r.id, email);
  await verifierPagePropre(page, visiteur);
});

/** Le panneau de gauche (récapitulatif « en direct ») n'existe que sur un grand écran. */
function grandEcran(page: Page) {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}
