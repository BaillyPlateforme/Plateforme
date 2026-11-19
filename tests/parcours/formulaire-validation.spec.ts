/*
 * La validation du formulaire public, dans le navigateur : ce qui bloque,
 * ce que la barre du bas en dit, ce que le serveur refuse et comment le
 * visiteur le lit ; la saisie gardée d'une étape à l'autre ; le rechargement ;
 * le double clic ; les photos quand l'analyse est impossible.
 *
 * Sur bureau et sur téléphone. Les tests marqués @lecture n'envoient aucune
 * demande : ils tournent aussi contre la recette et la production déployées.
 */
import {
  DUREE_PARCOURS,
  TEL_FICTIF,
  action,
  barre,
  champ,
  choisirVille,
  erreurFormulaire,
  exigerEcritures,
  expect,
  ouvrirPorte,
  remplirExpress,
  test,
  verifierPagePropre,
} from "./formulaire-outils";
import { EXT, LOCAL, emailUnique, pageEnErreur } from "../outils/banc";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "parallel", timeout: DUREE_PARCOURS });

test("devis express : le bouton reste fermé et la barre dit ce qui manque, champ par champ @lecture", async ({ page, visiteur }) => {
  await ouvrirPorte(page, "express");
  const bouton = action(page, "Obtenir mon estimation");
  await expect(bouton).toBeDisabled();
  await expect(barre(page)).toContainText("Indiquez votre nom");

  await champ(page, "Nom").fill("Batterie Validation");
  await expect(barre(page)).toContainText("Indiquez un e-mail valide");
  const email = emailUnique("validation");
  // Ni sans arobase, ni sans domaine : refusé sur place, le bouton reste fermé.
  for (const faux of [email.split("@")[0], email.replace(/\.com$/, "")]) {
    await champ(page, "E-mail").fill(faux);
    await expect(barre(page)).toContainText("Indiquez un e-mail valide");
    await expect(bouton).toBeDisabled();
  }
  await champ(page, "E-mail").fill(email);
  await expect(barre(page)).toContainText("Indiquez la ville de départ");

  await choisirVille(page.getByLabel("Ville de départ"), "paris");
  await expect(barre(page)).toContainText("Indiquez la ville d'arrivée");
  // Une ville tapée sans être choisie dans la liste suffit : la page la situe elle-même.
  const arrivee = page.getByLabel("Ville d'arrivée");
  await arrivee.fill("Toulouse");
  await expect(page.getByRole("listbox")).toBeVisible();
  await arrivee.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(barre(page)).toContainText("Renseignez le volume à déménager");
  await expect(bouton).toBeDisabled();

  // Un volume saisi puis effacé : de nouveau bloqué.
  await page.getByLabel("Volume estimé").fill("12");
  await expect(bouton).toBeEnabled();
  await page.getByLabel("Volume estimé").fill("");
  await expect(bouton).toBeDisabled();

  // Le volume déduit du logement : un clic sur le type, et le chiffre suit.
  await page.getByRole("button", { name: /Je décris mon logement/ }).click();
  await page.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: /^T2/ }).click();
  await expect(barre(page)).toContainText("20 m³ à déménager");
  await expect(bouton).toBeEnabled();
  await expect(page.getByText(/km par la route/)).toBeVisible();

  await verifierPagePropre(page, visiteur);
});

test("devis complet : « Continuer » reste fermé tant que manquent nom, téléphone, e-mail, ville et surface @lecture", async ({ page, visiteur }) => {
  await ouvrirPorte(page, "complet");
  const continuer = action(page, "Continuer");

  await expect(barre(page)).toContainText("Indiquez votre nom");
  await expect(continuer).toBeDisabled();
  await champ(page, "Nom").fill("Validation");
  await expect(barre(page)).toContainText("Indiquez votre téléphone");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await expect(barre(page)).toContainText("Indiquez un e-mail valide");
  await champ(page, "E-mail").fill("batterie.sans-domaine@");
  await expect(continuer).toBeDisabled();
  await champ(page, "E-mail").fill(emailUnique("validation"));
  // Les questions passées prennent leur valeur par défaut — et la barre le dit.
  await expect(barre(page)).toContainText(/questions sans réponse : les valeurs par défaut seront retenues/);
  await expect(continuer).toBeEnabled();

  // Une entreprise : la raison sociale tient lieu de nom.
  await page.getByRole("radio", { name: "Entreprise" }).click();
  await expect(champ(page, "Raison sociale")).toBeVisible();
  await page.getByRole("radio", { name: "Particulier" }).click();
  await expect(champ(page, "Raison sociale")).toHaveCount(0);
  await continuer.click();

  await expect(page.getByRole("heading", { name: /D'où partez-vous/ })).toBeVisible();
  await expect(barre(page)).toContainText("Indiquez la ville de départ");
  await expect(continuer).toBeDisabled();
  await choisirVille(page.getByLabel(/^Ville/), "paris");
  await expect(barre(page)).toContainText("Indiquez la surface habitable");
  await page.getByLabel(/^Surface habitable/).fill("0");
  await expect(continuer).toBeDisabled();
  await page.getByRole("button", { name: "Je ne connais pas la surface" }).click();
  await expect(page.getByLabel(/^Surface habitable/)).toBeDisabled();
  await expect(barre(page)).toContainText("Indiquez votre type de logement");
  await page.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: "Studio" }).click();
  await expect(continuer).toBeEnabled();

  await verifierPagePropre(page, visiteur);
});

test("devis complet : aller-retour entre les étapes sans perdre la saisie @lecture", async ({ page, visiteur }) => {
  const email = emailUnique("allers-retours");
  await ouvrirPorte(page, "complet");
  const continuer = action(page, "Continuer");
  const precedente = page.getByRole("button", { name: "Étape précédente" });

  await champ(page, "Prénom").fill("Testeur");
  await champ(page, "Nom").fill("Allers-Retours");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(email);
  await page.getByRole("radio", { name: "Une période" }).click();
  await page.getByRole("button", { name: "Ce mois-ci" }).click();
  await page.getByRole("button", { name: /Garantie dommages Luxe/ }).click();
  await continuer.click();

  await page.getByLabel("Adresse de départ").fill("7 allée des Essais");
  await choisirVille(page.getByLabel(/^Ville/), "lyon");
  await page.getByLabel(/^Étage/).fill("2");
  await page.getByLabel(/^Surface habitable/).fill("65");
  await continuer.click();

  await choisirVille(page.getByLabel(/^Ville/), "toulouse");
  await page.getByLabel(/^Surface habitable/).fill("48");
  await continuer.click();
  await expect(page.getByRole("radiogroup", { name: "Formule de déménagement" })).toBeVisible();

  // Trois pas en arrière : la première étape telle qu'on l'a laissée.
  for (let i = 0; i < 3; i++) await precedente.click();
  await expect(page.getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await expect(champ(page, "Prénom")).toHaveValue("Testeur");
  await expect(champ(page, "Nom")).toHaveValue("Allers-Retours");
  await expect(champ(page, "Téléphone")).toHaveValue(TEL_FICTIF);
  await expect(champ(page, "E-mail")).toHaveValue(email);
  await expect(page.getByRole("radio", { name: "Une période" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Ce mois-ci" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Garantie dommages Luxe/ })).toHaveAttribute("aria-pressed", "true");

  // Et en avant : le départ, puis l'arrivée, intacts.
  await continuer.click();
  await expect(page.getByLabel("Adresse de départ")).toHaveValue("7 allée des Essais");
  await expect(page.getByLabel(/^Ville/)).toHaveValue("Lyon");
  await expect(page.getByLabel("Code postal")).toHaveValue("69001");
  await expect(page.getByLabel(/^Étage/)).toHaveValue("2");
  await expect(page.getByLabel(/^Surface habitable/)).toHaveValue("65");
  await continuer.click();
  await expect(page.getByLabel(/^Ville/)).toHaveValue("Toulouse");
  await expect(page.getByLabel(/^Surface habitable/)).toHaveValue("48");

  // Jusqu'à la relecture, puis « Modifier » sur le départ : on y retourne, rien n'a bougé.
  await continuer.click();
  await continuer.click();
  await continuer.click();
  await page.getByLabel("Volume estimé").fill("22");
  await continuer.click();
  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();
  await expect(page.getByText(/7 allée des Essais, 69001 Lyon/)).toBeVisible();
  // Le groupe « Départ » du récapitulatif (le panneau de gauche, hors de <main>, a aussi une étape « Départ »).
  await page.getByRole("main").getByText("Départ", { exact: true }).locator("xpath=../..").getByRole("button", { name: "Modifier" }).click();
  await expect(page.getByRole("heading", { name: /D'où partez-vous/ })).toBeVisible();
  await expect(page.getByLabel(/^Surface habitable/)).toHaveValue("65");

  // Sur un grand écran, la frise du panneau ramène aussi à une étape déjà faite.
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.getByRole("complementary").getByRole("button", { name: /Vous/ }).click();
    await expect(champ(page, "Prénom")).toHaveValue("Testeur");
  }
  await verifierPagePropre(page, visiteur);
});

// Le bouton « Retour » du navigateur — ou le geste retour d'Android, très utilisé au téléphone — revient à
// l'étape précédente au lieu de quitter le formulaire, et la saisie reste.
test("devis complet : le retour du navigateur ramène à l'étape précédente sans perdre la saisie @lecture", async ({ page, visiteur }) => {
  await page.goto(EXT + "/?mode=complet");
  await champ(page, "Nom").fill("Retour Navigateur");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(emailUnique("retour"));
  await action(page, "Continuer").click();
  await expect(page.getByRole("heading", { name: /D'où partez-vous/ })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await expect(champ(page, "Nom")).toHaveValue("Retour Navigateur");
  await page.goForward();
  await expect(page.getByRole("heading", { name: /D'où partez-vous/ })).toBeVisible();
  await verifierPagePropre(page, visiteur);
});

test("retour et avance du navigateur, rechargement : la page revient propre, jamais cassée @lecture", async ({ page, visiteur }) => {
  // Le lien direct d'un devis (?mode=express) : rechargé, il rouvre le même devis.
  await page.goto(EXT + "/?mode=express");
  await champ(page, "Nom").fill("Rechargement");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();
  await expect(champ(page, "Nom")).toBeEditable();

  // Depuis la racine : rechargé en plein formulaire, le site revient sur ses trois portes.
  await ouvrirPorte(page, "complet");
  await champ(page, "Nom").fill("Rechargement");
  await page.reload();
  await expect(page.getByRole("button", { name: /Je suis un particulier/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Je déménage mon entreprise/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Je suis muté\(e\)/ })).toBeVisible();

  // L'ancienne adresse du formulaire (/demande) mène toujours au bon devis.
  await page.goto(EXT + "/demande?mode=complet");
  await expect(page).toHaveURL(/\/\?mode=complet$/);
  await expect(page.getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();

  await verifierPagePropre(page, visiteur);
});

test("un nom refusé par le serveur : le message s'affiche, la saisie reste, la demande corrigée part", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("nom-refuse");
  await ouvrirPorte(page, "express");
  await remplirExpress(page, "Testeur www.essai-batterie.fr", email);
  const envoyer = action(page, "Obtenir mon estimation");

  await envoyer.click();
  await expect(erreurFormulaire(page)).toHaveText("Le nom ne peut pas contenir d'adresse web.");
  // Le formulaire est revenu tel quel : rien à ressaisir.
  await expect(champ(page, "E-mail")).toHaveValue(email);
  await expect(page.getByLabel("Ville d'arrivée")).toHaveValue("Toulouse");
  await expect(page.getByLabel("Volume estimé")).toHaveValue("30");

  // Des caractères hors de la liste permise : un autre message, tout aussi lisible.
  await champ(page, "Nom").fill("Testeur <Batterie>");
  await envoyer.click();
  await expect(erreurFormulaire(page)).toContainText("Le nom ne peut contenir que des lettres");
  expect(await db.demandes(email), "rien n'est créé tant que le nom est refusé").toHaveLength(0);

  // Corrigé (tirets et apostrophe permis), il part.
  await champ(page, "Nom").fill("Testeur d'Essai–Batterie");
  await envoyer.click();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });
  const r = await db.demande(email);
  expect(r.client_nom).toBe("Testeur d'Essai–Batterie");
  await verifierPagePropre(page, visiteur);
});

// Une adresse e-mail que le navigateur laisse passer (le formulaire ne demande qu'« un @ et un point ») mais
// que le serveur refuse — faute de frappe courante : « .c » au lieu de « .com », une espace, un point final :
// le message dit que c'est l'e-mail, pour que le client sache quoi corriger.
test("une adresse e-mail refusée par le serveur : le message dit que c'est l'e-mail", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("courriel");
  const faute = email.replace(/@example\.com$/, "@example.c");
  await ouvrirPorte(page, "express");
  await remplirExpress(page, "Testeur Courriel", faute);
  await expect(action(page, "Obtenir mon estimation")).toBeEnabled();
  await action(page, "Obtenir mon estimation").click();
  await expect(erreurFormulaire(page)).toContainText(/e-mail|adresse électronique|courriel/i);
  await expect(champ(page, "E-mail")).toHaveValue(faute);
  expect(await db.demandes(faute)).toHaveLength(0);
  await verifierPagePropre(page, visiteur);
});

test("double clic sur « Obtenir mon estimation » : une seule demande", async ({ page, visiteur, db }) => {
  exigerEcritures();
  const email = emailUnique("double-clic");
  await ouvrirPorte(page, "express");
  await remplirExpress(page, "Testeur Double Clic", email);
  await action(page, "Obtenir mon estimation").dblclick();
  await expect(page.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 60_000 });

  const r = await db.demande(email);
  // La suite est passée (fiche Créagidem préparée) : un second envoi aurait eu le temps d'arriver.
  await db.attendreEvenement(r.id, "creagidem");
  expect(await db.demandes(email)).toHaveLength(1);
  await verifierPagePropre(page, visiteur);
});

test("photos : un fichier qui n'est pas une photo est refusé avec un message lisible @lecture", async ({ page, visiteur }) => {
  await ouvrirPorte(page, "express");
  await page.getByRole("button", { name: /J'envoie des photos/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "salon.jpg", mimeType: "image/jpeg", buffer: Buffer.from("Ceci n'est pas une photo.") });
  await page.getByRole("button", { name: "Analyser 1 photo" }).click();

  await expect(page.getByText("Analyse impossible")).toBeVisible();
  await expect(page.getByText("salon.jpg n'est pas une photo (JPEG, PNG, WebP ou HEIC).")).toBeVisible();
  // Le visiteur n'est pas bloqué : il garde les autres façons de donner son volume.
  await expect(barre(page)).toContainText("Indiquez votre nom");
  await page.getByRole("button", { name: /Je connais mon volume/ }).click();
  await expect(page.getByLabel("Volume estimé")).toBeVisible();
  await verifierPagePropre(page, visiteur);
});

/** Ouvre la base de photos d'exemple du devis express et lance l'analyse d'une photo (Gemini coupé : elle échoue). */
async function analyserUnePhotoDExemple(page: Page) {
  await ouvrirPorte(page, "express");
  await page.getByRole("button", { name: /J'envoie des photos/ }).click();
  const galerie = page.getByText(/Base de photos · \d+/);
  test.skip((await galerie.count()) === 0, "aucune photo d'exemple en recette");
  expect(await pageEnErreur(page)).toBeNull();
  await galerie.locator("xpath=../..").getByRole("button").filter({ has: page.locator("img") }).first().click();
  await page.getByRole("button", { name: "Analyser la sélection (1)" }).click();
  await expect(page.getByText("Analyse impossible")).toBeVisible({ timeout: 60_000 });
  return page.getByText("Analyse impossible").locator("xpath=../..");
}

/*
 * Une photo de la base d'exemples (rien n'est déposé dans le stockage), sur le seul projet bureau et les
 * seuls serveurs locaux, où la clé Gemini est volontairement invalide : chaque analyse compte une unité au
 * plafond quotidien de la recette (public.compteurs_jour).
 */
test("photos : l'analyse coupée (clé Gemini invalide), la page tient et le visiteur peut donner son volume autrement", async ({ page, visiteur }, info) => {
  test.skip(!LOCAL || info.project.name !== "parcours", "serveurs locaux (Gemini coupé), bureau seulement");
  const carte = await analyserUnePhotoDExemple(page);
  await expect(carte.getByRole("button", { name: /Patientez|Réessayer/ })).toBeVisible();
  // Aucune photo comptée, le volume reste à donner — et le visiteur peut le saisir.
  await expect(page.getByText("Volume total estimé")).toHaveCount(0);
  await page.getByRole("button", { name: /Je connais mon volume/ }).click();
  await page.getByLabel("Volume estimé").fill("20");
  await expect(page.getByRole("button", { name: /Je connais mon volume/ })).toHaveAttribute("aria-pressed", "true");
  // La route d'analyse répond 502 quand le moteur est coupé : c'est attendu, la page l'a géré.
  expect(visiteur.bilan().filter((e) => !/^502 \/api\/analyze-volume$|status of 502/.test(e))).toEqual([]);
});

// Quand l'analyse des photos échoue (clé refusée, quota, panne de Gemini), la carte « Analyse impossible »
// ne montre pas au visiteur la réponse brute de Google (du JSON en anglais) : /api/analyze-volume garde ce
// détail dans ses journaux et renvoie une phrase en français, qui laisse les autres façons de donner le volume.
test("photos : l'analyse coupée, le message montré au visiteur est en français et sans détail technique", async ({ page }, info) => {
  test.skip(!LOCAL || info.project.name !== "parcours", "serveurs locaux (Gemini coupé), bureau seulement");
  const carte = await analyserUnePhotoDExemple(page);
  const texte = await carte.innerText();
  expect(texte).not.toMatch(/\{|"error"|API key|INVALID_ARGUMENT|googleapis|GoogleGenerativeAI/i);
  expect(texte).toMatch(/indiquer votre volume|décrire votre logement|réessayer/i);
});

/** La page déborde-t-elle de l'écran en largeur (défilement horizontal au téléphone) ? */
const debordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Une adresse de test longue et sans tiret (ni coupure possible), comme bien des adresses professionnelles. */
const emailLong = () => emailUnique("adresse.professionnelle.longue").replace(/-/g, "");

// Au téléphone, la relecture du parcours « salarié muté » coupe une adresse e-mail longue sans tiret : sinon
// la page débordait en largeur (défilement horizontal) et la barre du bas, avec « Envoyer ma demande »,
// glissait sous le bas de l'écran.
test("au téléphone, une adresse e-mail longue ne fait pas déborder la relecture du salarié muté @lecture", async ({ page, visiteur }, info) => {
  test.skip(info.project.name !== "parcours-mobile", "téléphone seulement");
  await ouvrirPorte(page, "mutation");
  await champ(page, "Nom").fill("Testeur Mutation");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(emailLong());
  await page.getByLabel(/Par quelle entreprise/).fill("Batterie Essais Industries");
  await page.getByLabel("Date souhaitée").fill("2027-04-20");
  await action(page, "Continuer").click();
  await choisirVille(page.getByLabel(/^Ville/), "nantes");
  await page.getByLabel(/^Surface habitable/).fill("58");
  await action(page, "Continuer").click();
  await choisirVille(page.getByLabel(/^Ville/), "lille");
  await page.getByLabel(/^Surface habitable/).fill("70");
  await action(page, "Continuer").click();
  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();

  expect(await debordement(page), "défilement horizontal (px)").toBeLessThanOrEqual(0);
  await action(page, "Envoyer ma demande").click({ trial: true, timeout: 5_000 });
  await verifierPagePropre(page, visiteur);
});

test("au téléphone, une adresse e-mail longue ne fait pas déborder la relecture du devis complet @lecture", async ({ page, visiteur }, info) => {
  test.skip(info.project.name !== "parcours-mobile", "téléphone seulement");
  await ouvrirPorte(page, "complet");
  await champ(page, "Nom").fill("Testeur Complet");
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await champ(page, "E-mail").fill(emailLong());
  await action(page, "Continuer").click();
  await choisirVille(page.getByLabel(/^Ville/), "lyon");
  await page.getByLabel(/^Surface habitable/).fill("40");
  await action(page, "Continuer").click();
  await choisirVille(page.getByLabel(/^Ville/), "paris");
  await page.getByLabel(/^Surface habitable/).fill("40");
  for (let i = 0; i < 3; i++) await action(page, "Continuer").click();
  await page.getByLabel("Volume estimé").fill("15");
  await action(page, "Continuer").click();
  await expect(page.getByRole("heading", { name: /Un dernier mot/ })).toBeVisible();

  expect(await debordement(page), "défilement horizontal (px)").toBeLessThanOrEqual(0);
  await action(page, "Envoyer ma demande").click({ trial: true, timeout: 5_000 });
  await verifierPagePropre(page, visiteur);
});
