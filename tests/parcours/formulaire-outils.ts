/*
 * Les outils des parcours du formulaire public, des pages de rappel et de
 * complétion, de l'intégration au site officiel et des portails pro / RH.
 *
 * Trois choses que chaque test de ces fichiers fait de la même façon :
 *
 * 1. Se présenter sous une adresse IP neuve. Le serveur local lit X-Real-IP
 *    tel quel : chaque test a ses propres compteurs de limites (2 demandes
 *    par minute et par IP). L'en-tête n'est ajouté qu'aux requêtes vers
 *    l'app publique, par une route : posé sur tout le contexte
 *    (extraHTTPHeaders), il partait aussi vers api-adresse.data.gouv.fr, et
 *    le navigateur refusait la réponse (en-tête non permis par CORS).
 *
 * 2. Ne dépendre d'aucun service extérieur. La liste des villes (Base Adresse
 *    Nationale), la distance routière (OSRM), Nominatim et les tuiles de la
 *    carte sont servies par le test : mêmes villes, mêmes coordonnées, même
 *    distance à chaque passage, que l'Internet réponde ou non.
 *
 * 3. Lire l'effet en base de recette (client pg), par sondage : la suite
 *    d'une demande (chiffrage, fiche Créagidem, messages) part après la
 *    réponse du serveur, en quelques secondes.
 */
import { test as base, expect as expectDeBase, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { C, EXT, ipNeuve, pageEnErreur, surveiller } from "../outils/banc";
import { baseRecette } from "../outils/comptes.mjs";

/*
 * Le poste qui fait tourner la batterie porte souvent plusieurs passages à la
 * fois (d'autres agents, quatre ouvriers chacun) : une page peut mettre dix
 * secondes à répondre. Les attentes sont donc larges — elles ne ralentissent
 * rien quand tout va vite —, et les parcours longs ont quatre minutes.
 */
export const expect = expectDeBase.configure({ timeout: 25_000 });
export const DUREE_PARCOURS = 240_000;

/* ───────────────────────── Les villes servies par le test ───────────────────────── */

type Ville = { nom: string; cp: string; contexte: string; lat: number; lon: number };

export const VILLES: Record<string, Ville> = {
  lyon: { nom: "Lyon", cp: "69001", contexte: "69, Rhône, Auvergne-Rhône-Alpes", lat: 45.767, lon: 4.834 },
  toulouse: { nom: "Toulouse", cp: "31000", contexte: "31, Haute-Garonne, Occitanie", lat: 43.604, lon: 1.444 },
  paris: { nom: "Paris", cp: "75011", contexte: "75, Paris, Île-de-France", lat: 48.857, lon: 2.38 },
  nantes: { nom: "Nantes", cp: "44000", contexte: "44, Loire-Atlantique, Pays de la Loire", lat: 47.218, lon: -1.554 },
  bordeaux: { nom: "Bordeaux", cp: "33000", contexte: "33, Gironde, Nouvelle-Aquitaine", lat: 44.837, lon: -0.579 },
  lille: { nom: "Lille", cp: "59000", contexte: "59, Nord, Hauts-de-France", lat: 50.629, lon: 3.057 },
};

const aplatir = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La distance à vol d'oiseau, en kilomètres. */
function volOiseauKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** La « route » servie par le faux OSRM : le vol d'oiseau majoré de 25 %, au kilomètre. */
export const distanceRouteKm = (a: Ville, b: Ville) => Math.round(volOiseauKm(a, b) * 1.25);

const CORS = { "access-control-allow-origin": "*" };
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

/** Les services extérieurs que la page appelle depuis le navigateur, servis par le test. */
export async function bouchonsExterieurs(context: BrowserContext) {
  await context.route(/^https:\/\/(api-adresse\.data\.gouv\.fr\/|data\.geopf\.fr\/geocodage\/)/, (route) => {
    const url = new URL(route.request().url());
    const q = aplatir(url.searchParams.get("q") ?? "");
    const communes = url.searchParams.get("type") === "municipality";
    const features = Object.values(VILLES)
      .filter((v) => q.includes(aplatir(v.nom)))
      .map((v) => ({
        properties: {
          // Une adresse (sans type=municipality) : le libellé complet, avec la commune.
          label: communes ? v.nom : `${url.searchParams.get("q")} ${v.cp} ${v.nom}`,
          city: v.nom,
          name: v.nom,
          postcode: v.cp,
          context: v.contexte,
        },
        geometry: { coordinates: [v.lon, v.lat] },
      }));
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ type: "FeatureCollection", features }) });
  });
  await context.route(/^https:\/\/router\.project-osrm\.org\//, (route) => {
    const m = new URL(route.request().url()).pathname.match(/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    const [lon1, lat1, lon2, lat2] = m ? m.slice(1).map(Number) : [0, 0, 0, 0];
    const metres = Math.round(volOiseauKm({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }) * 1.25) * 1000;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS,
      body: JSON.stringify({ code: "Ok", routes: [{ distance: metres, geometry: { type: "LineString", coordinates: [[lon1, lat1], [lon2, lat2]] } }] }),
    });
  });
  await context.route(/^https:\/\/nominatim\.openstreetmap\.org\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: "[]" }),
  );
  await context.route(/tile\.openstreetmap\.org\//, (route) => route.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: PNG_1PX }));
}

/**
 * Une adresse IP neuve pour les requêtes vers l'app publique (et elles seules),
 * et les services extérieurs servis par le test. Rend l'adresse retenue.
 */
export async function preparerVisiteur(context: BrowserContext, ip = ipNeuve()): Promise<string> {
  const origine = new URL(EXT).origin;
  // Les limites ne portent que sur les routes d'API : les pages et leurs fichiers passent sans détour.
  await context.route(
    (url) => url.origin === origine && url.pathname.startsWith("/api/"),
    async (route) => route.continue({ headers: { ...(await route.request().allHeaders()), "x-real-ip": ip } }),
  );
  await bouchonsExterieurs(context);
  return ip;
}

/* ───────────────────────── La base de recette ───────────────────────── */

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; end: () => Promise<void> };

/** Une connexion à la base de recette, ouverte au premier besoin et fermée à la fin du test. */
export class Base {
  private client: Client | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.client) this.client = (await baseRecette()) as Client;
    return (await this.client.query(sql, params)).rows as T[];
  }

  /** Les demandes d'une adresse de test, de la plus ancienne à la plus récente. */
  demandes(email: string) {
    return this.q("select * from public.requests where lower(client_email) = lower($1) order by created_at", [email]);
  }

  /** La demande d'une adresse de test, attendue jusqu'à ce qu'elle existe (une seule). */
  async demande(email: string) {
    await expect.poll(async () => (await this.demandes(email)).length, { message: `demande de ${email}`, timeout: 45_000 }).toBe(1);
    return (await this.demandes(email))[0];
  }

  /** Les événements d'une demande (request_events), du plus ancien au plus récent. */
  evenements(id: string) {
    return this.q<{ type: string; payload: Record<string, unknown>; created_at: Date }>(
      "select type, payload, created_at from public.request_events where request_id = $1 order by created_at",
      [id],
    );
  }

  /** Attend qu'un événement du type voulu (et vérifiant `filtre`) soit inscrit, et le rend. */
  async attendreEvenement(id: string, type: string, filtre: (p: Record<string, unknown>) => boolean = () => true, timeout = 90_000) {
    let trouve: { type: string; payload: Record<string, unknown> } | undefined;
    await expect
      .poll(
        async () => {
          trouve = (await this.evenements(id)).find((e) => e.type === type && filtre(e.payload ?? {}));
          return !!trouve;
        },
        { message: `événement « ${type} » de la demande ${id}`, timeout, intervals: [500, 1000, 1500] },
      )
      .toBe(true);
    return trouve!;
  }

  /** Les envois journalisés vers une adresse (public.envois). */
  envois(destinataire: string) {
    return this.q<{ cle: string; canal: string; origine: string; statut: string; motif: string | null; reference: string | null; brevo_id: string | null }>(
      "select cle, canal, origine, statut, motif, reference, brevo_id from public.envois where lower(destinataire) = lower($1) order by cree_le",
      [destinataire],
    );
  }

  devis(requestId: string) {
    return this.q<{ id: string; status: string; montant_ttc: string; reference: string }>(
      "select id, status, montant_ttc, reference from public.devis where request_id = $1 order by created_at",
      [requestId],
    );
  }

  items(requestId: string) {
    return this.q<{ label: string; quantite: number; volume_unitaire_m3: string }>(
      "select label, quantite, volume_unitaire_m3 from public.request_items where request_id = $1 order by label",
      [requestId],
    );
  }

  async fermer() {
    await this.client?.end().catch(() => {});
    this.client = null;
  }
}

/* ───────────────────────── Les fixtures ───────────────────────── */

type Visiteur = {
  /** L'adresse IP sous laquelle ce test se présente à l'app publique. */
  ip: string;
  /** Erreurs JavaScript, réponses 5xx et erreurs de console relevées depuis l'ouverture. */
  bilan: () => string[];
  vider: () => string[];
};

export const test = base.extend<{ visiteur: Visiteur; db: Base }>({
  visiteur: async ({ context, page }, use) => {
    const ip = await preparerVisiteur(context);
    const s = surveiller(page);
    await use({ ip, ...s });
  },
  // eslint-disable-next-line no-empty-pattern
  db: async ({}, use) => {
    const b = new Base();
    await use(b);
    await b.fermer();
  },
});

/** Ce test écrit en base : seulement sur les serveurs locaux, branchés sur la recette. */
export const exigerEcritures = () => test.skip(!C.ecritures, "écrit en base : seulement sur les serveurs locaux (CIBLE=local)");

/** La page a-t-elle tenu ? Ni erreur JS, ni 5xx, ni erreur de console, ni page d'erreur. */
export async function verifierPagePropre(page: Page, visiteur: Pick<Visiteur, "bilan">, ignorer: RegExp[] = []) {
  const bilan = visiteur.bilan().filter((e) => !ignorer.some((r) => r.test(e)));
  expect(bilan, "erreurs relevées sur la page").toEqual([]);
  expect(await pageEnErreur(page), "page d'erreur affichée").toBeNull();
}

/* ───────────────────────── Le formulaire, pas à pas ───────────────────────── */

/** Ouvre la racine du site et passe la porte demandée. */
export async function ouvrirPorte(
  page: Page,
  porte: "express" | "complet" | "mutation" | "transfert" | "projet",
) {
  await page.goto(EXT + "/");
  if (porte === "mutation") return page.getByRole("button", { name: /Je suis muté\(e\)/ }).click();
  if (porte === "express" || porte === "complet") {
    await page.getByRole("button", { name: /Je suis un particulier/ }).click();
    return page.getByRole("button", { name: porte === "express" ? /Commencer le devis express/ : /Commencer le devis complet/ }).click();
  }
  await page.getByRole("button", { name: /Je déménage mon entreprise/ }).click();
  return page.getByRole("button", { name: porte === "transfert" ? /Décrire mon transfert/ : /Présenter mon projet/ }).click();
}

/**
 * Tape une ville dans un champ à suggestions et la choisit dans la liste —
 * comme le visiteur : c'est ce choix qui donne les coordonnées, donc la distance.
 */
export async function choisirVille(champ: Locator, ville: keyof typeof VILLES) {
  const v = VILLES[ville];
  await champ.click();
  await champ.fill(v.nom);
  // La liste est le frère du champ, dans le même bloc (AddressInput).
  const liste = champ.locator("xpath=..").getByRole("listbox");
  await liste.getByRole("button", { name: new RegExp(v.nom) }).first().click();
  await expect(champ).toHaveValue(v.nom);
  await expect(liste).toHaveCount(0);
}

/** Une ligne « question — Oui / Non » (composant Ligne) : clique la réponse. */
export async function repondre(portee: Page | Locator, question: string | RegExp, reponse: "Oui" | "Non") {
  const ligne = portee.getByText(question, { exact: typeof question === "string" }).first().locator("xpath=..");
  await ligne.getByRole("radio", { name: reponse }).click();
  await expect(ligne.getByRole("radio", { name: reponse })).toHaveAttribute("aria-checked", "true");
}

/** Le bloc (section) qui porte ce titre. */
export const bloc = (page: Page, titre: string | RegExp) => page.locator("section").filter({ has: page.getByRole("heading", { name: titre }) });

/** Le bouton d'action de la barre du bas (« Continuer », « Envoyer ma demande »…). */
export const action = (page: Page, nom: string | RegExp) => page.getByRole("button", { name: nom });

/** Le message de la barre du bas : ce qui manque pour avancer. */
export const barre = (page: Page) => page.locator("div.sticky.bottom-0");

/** L'estimation affichée (« 2 736 € ») en euros. */
export function euros(texte: string): number {
  return Number(texte.replace(/[^\d,.-]/g, "").replace(",", "."));
}

/** Un numéro de téléphone fictif (tranche réservée aux œuvres de fiction par l'ARCEP). */
export const TEL_FICTIF = "01 99 00 12 34";

const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Le champ d'un libellé exact — « Nom » et non « Prénom » —, astérisque
 * d'obligation comprise ou non (le libellé lu est « Nom* »).
 */
export const champ = (portee: Page | Locator, libelle: string) => portee.getByLabel(new RegExp(`^${echapper(libelle)}\\s*\\*?$`));

/** Le devis express rempli de bout en bout, prêt à partir (Paris → Toulouse, 30 m³ par défaut : départ en Île-de-France, l'estimation s'affiche). */
export async function remplirExpress(page: Page, nom: string, email: string, volume = "30") {
  await champ(page, "Nom").fill(nom);
  await champ(page, "E-mail").fill(email);
  await champ(page, "Téléphone").fill(TEL_FICTIF);
  await choisirVille(page.getByLabel("Ville de départ"), "paris");
  await choisirVille(page.getByLabel("Ville d'arrivée"), "toulouse");
  await page.getByLabel("Volume estimé").fill(volume);
  await expect(barre(page)).toContainText(`${volume} m³ à déménager`);
}

/** Le message d'erreur du formulaire (bloc rouge sous les champs). */
export const erreurFormulaire = (page: Page) => page.locator("div.text-danger").filter({ hasText: /\S/ });

/**
 * Le montant de l'estimation à l'écran, en euros. L'écran attend le devis
 * douze secondes, puis se replie sur « en cours de finalisation » : sur un
 * poste très chargé, le chiffrage peut dépasser ce délai — le repli est alors
 * le bon comportement, et le montant se vérifie en base seulement.
 */
export async function montantAffiche(page: Page): Promise<number | null> {
  const montant = page.getByText("Total estimé");
  const repli = page.getByText(/Votre devis est en cours de finalisation/);
  await expect(montant.or(repli)).toBeVisible();
  if (await repli.isVisible()) {
    test.info().annotations.push({ type: "remarque", description: "chiffrage plus lent que la patience de l'écran (12 s) : montant vérifié en base seulement" });
    return null;
  }
  const total = euros(await montant.locator("xpath=following-sibling::*[1]").innerText());
  expect(total).toBeGreaterThan(0);
  return total;
}

/**
 * Le chiffrage d'une demande : l'analyse est passée, l'estimation est posée
 * sur la demande, et son devis brouillon porte le même montant.
 *
 * Le devis peut manquer : c'est le défaut de numérotation des devis (référence
 * = nombre de devis + 1, en collision dès qu'un devis a été effacé), prouvé par
 * son propre test dans formulaire-modification.spec.ts. Ici, son absence est
 * annotée et le test vérifie le reste ; rend le devis, ou null.
 */
export async function verifierChiffrage(db: Base, id: string): Promise<{ id: string; montant_ttc: string; status: string } | null> {
  await db.attendreEvenement(id, "analysis");
  const [r] = await db.q<{ estimation_prix: string | null; status: string }>("select estimation_prix, status from public.requests where id = $1", [id]);
  expect(r.status).toBe("qualified");
  expect(Number(r.estimation_prix), "estimation posée sur la demande").toBeGreaterThan(0);
  // Chaque demande chiffrée a son devis (la référence ne se heurte plus à une référence existante, devis-reference.ts).
  const devis = await expect.poll(async () => (await db.devis(id)).length, { message: `devis de la demande ${id}`, timeout: 30_000 }).toBe(1).then(() => db.devis(id));
  expect(devis[0].status).toBe("brouillon");
  expect(Number(devis[0].montant_ttc)).toBe(Number(r.estimation_prix));
  return devis[0];
}
