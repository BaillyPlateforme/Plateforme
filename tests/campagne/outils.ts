/*
 * Les aides de la campagne : le visiteur (adresse IP neuve, services
 * extérieurs), le relevé des écarts, le remplissage des formulaires depuis
 * une ligne de la table, et les vérifications derrière l'écran — la demande
 * en recette, ses événements, son devis, ses messages, sa fiche Créagidem, sa
 * page dans le CRM, et le cadre du site officiel.
 *
 * Tout ce qui est attendu se déduit de ce que le scénario a SAISI, jamais du
 * code de l'application : un écart est un défaut à examiner, pas une valeur
 * à recopier.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect as expectBase, type Browser, type BrowserContext, type Frame, type Locator, type Page } from "@playwright/test";
import { EXT, INT, fichierSession, ipNeuve, pageEnErreur, surveiller } from "../outils/banc";
import { Base } from "../parcours/formulaire-outils";
import { ETRANGER, VILLES, aplatir, outreMer, volOiseauKm, type CleVille } from "./villes";

export const expect = expectBase.configure({ timeout: 25_000 });
export { Base };
export const DOSSIER = path.dirname(fileURLToPath(import.meta.url));
export const CAPTURES = path.join(DOSSIER, "captures");
export const RESULTATS = path.join(DOSSIER, "resultats", "scenarios");
export const PHOTOS = path.resolve(DOSSIER, "../../Photos");

/* ───────────────────────── Les données d'un scénario ───────────────────────── */

/** Une ville : choisie dans la liste (table), ou tapée telle quelle (étrangère, inconnue). */
export type RefVille = { cle: CleVille; tape?: string } | { saisie: string };
export type Quand = { date: string } | { periode: string } | { libre: string };

export const estChoisie = (r: RefVille): r is { cle: CleVille; tape?: string } => "cle" in r;
export const nomVille = (r: RefVille) => (estChoisie(r) ? VILLES[r.cle].nom : r.saisie);
export const cpVille = (r: RefVille) => (estChoisie(r) ? VILLES[r.cle].cp : null);
/** Les vraies coordonnées d'une ville du scénario (table ou ville étrangère connue), sinon rien. */
export const coordVille = (r: RefVille) => (estChoisie(r) ? VILLES[r.cle] : (ETRANGER[r.saisie] ?? null));

/** La distance que le formulaire doit trouver entre deux villes de la table (faux OSRM : vol d'oiseau + 25 %, ou vol d'oiseau seul sans route). */
export function distanceAttendue(a: RefVille, b: RefVille): number | null {
  if (!estChoisie(a) || !estChoisie(b)) return null;
  const va = VILLES[a.cle], vb = VILLES[b.cle];
  // L'outre-mer passe par le vrai service : pas de valeur exacte à attendre, seulement une distance plausible.
  return sansRoute(va, vb) ? null : Math.round(volOiseauKm(va, vb) * 1.25);
}
const sansRoute = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => (outreMer(a) || outreMer(b)) && volOiseauKm(a, b) > 300;

export const VALEURS_TRANCHES = ["< 10 000 €", "10 000 – 30 000 €", "30 000 – 60 000 €", "> 60 000 €"] as const;
export type Tranche = (typeof VALEURS_TRANCHES)[number];
/** La borne haute d'une tranche (ce que Créagidem doit recevoir) — « > 60 000 € » n'en a pas : 60 000, sa seule borne. */
export const BORNE_HAUTE: Record<Tranche, number> = { "< 10 000 €": 10000, "10 000 – 30 000 €": 30000, "30 000 – 60 000 €": 60000, "> 60 000 €": 60000 };

/* ───────────────────────── Le visiteur et les services extérieurs ───────────────────────── */

const CORS = { "access-control-allow-origin": "*" };
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

/** Ce que la vraie Base Adresse Nationale a répondu pour une ville hors de la table (pour le rapport). */
export type ReponseBan = { q: string; type: string | null; resultats: { ville: string; cp: string; score: number }[] };

function villesDeLaTable(brut: string, communes: boolean) {
  const cp = brut.match(/\b(\d{5})\b/)?.[1];
  const q = aplatir(brut.replace(/\b\d{5}\b/g, " "));
  if (q.length < 2) return [];
  const autour = ` ${q} `;
  let liste = Object.values(VILLES).filter((v) => {
    const n = aplatir(v.nom);
    return communes ? n.startsWith(q) || autour.includes(` ${n} `) : autour.includes(` ${n} `);
  });
  // Une adresse : la ville la plus longue nommée (« Lyon 3e Arrondissement » plutôt que « Lyon »).
  if (!communes && liste.length) {
    const max = Math.max(...liste.map((v) => v.nom.length));
    liste = liste.filter((v) => v.nom.length === max);
  }
  const rang = (v: (typeof liste)[number]) => (cp && v.cp === cp ? 4 : 0) + (aplatir(v.nom) === q ? 2 : 0);
  return liste.map((v, i) => ({ v, i })).sort((a, b) => rang(b.v) - rang(a.v) || a.i - b.i).map((x) => x.v);
}

/**
 * Les services que la page appelle depuis le navigateur :
 *   - la Base Adresse Nationale : les villes de la table servies par le test
 *     (les mêmes valeurs qu'elle) ; une commune hors table part vers la VRAIE
 *     base — c'est ce qu'obtient un visiteur qui tape « Londres » ou une ville
 *     qui n'existe pas ; une adresse hors table ne trouve rien ;
 *   - OSRM : le vol d'oiseau majoré de 25 % ; pas de route vers l'outre-mer
 *     (réponse « NoRoute », comme le vrai service) ;
 *   - Nominatim et les tuiles de la carte : vides.
 */
export async function bouchons(context: BrowserContext, journalBan: ReponseBan[]) {
  await context.route(/^https:\/\/(api-adresse\.data\.gouv\.fr\/search\/|data\.geopf\.fr\/geocodage\/search)/, async (route) => {
    const url = new URL(route.request().url());
    const brut = url.searchParams.get("q") ?? "";
    const type = url.searchParams.get("type");
    const communes = type === "municipality";
    const limite = Number(url.searchParams.get("limit") ?? "5") || 5;
    const trouvees = villesDeLaTable(brut, communes).slice(0, limite);
    if (!trouvees.length && communes) {
      try {
        const rep = await route.fetch({ timeout: 10_000 });
        const texte = await rep.text();
        try {
          const j = JSON.parse(texte) as { features?: { properties: Record<string, unknown> }[] };
          journalBan.push({ q: brut, type, resultats: (j.features ?? []).map((f) => ({ ville: String(f.properties.city ?? f.properties.name ?? ""), cp: String(f.properties.postcode ?? ""), score: Math.round(Number(f.properties.score ?? 0) * 100) / 100 })) });
        } catch {
          journalBan.push({ q: brut, type, resultats: [] });
        }
        return route.fulfill({ response: rep, body: texte });
      } catch {
        return route.abort();
      }
    }
    const features = trouvees.map((v) => {
      const rue = communes ? v.nom : brut.replace(new RegExp(`[,\\s]*${v.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();
      return {
        type: "Feature",
        properties: { label: communes ? v.nom : `${rue} ${v.cp} ${v.nom}`, city: v.nom, name: communes ? v.nom : rue, postcode: v.cp, context: v.contexte, score: 0.97, type: communes ? "municipality" : "housenumber" },
        geometry: { type: "Point", coordinates: [v.lon, v.lat] },
      };
    });
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ type: "FeatureCollection", features }) });
  });
  await context.route(/^https:\/\/router\.project-osrm\.org\//, async (route) => {
    const m = new URL(route.request().url()).pathname.match(/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    const [lon1, lat1, lon2, lat2] = m ? m.slice(1).map(Number) : [0, 0, 0, 0];
    const a = { lat: lat1, lon: lon1 }, b = { lat: lat2, lon: lon2 };
    // L'outre-mer : le vrai service, qui ne répond pas « pas de route » mais une distance (1 940 km pour
    // Paris → Fort-de-France, relevé le 18/11/2026) — c'est ce que voit un visiteur.
    if (sansRoute(a, b)) {
      try {
        const rep = await route.fetch({ timeout: 10_000 });
        return route.fulfill({ response: rep, body: await rep.text() });
      } catch {
        return route.fulfill({ status: 400, contentType: "application/json", headers: CORS, body: JSON.stringify({ code: "NoRoute", message: "Impossible route between points" }) });
      }
    }
    const metres = Math.round(volOiseauKm(a, b) * 1.25) * 1000;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS,
      body: JSON.stringify({ code: "Ok", routes: [{ distance: metres, geometry: { type: "LineString", coordinates: [[lon1, lat1], [lon2, lat2]] } }] }),
    });
  });
  await context.route(/^https:\/\/nominatim\.openstreetmap\.org\//, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: "[]" }));
  await context.route(/tile\.openstreetmap\.org\//, (route) => route.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: PNG_1PX }));
}

/** Une adresse IP neuve pour les routes d'API de l'app publique (et elles seules), puis les services extérieurs. */
export async function preparerVisiteur(context: BrowserContext, journalBan: ReponseBan[]): Promise<string> {
  const ip = ipNeuve();
  const origine = new URL(EXT).origin;
  await context.route(
    (url) => url.origin === origine && url.pathname.startsWith("/api/"),
    async (route) => route.continue({ headers: { ...(await route.request().allHeaders()), "x-real-ip": ip } }),
  );
  await bouchons(context, journalBan);
  return ip;
}

/* ───────────────────────── Le relevé des écarts ───────────────────────── */

export type Ou = "écran" | "base" | "créagidem" | "envois" | "devis" | "crm" | "cadre";
export type Constat = { ou: Ou; quoi: string; attendu?: unknown; obtenu?: unknown; capture?: string };

const normal = (v: unknown): unknown => {
  if (v === undefined || v === "") return null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  if (Array.isArray(v)) return v.map(normal);
  if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normal(x)]));
  return v;
};

/** Les écarts d'un scénario : chacun est noté (pour le rapport) et compté comme échec doux (le scénario va au bout). */
export class Constats {
  liste: Constat[] = [];
  notes: string[] = [];
  egal(ou: Ou, quoi: string, obtenu: unknown, attendu: unknown) {
    if (JSON.stringify(normal(obtenu)) === JSON.stringify(normal(attendu))) return true;
    this.liste.push({ ou, quoi, attendu, obtenu });
    expect.soft(normal(obtenu), `${ou} · ${quoi}`).toEqual(normal(attendu));
    return false;
  }
  vrai(ou: Ou, quoi: string, ok: boolean, obtenu?: unknown, attendu?: unknown) {
    if (ok) return true;
    this.liste.push({ ou, quoi, attendu, obtenu });
    expect.soft(ok, `${ou} · ${quoi}${obtenu !== undefined ? ` (obtenu : ${JSON.stringify(obtenu).slice(0, 300)})` : ""}`).toBe(true);
    return false;
  }
  contient(ou: Ou, quoi: string, texte: string | null | undefined, morceau: string | RegExp) {
    const t = texte ?? "";
    return this.vrai(ou, quoi, typeof morceau === "string" ? t.includes(morceau) : morceau.test(t), t.slice(0, 400), String(morceau));
  }
  note(t: string) {
    this.notes.push(t);
  }
  /** Attache une capture au dernier écart noté. */
  dernier(capture: string) {
    const c = this.liste.at(-1);
    if (c && !c.capture) c.capture = capture;
  }
}

/* ───────────────────────── Captures ───────────────────────── */

export async function capturer(page: Page, n: number, nom: string): Promise<string> {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const fichier = `${String(n).padStart(3, "0")}-${nom}.png`;
  // Bornée : une page longue avec l'estimation en PDF dans un cadre peut faire attendre une capture pleine page sans fin.
  await page
    .screenshot({ path: path.join(CAPTURES, fichier), fullPage: true, timeout: 15_000 })
    .catch(() => page.screenshot({ path: path.join(CAPTURES, fichier), timeout: 10_000 }).catch(() => {}));
  return `captures/${fichier}`;
}

/* ───────────────────────── Les gestes du visiteur ───────────────────────── */

const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Le champ d'un libellé exact, astérisque comprise ou non. */
export const champ = (R: Locator, libelle: string) => R.getByLabel(new RegExp(`^${echapper(libelle)}\\s*\\*?$`));
export const barre = (R: Locator) => R.locator("div.sticky.bottom-0");
export const bouton = (R: Locator, nom: string | RegExp) => R.getByRole("button", { name: nom });
/** Le bloc (section) qui porte ce titre : remonté depuis son titre (un filtre « has » relatif à <body> ne trouverait rien). */
export const bloc = (R: Locator, titre: string | RegExp) => R.getByRole("heading", { name: titre }).first().locator("xpath=ancestor::section[1]");

/** Une ligne « question — Oui / Non » (ou Complet / Partiel) : clique la réponse. */
export async function repondre(R: Locator, question: string, reponse: string) {
  const ligne = R.getByText(question, { exact: true }).first().locator("xpath=..");
  await ligne.getByRole("radio", { name: reponse, exact: true }).click();
  await expect(ligne.getByRole("radio", { name: reponse, exact: true })).toHaveAttribute("aria-checked", "true");
}

/** Une ville, comme le visiteur : tapée, puis choisie dans la liste — ou laissée telle quelle (le formulaire la situe seul). */
export async function choisirVille(page: Page, saisie: Locator, ref: RefVille) {
  await saisie.click();
  if (estChoisie(ref)) {
    const v = VILLES[ref.cle];
    await saisie.fill(ref.tape ?? v.nom);
    const liste = saisie.locator("xpath=..").getByRole("listbox");
    await liste.getByRole("button").filter({ hasText: v.cp }).filter({ hasText: v.nom }).first().click();
    await expect(saisie).toHaveValue(v.nom);
    await expect(liste).toHaveCount(0);
  } else {
    await saisie.fill(ref.saisie);
    // La liste de suggestions (vraie base, s'il y en a une) est écartée : le visiteur ne choisit rien.
    await page.waitForTimeout(600);
    await saisie.press("Escape");
    // La page situe la ville tapée après 700 ms de calme, auprès de la base d'adresses.
    await page.waitForTimeout(1800);
  }
}

/** « Quand ? » : une date, une période proposée, ou les mots du client. */
export async function choisirQuand(R: Locator, q: Quand) {
  if ("date" in q) {
    await R.getByRole("radio", { name: "Une date précise" }).click();
    await R.getByLabel("Date souhaitée").fill(q.date);
  } else if ("periode" in q) {
    await R.getByRole("radio", { name: "Une période" }).click();
    await R.getByRole("button", { name: q.periode, exact: true }).click();
    await expect(R.getByRole("button", { name: q.periode, exact: true })).toHaveAttribute("aria-pressed", "true");
  } else {
    await R.getByRole("radio", { name: "Je précise moi-même" }).click();
    await R.getByRole("textbox", { name: "Période souhaitée" }).fill(q.libre);
  }
}

/** Ce que la demande doit porter de la date : la date, ou la période (la valeur par défaut sans réponse). */
export function dateAttendue(q: Quand | undefined, parDefaut = "Je ne sais pas encore") {
  if (!q) return { date_souhaitee: null, flexibilite: parDefaut };
  if ("date" in q) return { date_souhaitee: q.date, flexibilite: null };
  return { date_souhaitee: null, flexibilite: "periode" in q ? q.periode : q.libre };
}

/** Le champ « date_ou_periode » attendu dans Créagidem : AAAAMMJJ d'une date ; sinon la période, lisible. */
export function verifierDateCreagidem(k: Constats, valeur: string, q: Quand | undefined, parDefaut = "Je ne sais pas encore") {
  if (q && "date" in q) return k.egal("créagidem", "date_ou_periode (date)", valeur, q.date.replaceAll("-", ""));
  const texte = !q ? parDefaut : "periode" in q ? q.periode : q.libre;
  const plat = aplatir(texte);
  const mois = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"].findIndex((m) => plat.split(" ").includes(m));
  const an = plat.match(/\b(20\d{2})\b/)?.[1];
  const aaaamm = an && mois >= 0 ? `${an}${String(mois + 1).padStart(2, "0")}` : null;
  return k.vrai("créagidem", `date_ou_periode (« ${texte} »)`, valeur === aaaamm || aplatir(valeur) === plat, valeur, aaaamm ?? texte.toUpperCase());
}

/** Le volume saisi dans le champ « Volume estimé ». */
export async function saisirVolume(R: Locator, v: number | string) {
  await R.getByLabel("Volume estimé").fill(String(v));
}

/** Les meubles, ajoutés depuis le catalogue : un clic, puis « Ajouter un … » pour les suivants. */
export async function listerMeubles(R: Locator, liste: [string, number][]) {
  await bouton(R, /Je liste mes meubles/).click();
  for (const [label, n] of liste) {
    await R.getByRole("button", { name: label, exact: true }).click();
    for (let i = 1; i < n; i++) await R.getByRole("button", { name: `Ajouter un ${label}`, exact: true }).click();
  }
}

/** Des photos déposées puis analysées ; rend le volume total affiché. Sans Gemini, une analyse factice (mise au point). */
export async function analyserPhotos(page: Page, R: Locator, fichiers: string[]): Promise<number> {
  await bouton(R, /J'envoie des photos/).click();
  if (process.env.CAMPAGNE_PHOTOS === "factice") {
    await page.route(/\/api\/analyze-volume$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          photos: fichiers.map((f, i) => ({ piece: "Salon", objets: [{ label: "Canapé 3 places", quantite: 1, volume_m3: 1.5 }, { label: "Table basse", quantite: 1, volume_m3: 0.4 }], volume_m3: 1.9, storage_path: `staging/factice-${Date.now()}/${i}-${path.basename(f)}` })),
          total_volume_m3: 1.9 * fichiers.length,
          errors: [],
        }),
      }),
    );
  }
  await R.locator('input[type="file"]').setInputFiles(fichiers.map((f) => path.join(PHOTOS, f)));
  await bouton(R, /^Analyser \d+ photos?$/).click();
  const total = R.getByText("Volume total estimé").locator("xpath=..");
  await expect(total).toBeVisible({ timeout: 150_000 });
  return Number((await total.innerText()).replace(/[^\d.,]/g, " ").trim().split(/\s+/).pop()!.replace(",", "."));
}

/** Le montant de l'écran d'estimation (« Total estimé »), ou null quand l'écran se replie sans montant. */
export async function lireEstimation(R: Locator): Promise<{ total: number | null; repli: boolean }> {
  const montant = R.getByText("Total estimé");
  const repli = R.getByText(/Votre devis est en cours de finalisation/);
  await expect(montant.or(repli)).toBeVisible({ timeout: 30_000 });
  if (await repli.isVisible()) return { total: null, repli: true };
  const t = await montant.locator("xpath=following-sibling::*[1]").innerText();
  return { total: Number(t.replace(/TTC/, "").replace(/[^\d,.-]/g, "").replace(",", ".")), repli: false };
}

/** La page déborde-t-elle en largeur (défilement horizontal) ? */
export const debordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* ───────────────────────── Le cadre du site officiel ───────────────────────── */

export const OFFICIEL = "https://www.demenagements-bailly.com/devis/";

/** La page WordPress simulée : un menu fixe de 80 px, le bloc du devis, le script d'intégration. */
const pageHote = (attributs: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Demande de devis — Bailly Déménagement</title></head>
<body style="margin:0;font-family:sans-serif">
  <header style="position:fixed;top:0;left:0;right:0;height:80px;background:#1b1a18;color:#fff;z-index:10">Menu du site</header>
  <main style="padding-top:120px">
    <h1 style="margin:0 16px 24px">Demander un devis</h1>
    <div data-bailly-devis ${attributs}><a href="${EXT}/">Faire ma demande de devis</a></div>
  </main>
  <footer style="height:900px;background:#eee">Pied du site</footer>
  <script src="${EXT}/integration.js" async></script>
</body></html>`;

export async function servirHote(context: BrowserContext, attributs = 'data-decalage="80"') {
  await context.grantPermissions(["local-network-access"]);
  await context.route(
    (url) => url.href.startsWith(OFFICIEL),
    (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: pageHote(attributs) }),
  );
}

export const cadre = (page: Page) => page.locator("[data-bailly-devis] iframe");
export const cadreFrame = (page: Page): Frame | undefined => page.frames().find((f) => f.url().startsWith(EXT));

/** Hauteur du cadre, hauteur de ce qu'il affiche, défilement intérieur, et position de son haut dans la page. */
export async function mesuresCadre(page: Page) {
  const duCadre = await cadre(page).evaluate((e) => parseInt((e as HTMLIFrameElement).style.height, 10));
  const haut = Math.round((await cadre(page).boundingBox())?.y ?? -1);
  const f = cadreFrame(page);
  const dedans = f
    ? await f.evaluate(() => {
        const blocs = [...document.body.children].filter((e) => e.tagName === "DIV");
        const contenu = blocs.length ? Math.max(...blocs.map((e) => Math.ceil(e.getBoundingClientRect().height))) : -1;
        const el = document.scrollingElement ?? document.documentElement;
        return { contenu, defilement: el.scrollHeight - window.innerHeight };
      })
    : { contenu: -1, defilement: -1 };
  return { duCadre, haut, ...dedans, ecran: page.viewportSize()?.height ?? 900 };
}

/**
 * Après un changement d'étape dans le cadre : sa hauteur suit le contenu
 * (à un pixel près), il n'a pas de barre de défilement à lui, et la page est
 * revenue sur le haut du formulaire, sous le menu fixe (data-decalage=80).
 */
export async function verifierCadre(page: Page, k: Constats, etape: string, retourHaut = true) {
  let m = await mesuresCadre(page);
  const enHaut = (x: typeof m) => !retourHaut || (x.haut >= 79 && x.haut <= Math.max(93, x.ecran * 0.4 + 1));
  const ok = (x: typeof m) => x.contenu > 0 && Math.abs(x.duCadre - x.contenu) <= 1 && x.defilement <= 1 && enHaut(x);
  const fin = Date.now() + 8_000;
  while (!ok(m) && Date.now() < fin) {
    await page.waitForTimeout(400);
    m = await mesuresCadre(page);
  }
  k.vrai("cadre", `${etape} : hauteur du cadre = hauteur du contenu`, m.contenu > 0 && Math.abs(m.duCadre - m.contenu) <= 1, { cadre: m.duCadre, contenu: m.contenu });
  k.vrai("cadre", `${etape} : pas de barre de défilement intérieure`, m.defilement <= 1, { defilement: m.defilement });
  if (retourHaut) k.vrai("cadre", `${etape} : la page revient sur le haut du formulaire`, enHaut(m), { hautDuCadre: m.haut, ecran: m.ecran });
  return m;
}

/* ───────────────────────── Derrière l'écran : la recette ───────────────────────── */

type Regle = { id: string; name: string; event: string; channel: "email" | "sms"; destinataire: string; condition_source: string | null; condition_champ: string | null };
let regles: Regle[] | null = null;
/** Les règles d'alerte actives de la recette (public.alerts), lues une fois par ouvrier. */
export async function reglesActives(db: Base): Promise<Regle[]> {
  regles ??= await db.q<Regle>("select id::text, name, event, channel, destinataire, condition_source, condition_champ from public.alerts where active");
  return regles;
}

/**
 * Les messages qu'auraient déclenchés les règles d'alerte, pour les
 * événements de la demande : chacun au journal des envois, sous sa clé, au
 * statut « fictif » (e-mail @example.com) ou « journalisé » (SMS, envoi
 * désactivé) — jamais parti.
 */
export async function verifierEnvois(db: Base, k: Constats, o: { id: string; email: string; tel?: string | null; source: "form" | "email"; evenements: string[]; manques?: string[] }) {
  const attendus = (await reglesActives(db)).filter(
    (r) =>
      o.evenements.includes(r.event) &&
      r.destinataire === "client" &&
      (!r.condition_source || r.condition_source === o.source) &&
      (!r.condition_champ || (o.manques ?? []).includes(r.condition_champ)),
  );
  const cles = attendus.filter((r) => r.channel === "email" || o.tel).map((r) => `questionnaires:${r.event}:${r.id}:${o.id}`);
  const lire = () => db.q<{ cle: string; canal: string; statut: string; destinataire: string; brevo_id: string | null }>("select cle, canal, statut, destinataire, brevo_id from public.envois where reference = $1", [o.id]);
  let lignes = await lire();
  const fin = Date.now() + 60_000;
  // Chaque envoi attendu est inscrit, et traité (un envoi « en_cours » se conclut une demi-seconde plus tard).
  while ((cles.some((c) => !lignes.some((l) => l.cle === c)) || lignes.some((l) => l.statut === "en_cours")) && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 1000));
    lignes = await lire();
  }
  for (const r of attendus) {
    const cle = `questionnaires:${r.event}:${r.id}:${o.id}`;
    const l = lignes.find((x) => x.cle === cle);
    if (r.channel === "sms" && !o.tel) {
      k.vrai("envois", `« ${r.name} » (SMS) : pas d'envoi sans téléphone`, !l, l);
      continue;
    }
    if (!k.vrai("envois", `« ${r.name} » (${r.channel}, ${r.event}) au journal des envois`, !!l, lignes.map((x) => x.cle))) continue;
    k.egal("envois", `« ${r.name} » : destinataire`, l!.destinataire.toLowerCase(), r.channel === "email" ? o.email.toLowerCase() : o.tel);
    k.vrai("envois", `« ${r.name} » : rien n'est parti`, r.channel === "email" ? l!.statut === "fictif" : ["fictif", "journalise"].includes(l!.statut), l!.statut, r.channel === "email" ? "fictif" : "fictif ou journalise");
    // brevo_id : l'identifiant du message chez son fournisseur, quel qu'il soit (Brevo, SendGrid ou Twilio).
    k.egal("envois", `« ${r.name} » : pas d'identifiant du fournisseur`, l!.brevo_id, null);
  }
  const partis = lignes.filter((l) => ["envoye", "bac_a_sable", "en_cours", "incertain"].includes(l.statut));
  k.vrai("envois", "aucun message réellement envoyé pour cette demande", partis.length === 0, partis);
  return lignes;
}

/** Les lignes d'un devis brouillon. */
export async function devisDe(db: Base, id: string) {
  return db.q<{ id: string; reference: string; status: string; montant_ttc: string; lignes: { label: string; detail?: string; amount: number }[] }>(
    "select id::text, reference, status, montant_ttc, lignes from public.devis where request_id = $1 order by created_at",
    [id],
  );
}

/** Attend le chiffrage (événement « analysis »), et rend la demande relue et son devis. */
export async function attendreChiffrage(db: Base, id: string) {
  await db.attendreEvenement(id, "analysis", () => true, 90_000);
  const fin = Date.now() + 20_000;
  let devis = await devisDe(db, id);
  while (!devis.length && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 1000));
    devis = await devisDe(db, id);
  }
  const [r] = await db.q("select * from public.requests where id = $1", [id]);
  return { r, devis };
}

/** Les suppléments que le devis doit porter, d'après ce que le client a déclaré. */
export function verifierLignesDevis(
  k: Constats,
  lignes: { label: string; detail?: string; amount: number }[],
  o: { piano?: boolean; charges?: number; tranche?: Tranche | null; garantie?: "standard" | "luxe" | null },
) {
  const a = (re: RegExp) => lignes.find((l) => re.test(l.label));
  if (o.piano) k.vrai("devis", "ligne « Portage piano » (piano déclaré)", !!a(/piano/i), lignes.map((l) => l.label));
  else k.vrai("devis", "pas de ligne piano (aucun piano déclaré)", !a(/piano/i), lignes.map((l) => l.label));
  if (o.charges) {
    const l = a(/charges lourdes/i);
    if (k.vrai("devis", `ligne « charges lourdes » (${o.charges} objets déclarés)`, !!l, lignes.map((x) => x.label))) k.contient("devis", "nombre de charges lourdes facturées", l!.detail, new RegExp(`^${o.charges} ×`));
  }
  const valeurs: Record<Tranche, number> = { "< 10 000 €": 10000, "10 000 – 30 000 €": 30000, "30 000 – 60 000 €": 60000, "> 60 000 €": 100000 };
  if (o.tranche) {
    const niveau = o.garantie ?? "standard";
    const l = a(niveau === "luxe" ? /Garantie dommages Luxe/i : /Garantie dommages standard/i);
    if (k.vrai("devis", `ligne de garantie ${niveau} (valeur déclarée ${o.tranche})`, !!l, lignes.map((x) => x.label)))
      k.egal("devis", "montant de la garantie", Math.round(l!.amount * 100) / 100, Math.round(valeurs[o.tranche] * (niveau === "luxe" ? 0.008 : 0.005) * 100) / 100);
  } else k.vrai("devis", "pas de ligne de garantie sans valeur déclarée", !a(/Garantie/i), lignes.map((l) => l.label));
}

/* ───────────────────────── Créagidem ───────────────────────── */

export type FicheAdresse = { adresse1: string; adresse2: string; code_postal: string; ville: string; pays: string; est_rdc: number; etage: number; est_ascenseur: number; est_demande_stationnement: number; detail_acces: string; date_ou_periode: string };
export type Fiche = { client: { nom: string; prenom: string; email: string; tel_portable: string }; chargement: FicheAdresse; livraison: FicheAdresse; operation: { distance: string; valeur: string; type_assurance: string; detail: string } };

/** La fiche préparée (jamais envoyée) : son événement, son statut, son garde-fou. */
export async function ficheCreagidem(db: Base, k: Constats, id: string, derniere = false): Promise<Fiche | null> {
  let ev = await db.attendreEvenement(id, "creagidem", () => true, 90_000);
  if (derniere) ev = (await db.evenements(id)).filter((e) => e.type === "creagidem").at(-1)!;
  const p = ev.payload as { statut: string; environnement: string; motif: string | null; fiche: Fiche | null };
  k.egal("créagidem", "statut de la fiche", p.statut, "preparee");
  k.egal("créagidem", "environnement (garde-fou)", p.environnement, "batterie-locale");
  k.vrai("créagidem", "motif : préparée, jamais envoyée", /jamais envoyée/.test(p.motif ?? ""), p.motif);
  const toutes = (await db.evenements(id)).filter((e) => e.type === "creagidem");
  k.vrai("créagidem", "aucune fiche envoyée", toutes.every((e) => (e.payload as { statut: string }).statut !== "envoyee"), toutes.map((e) => (e.payload as { statut: string }).statut));
  return p.fiche;
}

export type AdresseAttendue = { ville: string; cp: string | null; pays: string; etage?: number | null; ascenseur?: boolean | null; stationnement?: boolean; adresse?: string | null; complement?: string | null; acces?: (string | RegExp)[] };

/** Une adresse de la fiche, champ par champ. */
export function verifierAdresseFiche(k: Constats, cote: "chargement" | "livraison", f: FicheAdresse, a: AdresseAttendue) {
  k.egal("créagidem", `${cote}.ville`, f.ville, a.ville);
  k.egal("créagidem", `${cote}.code_postal`, f.code_postal, a.cp ?? "");
  k.egal("créagidem", `${cote}.pays`, f.pays, a.pays);
  if (a.etage !== undefined) {
    k.egal("créagidem", `${cote}.etage`, f.etage, a.etage ?? 0);
    k.egal("créagidem", `${cote}.est_rdc`, f.est_rdc, a.etage === 0 ? 1 : 0);
  }
  if (a.ascenseur !== undefined) k.egal("créagidem", `${cote}.est_ascenseur`, f.est_ascenseur, a.ascenseur ? 1 : 0);
  if (a.stationnement !== undefined) k.egal("créagidem", `${cote}.est_demande_stationnement`, f.est_demande_stationnement, a.stationnement ? 1 : 0);
  if (a.adresse !== undefined) k.egal("créagidem", `${cote}.adresse1`, f.adresse1, a.adresse ?? "");
  if (a.complement !== undefined) k.egal("créagidem", `${cote}.adresse2`, f.adresse2, a.complement ?? "");
  for (const m of a.acces ?? []) k.contient("créagidem", `${cote}.detail_acces contient ${String(m)}`, f.detail_acces, m);
}

/**
 * Pas de distance automatique (choix fait après la première campagne, le
 * 18/11/2026 : « pas de prix du tout plutôt qu'un prix faux ») pour une ville
 * tapée hors de la liste — étrangère ou inconnue — ni de l'outre-mer vers un
 * autre territoire. Ce n'est pas un défaut à masquer : c'est le comportement
 * voulu, que la campagne vérifie (distance absente, détail qui le dit).
 */
export const sansDistanceAttendue = (a: RefVille, b: RefVille) => !estChoisie(a) || !estChoisie(b) || sansRoute(VILLES[a.cle], VILLES[b.cle]);

/**
 * La distance de la fiche : celle du formulaire quand il l'a calculée ;
 * sinon celle du serveur (vraie base d'adresses, vraie route), plausible au
 * regard du vol d'oiseau entre les vraies villes ; « 0.00 », et dit, quand le
 * trajet n'a pas de distance automatique.
 */
export function verifierDistanceFiche(k: Constats, fiche: Fiche, o: { attendue: number | null; depart: RefVille; arrivee: RefVille; colonne: number | null }) {
  const d = Number(fiche.operation.distance);
  if (o.attendue != null) {
    k.egal("créagidem", "operation.distance = distance du formulaire", d, o.attendue);
    return;
  }
  if (sansDistanceAttendue(o.depart, o.arrivee)) {
    k.egal("créagidem", `operation.distance non calculée (${nomVille(o.depart)} → ${nomVille(o.arrivee)} : étranger, ville introuvable ou outre-mer)`, d, 0);
    k.contient("créagidem", "operation.detail dit que la distance n'est pas calculée", fiche.operation.detail, "Distance : non calculée");
    return;
  }
  const a = coordVille(o.depart), b = coordVille(o.arrivee);
  if (!a || !b) return;
  const vo = volOiseauKm(a, b);
  k.vrai("créagidem", `operation.distance plausible (${nomVille(o.depart)} → ${nomVille(o.arrivee)}, vol d'oiseau ${Math.round(vo)} km)`, d > 0 && d >= vo * 0.9 && d <= vo * 2, d, `entre ${Math.round(vo * 0.9)} et ${Math.round(vo * 2)} km`);
}

/* ───────────────────────── Le CRM ───────────────────────── */

/** La demande ouverte dans le CRM, avec la session du compte « equipe » : elle s'ouvre sans erreur et montre l'essentiel. */
export async function verifierCrm(browser: Browser, k: Constats, n: number, id: string, o: { nom: string; email: string; tel?: string | null; trajet: string; volume?: number | null }) {
  const ctx = await browser.newContext({ storageState: fichierSession("equipe"), viewport: { width: 1440, height: 900 }, locale: "fr-FR", timezoneId: "Europe/Paris" });
  await ctx.route(/tile\.openstreetmap\.org\//, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX }));
  const page = await ctx.newPage();
  const s = surveiller(page);
  try {
    const rep = await page.goto(`${INT}/dashboard/${id}`, { timeout: 60_000 });
    k.vrai("crm", "la page de la demande répond", (rep?.status() ?? 0) < 400, rep?.status());
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const texte = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    k.egal("crm", "page d'erreur", await pageEnErreur(page), null);
    k.contient("crm", "nom du client", texte, o.nom);
    k.contient("crm", "e-mail du client", texte.toLowerCase(), o.email.toLowerCase());
    if (o.tel) k.contient("crm", "téléphone du client", texte, o.tel);
    k.contient("crm", "trajet", texte, o.trajet);
    if (o.volume != null) k.contient("crm", "volume", texte, `${o.volume} m³`);
    const bilan = s.bilan().filter((e) => !/tile\.openstreetmap|router\.project-osrm|nominatim/.test(e));
    k.vrai("crm", "ni erreur JavaScript, ni 5xx, ni erreur de console", bilan.length === 0, bilan);
    return await capturer(page, n, "crm");
  } finally {
    await ctx.close();
  }
}
