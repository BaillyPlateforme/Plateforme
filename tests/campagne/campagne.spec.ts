/*
 * La campagne : un test par ligne de scenarios.ts, comme un vrai visiteur —
 * de la page d'accueil (ou du cadre du site officiel) jusqu'à l'écran de fin
 * —, puis ce qui arrive derrière : la demande en recette, ses événements, son
 * devis, ses messages (jamais partis), sa fiche Créagidem (préparée, jamais
 * envoyée) et, pour une partie, sa page dans le CRM.
 *
 * Un écart ne coupe pas le scénario : il est noté (Constats) et compté en
 * échec doux, pour que le rapport les liste tous. Chaque scénario laisse son
 * relevé dans resultats/scenarios/NNN.json et ses captures dans captures/.
 */
import fs from "node:fs";
import path from "node:path";
import { devices, request as fabriqueRequetes, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { EXT, INT, SECRETS, emailUnique, fichierSession, surveiller } from "../outils/banc";
import { ETAT } from "../outils/config.mjs";
import {
  Base,
  CAPTURES,
  Constats,
  OFFICIEL,
  RESULTATS,
  analyserPhotos,
  attendreChiffrage,
  barre,
  bloc,
  bouton,
  cadre,
  capturer,
  champ,
  choisirQuand,
  choisirVille,
  cpVille,
  dateAttendue,
  debordement,
  devisDe,
  distanceAttendue,
  estChoisie,
  expect,
  ficheCreagidem,
  BORNE_HAUTE,
  lireEstimation,
  listerMeubles,
  nomVille,
  preparerVisiteur,
  repondre,
  saisirVolume,
  sansDistanceAttendue,
  servirHote,
  verifierAdresseFiche,
  verifierCadre,
  verifierCrm,
  verifierDateCreagidem,
  verifierDistanceFiche,
  verifierEnvois,
  verifierLignesDevis,
  coordVille,
  type AdresseAttendue,
  type Fiche,
  type Quand,
  type RefVille,
  type ReponseBan,
} from "./outils";
import { NOM_PARCOURS, SCENARIOS, type Completer, type Complet, type Erreur, type Express, type LieuComplet, type LieuFiche, type Mutation, type Pro, type Projet, type Scenario, type Transfert, type VolumeComplet } from "./scenarios";
import { VILLES, volOiseauKm, outreMer } from "./villes";

const { defaultBrowserType: _navigateur, ...PIXEL7 } = devices["Pixel 7"];
void _navigateur;

const pad = (n: number) => String(n).padStart(3, "0");
const TYPES_LOGEMENT: Record<string, number> = { Studio: 10, T1: 15, T2: 20, T3: 30, T4: 45, "T5+": 55, Maison: 60 };
const CATALOGUE: Record<string, number> = {
  "Carton standard": 0.1, "Carton livres": 0.06, "Canapé 2 places": 1, "Canapé 3 places": 1.5, "Canapé d'angle": 2.2, Fauteuil: 0.5, "Table basse": 0.4, "Meuble TV": 0.5, Télévision: 0.2, Bibliothèque: 0.9,
  "Lit simple": 0.9, "Lit double (+ matelas)": 1.5, "Armoire 2 portes": 1.2, "Armoire 3 portes": 1.8, Commode: 0.6, Bureau: 0.6, "Chaise de bureau": 0.3, Réfrigérateur: 0.7, "Lave-linge": 0.6,
  "Lave-vaisselle": 0.6, "Table à manger": 0.8, Chaise: 0.15, Vélo: 0.3, "Table de jardin": 0.6, "Piano droit": 1.2,
};
const MOBILIER_BUREAU: Record<string, number> = { Bureaux: 0.8, Caissons: 0.15, "Chaises et fauteuils": 0.3, Armoires: 1.2, "Tables de réunion": 0.8, "Photocopieurs et imprimantes": 1, "Postes informatiques": 0.15, "Cartons d'archives": 0.06 };
const ANNEXES: Record<string, { cle: string; volume: number }> = { Cave: { cle: "cave", volume: 3 }, Garage: { cle: "garage", volume: 6 }, "Grenier ou combles": { cle: "grenier", volume: 5 }, "Jardin, terrasse ou balcon": { cle: "exterieur", volume: 3 } };
const r2 = (x: number) => Math.round(x * 100) / 100;
const sommeListe = (l: [string, number][], table = CATALOGUE) => r2(l.reduce((s, [label, n]) => s + n * table[label], 0));
const fr = (v: number) => v.toLocaleString("fr-FR");
const FORMULE_NOM: Record<string, string> = { eco: "Économique", standard: "Standard", luxe: "Luxe" };

/* ───────────────────────── Le relevé d'un scénario ───────────────────────── */

type Etat = {
  s: Scenario;
  k: Constats;
  captures: string[];
  journalBan: ReponseBan[];
  demande?: string;
  reference?: string | null;
  estimation?: number | null;
  distance?: number | null;
  volume?: number | null;
  fiche?: Fiche | null;
  debut: number;
};
let etat: Etat | null = null;

/** Le visiteur : sa page, la racine où chercher (la page, ou le corps du cadre), et de quoi vérifier. */
type X = { page: Page; context: BrowserContext; browser: Browser; R: Locator; s: Scenario; k: Constats; db: Base; email: string; mobile: boolean; cadre: boolean; e: Etat; bilan: () => string[] };

/** Ouvre le site — directement, ou dans la page du site officiel qui l'affiche en cadre. */
async function ouvrir(x: X, chemin = "/") {
  if (x.cadre) {
    await x.page.goto(OFFICIEL);
    await expect(cadre(x.page)).toHaveAttribute("src", `${EXT}/?integre=1`);
    x.R = x.page.frameLocator("[data-bailly-devis] iframe").locator("body");
    await expect(x.R.getByRole("button", { name: /Je suis un particulier/ })).toBeVisible({ timeout: 45_000 });
    await verifierCadre(x.page, x.k, "les trois portes");
  } else {
    await x.page.goto(EXT + chemin);
    x.R = x.page.locator("body");
  }
}

async function porte(x: X, p: "express" | "complet" | "mutation" | "transfert" | "projet") {
  const R = x.R;
  if (p === "mutation") await R.getByRole("button", { name: /Je suis muté\(e\)/ }).click();
  else if (p === "express" || p === "complet") {
    await R.getByRole("button", { name: /Je suis un particulier/ }).click();
    await R.getByRole("button", { name: p === "express" ? /Commencer le devis express/ : /Commencer le devis complet/ }).click();
  } else {
    await R.getByRole("button", { name: /Je déménage mon entreprise/ }).click();
    await R.getByRole("button", { name: p === "transfert" ? /Décrire mon transfert/ : /Présenter mon projet/ }).click();
  }
}

/** Ce qui se vérifie à chaque étape : le cadre (hauteur, défilement, retour en haut), la largeur au téléphone. */
async function etape(x: X, nom: string, retourHaut = true) {
  if (x.cadre) await verifierCadre(x.page, x.k, nom, retourHaut);
  if (x.mobile) {
    const d = await debordement(x.page);
    if (!x.k.vrai("écran", `${nom} : pas de défilement horizontal au téléphone`, d <= 0, `${d} px`)) x.k.dernier(await capturer(x.page, x.s.n, `debord-${nom.replace(/\W+/g, "-")}`));
  }
}

async function continuer(x: X, suivante: RegExp, nom: string) {
  await expect(bouton(x.R, "Continuer")).toBeEnabled();
  await bouton(x.R, "Continuer").click();
  await expect(x.R.getByRole("heading", { name: suivante }).first()).toBeVisible();
  await etape(x, nom);
}

/** La page a-t-elle tenu ? Ni erreur JS, ni 5xx, ni erreur de console. */
function pagePropre(x: X, ignorer: RegExp[] = []) {
  const b = x.bilan().filter((e) => !ignorer.some((r) => r.test(e)));
  x.k.vrai("écran", "ni erreur JavaScript, ni réponse 5xx, ni erreur de console", b.length === 0, b);
}

/** L'écran de fin des parcours sans prix : « Demande envoyée », et la référence de la demande. */
async function referenceAffichee(x: X): Promise<string> {
  await expect(x.R.getByRole("heading", { name: "Demande envoyée" })).toBeVisible({ timeout: 60_000 });
  const ref = (await x.R.getByText(/^Référence/).innerText()).replace(/^Référence\s*/, "").trim();
  x.k.vrai("écran", "référence à 8 caractères sur l'écran de fin", /^[0-9a-f]{8}$/.test(ref), ref);
  x.k.vrai("écran", "aucun prix sur l'écran de fin (parcours sans prix)", (await x.R.getByText(/Total estimé|TTC/).count()) === 0);
  return ref;
}

/* ───────────────────────── Les vérifications communes ───────────────────────── */

type Attendu = Record<string, unknown>;
function colonnes(x: X, r: Record<string, unknown>, a: Attendu) {
  for (const [cle, v] of Object.entries(a)) {
    let obtenu = r[cle];
    if (obtenu instanceof Date) obtenu = obtenu.toISOString().slice(0, 10);
    if (cle === "date_souhaitee" && obtenu) obtenu = String(obtenu).slice(0, 10);
    x.k.egal("base", `requests.${cle}`, obtenu, v);
  }
}
const chemin = (o: unknown, p: string) => p.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);
function brut(x: X, r: Record<string, unknown>, a: Attendu) {
  for (const [p, v] of Object.entries(a)) x.k.egal("base", `raw_payload.${p}`, chemin(r.raw_payload, p), v);
}

/** La date de la demande, lue en texte (la colonne est une date, le fuseau ne doit pas la décaler). */
async function dateDe(x: X, id: string) {
  return (await x.db.q<{ d: string | null }>("select date_souhaitee::text as d from public.requests where id = $1", [id]))[0].d;
}

async function evenementsDe(x: X, id: string) {
  return (await x.db.evenements(id)).map((e) => e.type);
}

/** Le chiffrage d'une demande particulière : analyse, devis brouillon numéroté, même montant partout. */
async function chiffrage(x: X, id: string, affiche: { total: number | null; repli: boolean }, o: { distanceConnue: boolean; piano?: boolean; charges?: number; tranche?: Complet["valeur"] | null; garantie?: "standard" | "luxe" | null }) {
  const { r, devis } = await attendreChiffrage(x.db, id);
  x.e.distance = r.distance_km == null ? null : Number(r.distance_km);
  if (!o.distanceConnue && r.distance_km == null) {
    const types = await evenementsDe(x, id);
    x.k.vrai("base", "distance introuvable : l'événement « distance_inconnue » est inscrit", types.includes("distance_inconnue"), types);
    x.k.egal("devis", "pas de devis sans distance", devis.length, 0);
    x.k.vrai("écran", "sans distance : l'écran se replie sans montant", affiche.repli, affiche);
    return null;
  }
  x.k.egal("base", "requests.status (qualifiée)", r.status, "qualified");
  if (!x.k.egal("devis", "un devis brouillon", devis.length, 1)) return null;
  const d = devis[0];
  x.e.reference = d.reference;
  x.e.estimation = Number(r.estimation_prix);
  x.k.egal("devis", "statut du devis", d.status, "brouillon");
  x.k.vrai("devis", "référence DEV-AAAA-NNNN de l'année", new RegExp(`^DEV-${new Date().getFullYear()}-\\d{4,}$`).test(d.reference), d.reference);
  x.k.egal("devis", "montant du devis = estimation de la demande", Number(d.montant_ttc), Number(r.estimation_prix));
  if (affiche.total != null) x.k.egal("écran", "montant affiché = estimation en base", affiche.total, Math.round(Number(r.estimation_prix)));
  else x.k.note("écran replié sans montant (chiffrage plus lent que la patience de l'écran, ou sans distance)");
  verifierLignesDevis(x.k, d.lignes ?? [], { piano: o.piano, charges: o.charges, tranche: o.tranche ?? null, garantie: o.garantie ?? null });
  return d;
}

/** La fiche Créagidem : identité et contact, puis ce que chaque parcours y ajoute. */
async function fiche(x: X, id: string, o: { derniere?: boolean; nom: string; prenom: string; tel?: string | null; chargement: AdresseAttendue; livraison: AdresseAttendue; quand: Quand | undefined; parDefaut?: string; valeur?: number; distance: { attendue: number | null; depart: RefVille; arrivee: RefVille; colonne: number | null }; detail: (string | RegExp)[]; sansDetail?: (string | RegExp)[] }) {
  const f = await ficheCreagidem(x.db, x.k, id, o.derniere);
  x.e.fiche = f;
  if (!x.k.vrai("créagidem", "la fiche est préparée", !!f)) return;
  x.k.egal("créagidem", "client.nom", f!.client.nom, o.nom);
  x.k.egal("créagidem", "client.prenom", f!.client.prenom, o.prenom);
  x.k.egal("créagidem", "client.email", f!.client.email.toLowerCase(), x.email.toLowerCase());
  x.k.egal("créagidem", "client.tel_portable", f!.client.tel_portable, o.tel ?? "");
  verifierAdresseFiche(x.k, "chargement", f!.chargement, o.chargement);
  verifierAdresseFiche(x.k, "livraison", f!.livraison, o.livraison);
  verifierDateCreagidem(x.k, f!.chargement.date_ou_periode, o.quand, o.parDefaut);
  x.k.egal("créagidem", "livraison.date_ou_periode = chargement", f!.livraison.date_ou_periode, f!.chargement.date_ou_periode);
  x.k.egal("créagidem", "operation.valeur (borne haute de la tranche)", Number(f!.operation.valeur), o.valeur ?? 0);
  x.k.egal("créagidem", "operation.type_assurance", f!.operation.type_assurance, "D");
  verifierDistanceFiche(x.k, f!, o.distance);
  for (const m of o.detail) x.k.contient("créagidem", `operation.detail contient ${String(m)}`, f!.operation.detail, m);
  for (const m of o.sansDetail ?? []) x.k.vrai("créagidem", `operation.detail ne contient pas ${String(m)}`, !(typeof m === "string" ? f!.operation.detail.includes(m) : m.test(f!.operation.detail)), f!.operation.detail);
}

/**
 * La distance du formulaire : exacte entre deux villes de la table ; aucune
 * pour une ville étrangère ou inconnue, ni de l'outre-mer vers un autre
 * territoire (choix du 18/11/2026) ; plausible sinon.
 */
function distanceFormulaire(x: X, r: Record<string, unknown>, depart: RefVille, arrivee: RefVille) {
  const attendue = distanceAttendue(depart, arrivee);
  const d = r.distance_km == null ? null : Number(r.distance_km);
  x.e.distance = d;
  if (attendue != null) return x.k.egal("base", "requests.distance_km (calculée par le formulaire)", d, attendue);
  if (sansDistanceAttendue(depart, arrivee))
    return x.k.egal("base", `pas de distance automatique pour ${nomVille(depart)} → ${nomVille(arrivee)} (étranger, ville introuvable ou outre-mer)`, d, null);
  const a = coordVille(depart), b = coordVille(arrivee);
  if (!a || !b || d == null) return;
  const vo = volOiseauKm(a, b);
  x.k.vrai("base", `distance plausible pour ${nomVille(depart)} → ${nomVille(arrivee)} (vol d'oiseau ${Math.round(vo)} km)`, d >= vo * 0.9 && d <= vo * 2, `${d} km`, `entre ${Math.round(vo * 0.9)} et ${Math.round(vo * 2)} km`);
}

/** Outre-mer : une estimation automatique bâtie sur une distance routière n'a pas de sens (traversée maritime). */
function outreMerSansPrixRoutier(x: X, depart: RefVille, arrivee: RefVille, affiche: { total: number | null }) {
  if (!estChoisie(depart) || !estChoisie(arrivee)) return; // l'étranger a sa propre vérification
  const a = coordVille(depart), b = coordVille(arrivee);
  if (!a || !b || !((outreMer(a) || outreMer(b)) && volOiseauKm(a, b) > 300)) return;
  x.k.vrai("écran", `outre-mer (${nomVille(depart)} → ${nomVille(arrivee)}) : pas d'estimation automatique fondée sur une distance routière`, affiche.total == null, affiche.total != null ? `${affiche.total} € affichés pour ${x.e.distance} km` : null);
}

const paysAttendu = (r: RefVille, pays?: string) => pays ?? (estChoisie(r) ? "France" : "");
/** Le code postal attendu dans Créagidem : ses chiffres (format de Créagidem) ; un code étranger qui porte des lettres (SW1A 1AA, H2X 1Y4) doit rester entier — réduit à ses chiffres, il devient un autre code. */
const chiffres = (cp: string | null | undefined) => (/[A-Za-z]/.test(cp ?? "") ? cp! : (cp ?? "").replace(/\D/g, ""));

/* ───────────────────────── Particulier · devis express ───────────────────────── */

function volumeExpress(s: Express, photos: number | null): number | null {
  if ("saisi" in s.volume) return s.volume.saisi;
  if ("logement" in s.volume) return TYPES_LOGEMENT[s.volume.logement];
  return photos;
}

async function remplirExpress(x: X, s: Express) {
  const R = x.R;
  await champ(R, "Nom").fill(s.nom);
  await champ(R, "E-mail").fill(x.email);
  if (s.tel) await champ(R, "Téléphone").fill(s.tel);
  await choisirVille(x.page, R.getByLabel("Ville de départ"), s.depart);
  await choisirVille(x.page, R.getByLabel("Ville d'arrivée"), s.arrivee);
  const km = distanceAttendue(s.depart, s.arrivee);
  if (km != null) await expect(R.getByText(`${km} km`).filter({ visible: true }).first()).toBeVisible();
  if (s.quand) await choisirQuand(R, s.quand);
  let photos: number | null = null;
  if ("saisi" in s.volume) await saisirVolume(R, s.volume.saisi);
  else if ("logement" in s.volume) {
    await bouton(R, /Je décris mon logement/).click();
    await R.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: new RegExp(`^${s.volume.logement.replace("+", "\\+")}\\b`) }).click();
  } else photos = await analyserPhotos(x.page, R, s.volume.photos);
  let v = volumeExpress(s, photos);
  if (photos != null) {
    // Le total des photos s'affiche arrondi au dixième ; la barre du bas porte le volume retenu.
    await expect(barre(R)).toContainText("m³ à déménager");
    v = Number((await barre(R).innerText()).match(/([\d.]+) m³ à déménager/)?.[1]);
    x.k.vrai("écran", "photos : le volume retenu est le total affiché", Math.abs(v - photos) < 0.06, { barre: v, total: photos });
  } else await expect(barre(R)).toContainText(`${v} m³ à déménager`);
  return v;
}

async function parcoursExpress(x: X, s: Express) {
  await ouvrir(x);
  await porte(x, "express");
  await expect(x.R.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();
  await etape(x, "devis express");
  const v = await remplirExpress(x, s);
  x.e.volume = v;
  await etape(x, "devis express rempli", false);
  await bouton(x.R, "Obtenir mon estimation").click();
  await expect(x.R.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 90_000 });
  await etape(x, "estimation");
  const affiche = await lireEstimation(x.R);
  x.e.captures.push(await capturer(x.page, s.n, "fin"));

  const r = await x.db.demande(x.email);
  x.e.demande = r.id;
  const dates = dateAttendue(s.quand);
  colonnes(x, r, {
    source: "form", client_nom: s.nom, client_tel: s.tel ?? null,
    depart_ville: nomVille(s.depart), depart_code_postal: cpVille(s.depart),
    arrivee_ville: nomVille(s.arrivee), arrivee_code_postal: cpVille(s.arrivee),
    flexibilite: dates.flexibilite, volume_m3: v, volume_method: "photos" in s.volume ? "ai" : "explicit", completion_token: null,
  });
  x.k.egal("base", "requests.date_souhaitee", await dateDe(x, r.id), dates.date_souhaitee);
  brut(x, r, { type_client: "particulier", "details.express": true, ...("logement" in s.volume ? { "details.repere_logement.type": s.volume.logement } : {}) });
  distanceFormulaire(x, r, s.depart, s.arrivee);
  if ("photos" in s.volume) {
    const ph = await x.db.q<{ storage_path: string; volume_m3: string; ai_analysis: { objets?: unknown[] } }>("select storage_path, volume_m3, ai_analysis from public.request_photos where request_id = $1", [r.id]);
    x.k.egal("base", "request_photos : une ligne par photo analysée", ph.length, s.volume.photos.length);
    x.k.vrai("base", "request_photos : l'inventaire de l'analyse est gardé", ph.every((p) => (p.ai_analysis?.objets ?? []).length > 0), ph.map((p) => p.ai_analysis));
  }
  const types = await evenementsDe(x, r.id);
  for (const t of ["created", "jeton_modification"]) x.k.vrai("base", `événement « ${t} »`, types.includes(t), types);
  x.k.vrai("base", "pas d'événement « incomplete »", !types.includes("incomplete"), types);

  const connue = distanceAttendue(s.depart, s.arrivee) != null;
  const d = await chiffrage(x, r.id, affiche, { distanceConnue: connue });
  if (d && affiche.total != null) {
    await expect(x.R.getByText(`${r.depart_ville} → ${r.arrivee_ville}`, { exact: true }).first()).toBeVisible();
    if (v != null) x.k.vrai("écran", `le volume (~${v} m³) est rappelé`, (await x.R.getByText(`~${v} m³`).count()) > 0);
  }
  outreMerSansPrixRoutier(x, s.depart, s.arrivee, affiche);

  await fiche(x, r.id, {
    nom: s.nom, prenom: "", tel: s.tel,
    chargement: { ville: nomVille(s.depart), cp: chiffres(cpVille(s.depart)), pays: paysAttendu(s.depart) },
    livraison: { ville: nomVille(s.arrivee), cp: chiffres(cpVille(s.arrivee)), pays: paysAttendu(s.arrivee) },
    quand: s.quand, distance: { attendue: distanceAttendue(s.depart, s.arrivee), depart: s.depart, arrivee: s.arrivee, colonne: x.e.distance ?? null },
    detail: ["Demande du site Bailly (particulier, devis express)", ...(v != null ? [`Volume : ${fr(v)} m³${"photos" in s.volume ? " (estimé sur photos)" : ""}`] : [])],
  });
  await verifierEnvois(x.db, x.k, { id: r.id, email: x.email, tel: s.tel, source: "form", evenements: ["demande_recue", "demande_complete", ...(d ? ["devis_cree"] : [])] });

  if (s.rappel === "bouton") {
    await x.R.getByRole("button", { name: "Je souhaite être rappelé" }).click();
    await expect(x.R.getByRole("status")).toContainText("C'est bien noté");
    const rap = await x.db.attendreEvenement(r.id, "rappel");
    x.k.egal("base", "rappel : statut", rap.payload.statut, "a_rappeler");
    x.k.egal("base", "rappel : devis de la demande", rap.payload.devis_id ?? null, d?.id ?? null);
  } else if (s.rappel === "lien") {
    const p2 = await x.context.newPage();
    const s2 = surveiller(p2);
    await p2.goto(`${EXT}/rappel/${r.id}`);
    await expect(p2.getByRole("status")).toHaveText(/C.est bien noté/);
    x.e.captures.push(await capturer(p2, s.n, "rappel"));
    await p2.reload();
    await expect(p2.getByRole("status")).toHaveText(/C.est bien noté/);
    await x.db.attendreEvenement(r.id, "rappel");
    x.k.egal("base", "rappel inscrit une seule fois (lien recliqué)", (await x.db.evenements(r.id)).filter((e) => e.type === "rappel").length, 1);
    x.k.vrai("écran", "page /rappel sans erreur", s2.bilan().length === 0, s2.bilan());
    await p2.close();
  }

  if (s.modifier) {
    await x.R.getByRole("button", { name: "Modifier ma demande" }).first().click();
    await expect(champ(x.R, "Nom")).toHaveValue(s.nom);
    await saisirVolume(x.R, s.modifier.volume);
    await choisirVille(x.page, x.R.getByLabel("Ville d'arrivée"), s.modifier.arrivee);
    await bouton(x.R, "Mettre à jour mon estimation").click();
    await expect(x.R.getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 90_000 });
    const apres = await lireEstimation(x.R);
    await expect.poll(async () => Number((await x.db.demandes(x.email))[0].volume_m3), { timeout: 60_000 }).toBe(s.modifier.volume);
    const lignes = await x.db.demandes(x.email);
    x.k.egal("base", "modification : toujours une seule demande", lignes.length, 1);
    colonnes(x, lignes[0], { arrivee_ville: nomVille(s.modifier.arrivee), arrivee_code_postal: cpVille(s.modifier.arrivee), distance_km: distanceAttendue(s.depart, s.modifier.arrivee) });
    const modif = await x.db.attendreEvenement(r.id, "modified");
    x.k.egal("base", "modification : par le client", modif.payload.par, "client");
    await expect.poll(async () => (await x.db.evenements(r.id)).filter((e) => e.type === "analysis").length, { timeout: 90_000 }).toBe(2);
    await expect.poll(async () => (await devisDe(x.db, r.id)).length, { timeout: 30_000 }).toBe(1);
    const dv = await devisDe(x.db, r.id);
    x.k.vrai("devis", "modification : le devis brouillon est refait", dv[0].reference !== x.e.reference || dv[0].id !== d?.id, dv.map((z) => z.reference));
    const [rm] = await x.db.q("select estimation_prix from public.requests where id = $1", [r.id]);
    if (apres.total != null) x.k.egal("écran", "modification : nouveau montant affiché = estimation", apres.total, Math.round(Number(rm.estimation_prix)));
    const fiches = (await x.db.evenements(r.id)).filter((e) => e.type === "creagidem");
    x.k.vrai("créagidem", "modification : une nouvelle fiche préparée, aucune envoyée", fiches.length >= 2 && fiches.every((f) => (f.payload as { statut: string }).statut === "preparee"), fiches.map((f) => (f.payload as { statut: string }).statut));
    x.e.reference = dv[0].reference;
    x.e.captures.push(await capturer(x.page, s.n, "modifiee"));
  }
  pagePropre(x);
  const [rc] = await x.db.q("select * from public.requests where id = $1", [r.id]);
  if (s.crm) x.e.captures.push(await verifierCrm(x.browser, x.k, s.n, r.id, { nom: rc.client_nom, email: x.email, tel: s.tel, trajet: `${rc.depart_ville} → ${rc.arrivee_ville}`, volume: Number(rc.volume_m3) }));
}

/* ───────────────────────── Particulier · devis complet (et espace pro) ───────────────────────── */

async function remplirLieu(x: X, l: LieuComplet, cote: "depart" | "arrivee") {
  const R = x.R;
  const champAdresse = R.getByLabel(cote === "depart" ? "Adresse de départ" : "Adresse d'arrivée");
  if (l.pays && l.pays !== "France") await R.getByLabel("Pays").selectOption(l.pays);
  if (l.adresse) {
    await champAdresse.fill(l.adresse);
    if (l.adresseListe && estChoisie(l.ville)) {
      await champAdresse.locator("xpath=..").getByRole("listbox").getByRole("button").first().click();
      await expect(R.getByLabel(/^Ville/)).toHaveValue(VILLES[l.ville.cle].nom);
    }
  }
  if (l.complement) await R.getByLabel(/^Complément d'adresse/).fill(l.complement);
  if (l.cp && !estChoisie(l.ville)) await R.getByLabel("Code postal").fill(l.cp);
  if (!l.adresseListe) await choisirVille(x.page, R.getByLabel(/^Ville/), l.ville);
  if (estChoisie(l.ville)) await expect(R.getByLabel("Code postal")).toHaveValue(VILLES[l.ville.cle].cp);
  if (l.region) await R.getByLabel("État / Province / Région").fill(l.region);
  if (l.etage != null) await R.getByLabel(/^Étage/).fill(String(l.etage));
  if (l.logement) {
    await bouton(R, "Je ne connais pas la surface").click();
    await R.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: l.logement, exact: true }).click();
  } else if (l.surface != null) await R.getByLabel(/^Surface habitable/).fill(String(l.surface));
  if (l.ascenseur != null) await repondre(R, "Ascenseur ?", l.ascenseur ? "Oui" : "Non");
  if (l.ascenseur && l.tailleAscenseur) await R.getByLabel(/^Taille de l'ascenseur/).fill(String(l.tailleAscenseur));
  if (l.ascenseur && l.passageAscenseur != null) await repondre(R, "Vos meubles passent-ils par l'ascenseur ?", l.passageAscenseur ? "Oui" : "Non");
  if (l.escalier != null) await repondre(R, "Vos meubles passent-ils par l'escalier ?", l.escalier ? "Oui" : "Non");
  if (l.duplex != null) await repondre(R, "Duplex ?", l.duplex ? "Oui" : "Non");
  if (l.portage) await R.getByLabel(/^Distance entre le stationnement/).fill(String(l.portage));
  if (l.difficulte) {
    await repondre(R, "Difficultés d'accès en camion poids lourd ?", "Oui");
    await R.getByLabel("Type de difficulté d'accès").fill(l.difficulte);
  }
  if (l.stationnement != null) await repondre(R, "Autorisation de stationnement nécessaire ?", l.stationnement ? "Oui" : "Non");
}

/** Le volume de l'étape « Inventaire » ; rend le volume attendu et sa méthode. */
async function remplirVolume(x: X, v: VolumeComplet, depart: LieuComplet): Promise<{ volume: number; methode: string; libelle: string }> {
  const R = x.R;
  if ("saisi" in v) {
    await saisirVolume(R, v.saisi);
    return { volume: v.saisi, methode: "explicit", libelle: "volume saisi" };
  }
  if ("liste" in v) {
    await listerMeubles(R, v.liste);
    return { volume: sommeListe(v.liste), methode: "list", libelle: "liste de meubles" };
  }
  if ("photos" in v) return { volume: await analyserPhotos(x.page, R, v.photos), methode: "ai", libelle: "analyse de photos" };
  const l = v.logement;
  await bouton(R, /Je décris mon logement/).click();
  const groupe = R.getByRole("group", { name: "Votre type de logement" });
  if (l.type && (await groupe.getByRole("button", { name: l.type, exact: true }).getAttribute("aria-pressed")) !== "true") await groupe.getByRole("button", { name: l.type, exact: true }).click();
  if (l.surface != null) await R.getByLabel(/^Surface habitable/).fill(String(l.surface));
  if (l.ameublement) await R.getByRole("radio", { name: l.ameublement }).click();
  for (const a of l.annexes ?? []) await R.getByRole("button", { name: a, exact: true }).click();
  // La description reprend la surface du départ quand elle est connue (le client la voit déjà remplie).
  const surface = l.surface ?? (depart.logement ? 0 : depart.surface ?? 0);
  const coef = l.ameublement === "Peu meublé" ? 0.8 : l.ameublement === "Très meublé" ? 1.25 : 1;
  const base = surface > 0 ? surface * 0.5 : TYPES_LOGEMENT[l.type ?? depart.logement ?? ""];
  const volume = Math.round(base * coef + (l.annexes ?? []).reduce((s, a) => s + ANNEXES[a].volume, 0));
  return { volume, methode: "explicit", libelle: "d'après votre logement" };
}

/** Ce que la demande et la fiche doivent dire d'une adresse du devis complet. */
function attenduLieu(l: LieuComplet) {
  const v = estChoisie(l.ville) ? VILLES[l.ville.cle] : null;
  const adresse = l.adresseListe && v ? `${l.adresse!.replace(new RegExp(`\\s*${v.nom}$`), "")} ${v.cp} ${v.nom}` : (l.adresse ?? null);
  return { ville: nomVille(l.ville), cp: v?.cp ?? l.cp ?? null, adresse, etage: l.etage ?? 0, ascenseur: l.ascenseur ?? false, logement: l.logement ?? null, pays: l.pays ?? "France" };
}

async function parcoursComplet(x: X, s: Complet | Pro) {
  const R = () => x.R;
  const pro = s.parcours === "pro";
  const c = s as Complet;
  if (pro) {
    const esp = await espacePro((s as Pro).slug);
    test.skip(!esp, `espace « ${(s as Pro).slug} » absent en recette`);
    await ouvrir(x, `/pro/${esp!.code}/${esp!.slug}`);
    await bouton(R(), "Commencer ma demande").click();
  } else {
    await ouvrir(x);
    await porte(x, "complet");
  }
  // 1. Vous
  await expect(R().getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await etape(x, "vous");
  if (pro) x.k.vrai("écran", "espace pro : la question « particulier / entreprise » est retirée", (await R().getByRole("radio", { name: "Entreprise" }).count()) === 0);
  if (c.entreprise) {
    await R().getByRole("radio", { name: "Entreprise" }).click();
    await champ(R(), "Raison sociale").fill(c.entreprise);
    // Libellés suivis de « facultatif » pour une entreprise.
    if (c.prenom) await R().getByLabel(/^Interlocuteur/).fill(c.prenom);
    if (c.nom) await R().getByLabel(/^Nom de l'interlocuteur/).fill(c.nom);
  } else {
    if (s.prenom) await champ(R(), "Prénom").fill(s.prenom);
    if (s.nom) await champ(R(), "Nom").fill(s.nom);
  }
  await champ(R(), "Téléphone").fill(s.tel);
  await champ(R(), "E-mail").fill(x.email);
  if (c.demenagement) await repondre(R(), "Déménagement complet ou partiel ?", c.demenagement);
  if (c.mutation) {
    await repondre(R(), "S'agit-il d'une mutation professionnelle ?", "Oui");
    await R().getByLabel("De quelle société s'agit-il ?").fill(c.mutation);
  }
  if (s.quand) await choisirQuand(R(), s.quand);
  if (c.valeur) await R().getByRole("button", { name: c.valeur, exact: true }).click();
  if (c.garantie) await bouton(R(), c.garantie === "luxe" ? /Garantie dommages Luxe/ : /Garantie dommages standard/).click();
  if (c.lourds?.length) {
    await repondre(R(), "Avez-vous des objets de 80 à 150 kg ?", "Oui");
    for (const [i, o] of c.lourds.entries()) {
      if (i > 0) await bouton(R(), "Ajouter un objet").click();
      await R().getByLabel("Objet", { exact: true }).nth(i).fill(o.label);
      if (o.poids) await R().getByLabel("Poids", { exact: true }).nth(i).fill(o.poids);
    }
  }
  if (c.piano != null) await repondre(R(), "Avez-vous un piano ?", c.piano ? "Oui" : "Non");
  await continuer(x, /D'où partez-vous/, "départ");
  // 2. Départ
  await remplirLieu(x, s.depart, "depart");
  await continuer(x, /Où allez-vous/, "arrivée");
  // Le bouton « Retour » du navigateur : l'étape précédente revient, saisie intacte, et l'on repart.
  if (c.retour) {
    await x.page.goBack();
    await expect(R().getByRole("heading", { name: /D'où partez-vous/ })).toBeVisible();
    const av = attenduLieu(s.depart);
    x.k.egal("écran", "retour du navigateur : la ville de départ est gardée", await R().getByLabel(/^Ville/).inputValue(), av.ville);
    x.k.egal("écran", "retour du navigateur : l'étage est gardé", await R().getByLabel(/^Étage/).inputValue(), String(s.depart.etage ?? 0));
    if (s.depart.surface != null) x.k.egal("écran", "retour du navigateur : la surface est gardée", await R().getByLabel(/^Surface habitable/).inputValue(), String(s.depart.surface));
    x.e.captures.push(await capturer(x.page, s.n, "retour-navigateur"));
    await x.page.goForward();
    await expect(R().getByRole("heading", { name: /Où allez-vous/ })).toBeVisible();
  }
  // 3. Arrivée
  await remplirLieu(x, s.arrivee, "arrivee");
  await expect(bouton(R(), "Continuer")).toBeEnabled();
  await bouton(R(), "Continuer").click();
  // 4. Prestations (absente d'un espace à formule imposée), 5. Démontage, 6. Inventaire.
  const formule = R().getByRole("radiogroup", { name: "Formule de déménagement" });
  await expect(formule.or(R().getByRole("heading", { name: /Vos meubles à démonter|Quel volume/ }).first()).first()).toBeVisible();
  if (await formule.isVisible()) {
    await etape(x, "prestations");
    if (c.formule === "transport") await bouton(R(), /Transport de meubles uniquement/).click();
    // À l'écran, la formule « luxe » s'appelle « Premium ».
    else if (c.formule) await formule.getByRole("radio", { name: new RegExp(`^${{ eco: "Économique", standard: "Standard", luxe: "Premium" }[c.formule]}`) }).click();
    else await expect(barre(R())).toContainText("la formule Standard sera retenue");
    await continuer(x, /Vos meubles à démonter/, "démontage");
  }
  if (await R().getByRole("heading", { name: /Vos meubles à démonter/ }).isVisible()) {
    const titres = { ikea: /Meubles type IKEA/, anciens: /Meubles anciens/, specifiques: /Meubles spécifiques/ } as const;
    for (const [cle, d] of Object.entries(c.demontage ?? {}) as [keyof typeof titres, { choix: string; precision?: string }][]) {
      const b = bloc(R(), titres[cle]);
      await b.getByRole("button", { name: d.choix === "possible" ? /Démontage possible/ : /Démontage impératif/ }).click();
      if (d.precision) await b.getByLabel(/^Précisions/).fill(d.precision);
    }
    await continuer(x, /Quel volume à déménager/, "inventaire");
  }
  const vol = await remplirVolume(x, s.volume, s.depart);
  x.e.volume = vol.volume;
  await continuer(x, /Un dernier mot/, "relecture");
  // 7. Relecture et envoi
  const nomComplet = [s.prenom, s.nom].filter(Boolean).join(" ") || c.entreprise!;
  await expect(R().getByRole("main").getByText(nomComplet).first()).toBeVisible();
  if (vol.methode === "ai") {
    const t = (await R().getByText(/m³ \(analyse de photos\)/).first().innerText()).match(/([\d.]+) m³/)?.[1];
    x.k.vrai("écran", "photos : le volume relu est le total affiché", Math.abs(Number(t) - vol.volume) < 0.06, { relecture: t, total: vol.volume });
    vol.volume = Number(t);
  }
  const montreVolume = pro ? (await espacePro((s as Pro).slug))!.afficher_volume !== false : true;
  const relu = montreVolume ? `${vol.volume} m³ (${vol.libelle})` : `transmis (${vol.libelle})`;
  x.k.vrai("écran", `relecture : « ${relu} »`, (await R().getByText(relu).count()) > 0);
  if (s.commentaire) await R().getByLabel(/^Message/).fill(s.commentaire);
  x.e.captures.push(await capturer(x.page, s.n, "relecture"));
  await bouton(R(), "Envoyer ma demande").click();
  const prix = pro ? (await espacePro((s as Pro).slug))!.afficher_estimation : true;
  let affiche: { total: number | null; repli: boolean } = { total: null, repli: true };
  if (prix) {
    await expect(R().getByRole("heading", { name: /Votre estimation est prête/ })).toBeVisible({ timeout: 90_000 });
    affiche = await lireEstimation(R());
  } else await referenceAffichee(x);
  await etape(x, "fin");
  x.e.captures.push(await capturer(x.page, s.n, "fin"));

  // La demande en base.
  const r = await x.db.demande(x.email);
  x.e.demande = r.id;
  const dep = attenduLieu(s.depart), arr = attenduLieu(s.arrivee);
  const dates = dateAttendue(s.quand);
  const formuleAttendue = pro ? "standard" : c.formule === "transport" ? null : (c.formule ?? "standard");
  colonnes(x, r, {
    source: "form", client_nom: nomComplet, client_tel: s.tel,
    depart_adresse: dep.adresse, depart_code_postal: dep.cp, depart_ville: dep.ville, depart_etage: dep.etage, depart_ascenseur: dep.ascenseur, type_logement_depart: dep.logement,
    arrivee_adresse: arr.adresse, arrivee_code_postal: arr.cp, arrivee_ville: arr.ville, arrivee_etage: arr.etage, arrivee_ascenseur: arr.ascenseur, type_logement_arrivee: arr.logement,
    flexibilite: dates.flexibilite, volume_m3: vol.volume, volume_method: vol.methode,
    ...(formuleAttendue ? { formule: formuleAttendue } : {}),
  });
  x.k.egal("base", "requests.date_souhaitee", await dateDe(x, r.id), dates.date_souhaitee);
  if (c.formule === "transport") {
    x.k.egal("base", "transport seul : aucun service (emballage, démontage, remontage)", r.services, { emballage: false, demontage: false, montage: false, monte_meuble: false, garde_meuble: false });
    // Choix du 18/11/2026 : la colonne garde la grille appliquée (l'Économique, faute de tableau propre au
    // transport seul), le choix du client est gardé dans ses prestations, et c'est lui qui se montre
    // (fiche Créagidem ci-dessous, CRM, e-mail) — plus jamais « Économique ».
    x.k.egal("base", "transport seul : chiffré sur la grille Économique (la colonne n'admet que eco / standard / luxe)", r.formule, "eco");
    x.k.egal("base", "transport seul : le choix du client est gardé (prestations.transport = « bailly »)", (r.raw_payload.prestations ?? {}).transport, "bailly");
  } else {
    const f = formuleAttendue ?? "standard";
    x.k.egal("base", "requests.services (d'après la formule)", r.services, { emballage: f !== "eco", demontage: true, montage: true, monte_meuble: false, garde_meuble: false });
  }
  brut(x, r, {
    type_client: c.entreprise ? "entreprise" : "particulier",
    assurance: c.garantie ?? "standard",
    valeur_mobilier: c.valeur ?? null,
    piano: !!c.piano,
    articles_lourds: !!c.lourds?.length,
    charges_lourdes: c.lourds?.length ? c.lourds.map((o) => ({ label: o.label, poids: o.poids })) : null,
    commentaire: s.commentaire ?? null,
    mutation_pro: pro ? true : !!c.mutation,
    societe: pro ? (await espacePro((s as Pro).slug))!.nom : (c.entreprise ?? c.mutation ?? null),
    "details.contact.prenom": s.prenom ?? "",
    "details.contact.nom": s.nom ?? "",
    "details.demenagement": (c.demenagement ?? "Complet").toLowerCase(),
    "details.depart.pays": dep.pays,
    "details.arrivee.pays": arr.pays,
    ...(s.depart.complement ? { "details.depart.complement": s.depart.complement } : {}),
    ...(s.arrivee.complement ? { "details.arrivee.complement": s.arrivee.complement } : {}),
    ...(s.depart.region ? { "details.depart.region": s.depart.region } : {}),
    ...(s.depart.portage ? { "depart.portage_m": s.depart.portage } : {}),
    ...(s.arrivee.portage ? { "arrivee.portage_m": s.arrivee.portage } : {}),
    "depart.stationnement": !!s.depart.stationnement,
    "depart.acces_difficile": !!s.depart.difficulte,
    ...(s.depart.difficulte ? { "details.depart.type_difficulte": s.depart.difficulte } : {}),
    ...(s.depart.duplex != null ? { "details.depart.duplex": s.depart.duplex ? "oui" : "non" } : {}),
    ...(s.depart.tailleAscenseur ? { "details.depart.taille_ascenseur": String(s.depart.tailleAscenseur) } : {}),
    ...(s.arrivee.tailleAscenseur ? { "details.arrivee.taille_ascenseur": String(s.arrivee.tailleAscenseur) } : {}),
    ...(s.depart.passageAscenseur != null ? { "details.depart.passage_ascenseur": s.depart.passageAscenseur ? "oui" : "non" } : {}),
    ...(s.arrivee.passageAscenseur != null ? { "details.arrivee.passage_ascenseur": s.arrivee.passageAscenseur ? "oui" : "non" } : {}),
    ...Object.fromEntries(Object.entries(c.demontage ?? {}).flatMap(([cle, d]) => [[`details.emballage.${cle}`, d!.choix], ...(d!.precision ? [[`details.emballage.${cle}Precision`, d!.precision]] : [])])),
    ...(pro ? { "espace.slug": (s as Pro).slug } : {}),
  });
  if ("liste" in s.volume) {
    const items = (await x.db.items(r.id)).map((i) => [i.label, i.quantite]).sort();
    x.k.egal("base", "request_items (meubles listés)", items, [...s.volume.liste].map(([l, n]) => [l, n]).sort());
  }
  distanceFormulaire(x, r, s.depart.ville, s.arrivee.ville);
  const types = await evenementsDe(x, r.id);
  for (const t of ["created", "jeton_modification"]) x.k.vrai("base", `événement « ${t} »`, types.includes(t), types);

  const connue = distanceAttendue(s.depart.ville, s.arrivee.ville) != null;
  const d = await chiffrage(x, r.id, affiche, { distanceConnue: connue, piano: c.piano, charges: c.lourds?.length ?? 0, tranche: c.valeur ?? null, garantie: c.garantie ?? (c.valeur ? "standard" : null) });
  if (prix) outreMerSansPrixRoutier(x, s.depart.ville, s.arrivee.ville, affiche);
  for (const [cote, l] of [["départ", s.depart], ["arrivée", s.arrivee]] as const)
    if (l.pays && l.pays !== "France" && affiche.total != null)
      x.k.vrai("écran", `international (${l.pays}) : estimation automatique fondée sur la bonne ville (${cote} : ${nomVille(l.ville)})`, x.e.distance != null && (() => {
        const a = coordVille(s.depart.ville), b = coordVille(s.arrivee.ville);
        return !!a && !!b && x.e.distance! >= volOiseauKm(a, b) * 0.9 && x.e.distance! <= volOiseauKm(a, b) * 2;
      })(), `${affiche.total} € pour ${x.e.distance} km`);

  const accesDe = (l: LieuComplet) => [
    ...(l.portage ? [`Portage ${l.portage} m.`] : []),
    ...(l.difficulte ? ["Accès difficile poids lourds : oui.", `${l.difficulte}.`] : []),
    ...(l.logement ? [`${l.logement}.`] : l.surface ? [`${l.surface} m².`] : []),
  ];
  const espNom = pro ? (await espacePro((s as Pro).slug))!.nom : null;
  await fiche(x, r.id, {
    nom: s.nom || nomComplet, prenom: s.nom ? (s.prenom ?? "") : "", tel: s.tel,
    chargement: { ville: dep.ville, cp: chiffres(dep.cp), pays: dep.pays, etage: dep.etage, ascenseur: dep.ascenseur, stationnement: !!s.depart.stationnement, adresse: dep.adresse, complement: s.depart.complement ?? null, acces: accesDe(s.depart) },
    livraison: { ville: arr.ville, cp: chiffres(arr.cp), pays: arr.pays, etage: arr.etage, ascenseur: arr.ascenseur, stationnement: !!s.arrivee.stationnement, adresse: arr.adresse, complement: s.arrivee.complement ?? null, acces: accesDe(s.arrivee) },
    quand: s.quand,
    valeur: c.valeur ? BORNE_HAUTE[c.valeur] : 0,
    distance: { attendue: distanceAttendue(s.depart.ville, s.arrivee.ville), depart: s.depart.ville, arrivee: s.arrivee.ville, colonne: x.e.distance ?? null },
    detail: [
      `Demande du site Bailly (${c.entreprise ? "entreprise" : "particulier, devis complet"})`,
      `Volume : ${fr(vol.volume)} m³${vol.methode === "list" ? " (liste de meubles)" : vol.methode === "ai" ? " (estimé sur photos)" : ""}`,
      ...(c.formule === "transport" ? ["Formule : Transport de meubles uniquement"] : [`Formule : ${FORMULE_NOM[formuleAttendue ?? "standard"]}`]),
      `Garantie : ${c.garantie ?? "standard"}`,
      ...(c.valeur ? [`Valeur du mobilier déclarée : ${c.valeur}`] : []),
      ...(c.piano ? ["Piano"] : []),
      ...(c.lourds?.length ? [`Charges lourdes : ${c.lourds.map((o) => [o.label, o.poids].filter(Boolean).join(" ")).join(", ")}`] : []),
      ...(s.commentaire ? [`Commentaire du client : ${s.commentaire.slice(0, 60)}`] : []),
      ...(c.mutation ? [`Employeur : ${c.mutation}`] : espNom ? [`Employeur : ${espNom}`] : c.entreprise ? [`Société : ${c.entreprise}`] : []),
      ...(dates.flexibilite ? [`Période : ${dates.flexibilite}`] : []),
      ...(c.demenagement === "Partiel" ? ["Déménagement : partiel"] : []),
    ],
    sansDetail: c.formule === "transport" ? ["Formule : Économique"] : [],
  });
  await verifierEnvois(x.db, x.k, { id: r.id, email: x.email, tel: s.tel, source: "form", evenements: ["demande_recue", "demande_complete", ...(d ? ["devis_cree"] : [])] });
  pagePropre(x);
  if (s.crm) x.e.captures.push(await verifierCrm(x.browser, x.k, s.n, r.id, { nom: r.client_nom, email: x.email, tel: s.tel, trajet: `${r.depart_ville} → ${r.arrivee_ville}`, volume: vol.volume }));
  if (pro && (s as Pro).rh) await verifierRh(x, r.client_nom);
}

type EspaceRecette = { slug: string; code: string; nom: string; actif: boolean; afficher_estimation: boolean; afficher_volume: boolean };
let espaces: EspaceRecette[] | null = null;
/** Les espaces pro de la recette et leur code, lus comme l'équipe (session « equipe »). */
async function espacePro(slug: string): Promise<EspaceRecette | null> {
  if (!espaces) {
    const r = await fabriqueRequetes.newContext({ storageState: fichierSession("equipe") });
    const rep = await r.get(INT + "/api/data/espaces-pro");
    espaces = rep.ok() ? ((await rep.json()).espaces as EspaceRecette[]) : [];
    await r.dispose();
  }
  return espaces.find((e) => e.slug === slug && e.actif && e.code) ?? null;
}

/** La demande paraît dans l'espace RH de son entreprise (compte RH de test, Carrefour). */
async function verifierRh(x: X, nom: string) {
  const ctx = await x.browser.newContext({ storageState: fichierSession("rh"), viewport: { width: 1440, height: 900 }, locale: "fr-FR", timezoneId: "Europe/Paris" });
  const p = await ctx.newPage();
  const s = surveiller(p);
  try {
    await p.goto(`${EXT}/rh#collaborateurs`);
    await p.getByPlaceholder("Collaborateur, ville, référence…").fill(x.s.parcours === "pro" ? (x.s as Pro).nom : nom);
    const vu = await p.getByText(nom).first().isVisible({ timeout: 45_000 }).catch(() => false) || (await p.getByText(nom).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false));
    x.k.vrai("crm", "espace RH de l'entreprise : le salarié paraît dans ses collaborateurs", vu);
    x.k.vrai("crm", "espace RH sans erreur", s.bilan().length === 0, s.bilan());
    x.e.captures.push(await capturer(p, x.s.n, "rh"));
  } finally {
    await ctx.close();
  }
}

/* ───────────────────────── Salarié muté ───────────────────────── */

async function remplirFiche(x: X, l: LieuFiche) {
  const R = x.R;
  if (l.pays && l.pays !== "France") await R.getByLabel("Pays").selectOption(l.pays);
  if (l.adresse) await champ(R, "Adresse").fill(l.adresse);
  if (l.complement) await R.getByLabel(/^Complément d'adresse/).fill(l.complement);
  if (l.cp && !estChoisie(l.ville)) await R.getByLabel("Code postal").fill(l.cp);
  await choisirVille(x.page, R.getByLabel(/^Ville/), l.ville);
  if (l.etage != null) await R.getByLabel(/^Étage/).fill(String(l.etage));
  if (l.logement) {
    await bouton(R, "Je ne connais pas la surface").click();
    await R.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: l.logement, exact: true }).click();
  } else if (l.surface != null) await R.getByLabel(/^Surface habitable/).fill(String(l.surface));
  if (l.ascenseur != null) await repondre(R, "Ascenseur ?", l.ascenseur ? "Oui" : "Non");
  if (l.duplex != null) await repondre(R, "Duplex ?", l.duplex ? "Oui" : "Non");
  for (const a of l.annexes ?? []) await R.getByRole("button", { name: a, exact: true }).click();
}

async function parcoursMutation(x: X, s: Mutation) {
  const R = () => x.R;
  await ouvrir(x);
  await porte(x, "mutation");
  await expect(R().getByRole("heading", { name: /Parlez-nous de vous/ })).toBeVisible();
  await etape(x, "vous");
  if (s.prenom) await champ(R(), "Prénom").fill(s.prenom);
  await champ(R(), "Nom").fill(s.nom);
  await champ(R(), "Téléphone").fill(s.tel);
  await champ(R(), "E-mail").fill(x.email);
  await R().getByLabel(/Par quelle entreprise/).fill(s.societe);
  if (s.espaceReconnu) {
    const reconnu = await R().getByText(/travaille avec Bailly/).waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    x.k.vrai("écran", `la société « ${s.societe} » est reconnue (son espace pro)`, reconnu);
  }
  if (s.demenagement) await R().getByRole("group", { name: "Déménagement complet ou partiel ?" }).getByRole("radio", { name: s.demenagement }).click();
  await choisirQuand(R(), s.quand);
  if (s.valeur) await R().getByRole("button", { name: s.valeur, exact: true }).click();
  if (s.garantie) await bouton(R(), s.garantie === "luxe" ? /Garantie dommages Luxe/ : /Garantie dommages standard/).click();
  if (s.lourds) {
    await repondre(R(), "Avez-vous des objets lourds ou particuliers ?", "Oui");
    await R().getByLabel("Lesquels ?").fill(s.lourds);
  }
  await continuer(x, /D'où partez-vous/, "départ");
  await remplirFiche(x, s.depart);
  await continuer(x, /Où allez-vous/, "arrivée");
  await remplirFiche(x, s.arrivee);
  await continuer(x, /Un dernier mot/, "relecture");
  if (s.commentaire) await R().getByPlaceholder(/Ce que nous devons savoir/).fill(s.commentaire);
  await expect(R().getByText(s.societe).filter({ visible: true }).first()).toBeVisible();
  x.e.captures.push(await capturer(x.page, s.n, "relecture"));
  await bouton(R(), "Envoyer ma demande").click();
  const ref = await referenceAffichee(x);
  if (!s.espaceReconnu) await expect(R().getByText(/organiser la visite technique/)).toBeVisible();
  await etape(x, "fin");
  x.e.captures.push(await capturer(x.page, s.n, "fin"));

  const r = await x.db.demande(x.email);
  x.e.demande = r.id;
  x.k.vrai("écran", "la référence affichée est celle de la demande", r.id.startsWith(ref), { ref, id: r.id });
  const dates = dateAttendue(s.quand);
  const lieu = (l: LieuFiche) => ({ ville: nomVille(l.ville), cp: cpVille(l.ville) ?? l.cp ?? null, pays: l.pays ?? "France" });
  const dep = lieu(s.depart), arr = lieu(s.arrivee);
  colonnes(x, r, {
    source: "form", client_nom: [s.prenom, s.nom].filter(Boolean).join(" "), client_tel: s.tel,
    depart_adresse: s.depart.adresse ?? null, depart_code_postal: dep.cp, depart_ville: dep.ville, depart_etage: s.depart.etage ?? null, depart_ascenseur: s.depart.ascenseur ?? null, type_logement_depart: s.depart.logement ?? null,
    arrivee_adresse: s.arrivee.adresse ?? null, arrivee_code_postal: arr.cp, arrivee_ville: arr.ville, arrivee_etage: s.arrivee.etage ?? null, arrivee_ascenseur: s.arrivee.ascenseur ?? null, type_logement_arrivee: s.arrivee.logement ?? null,
    flexibilite: dates.flexibilite, volume_m3: null, formule: null, completion_token: null,
  });
  x.k.egal("base", "requests.date_souhaitee", await dateDe(x, r.id), dates.date_souhaitee);
  const annexes = (l: LieuFiche) => (l.annexes ?? []).map((a) => ANNEXES[a].cle);
  brut(x, r, {
    type_client: "particulier", mutation_pro: true, societe: s.societe, articles_lourds: !!s.lourds, articles_lourds_detail: s.lourds ?? null,
    valeur_mobilier: s.valeur ?? null, assurance: s.garantie ?? null, commentaire: s.commentaire ?? null,
    "details.parcours": "mutation", "details.demenagement": (s.demenagement ?? "Complet").toLowerCase(),
    "details.contact.prenom": s.prenom ?? "", "details.contact.nom": s.nom,
    "details.depart.pays": dep.pays, "details.arrivee.pays": arr.pays, "details.depart.annexes": annexes(s.depart), "details.arrivee.annexes": annexes(s.arrivee),
    ...(s.espaceReconnu ? { "espace.slug": s.espaceReconnu } : {}),
  });
  if (!s.espaceReconnu) x.k.egal("base", "raw_payload.espace (aucun espace)", r.raw_payload.espace ?? null, null);
  await sansPrixSuite(x, r, s.tel);
  await fiche(x, r.id, {
    nom: s.nom, prenom: s.prenom ?? "", tel: s.tel,
    chargement: { ville: dep.ville, cp: chiffres(dep.cp), pays: dep.pays, etage: s.depart.etage, ascenseur: !!s.depart.ascenseur, adresse: s.depart.adresse ?? null, acces: s.depart.logement ? [`${s.depart.logement}.`] : s.depart.surface ? [`${s.depart.surface} m².`] : [] },
    livraison: { ville: arr.ville, cp: chiffres(arr.cp), pays: arr.pays, etage: s.arrivee.etage, ascenseur: !!s.arrivee.ascenseur, adresse: s.arrivee.adresse ?? null, acces: s.arrivee.logement ? [`${s.arrivee.logement}.`] : s.arrivee.surface ? [`${s.arrivee.surface} m².`] : [] },
    quand: s.quand, valeur: s.valeur ? BORNE_HAUTE[s.valeur] : 0,
    distance: { attendue: null, depart: s.depart.ville, arrivee: s.arrivee.ville, colonne: null },
    detail: [
      "Demande du site Bailly (mutation professionnelle)", `Employeur : ${s.societe}`,
      ...(s.demenagement === "Partiel" ? ["Déménagement : partiel"] : ["Déménagement : complet"]),
      ...(s.lourds ? [`Objets lourds : ${s.lourds}`] : []),
      ...(s.garantie ? [`Garantie : ${s.garantie}`] : []),
      ...(s.valeur ? [`Valeur du mobilier déclarée : ${s.valeur}`] : []),
      ...(s.commentaire ? [`Commentaire du client : ${s.commentaire}`] : []),
      ...(dates.flexibilite ? [`Période : ${dates.flexibilite}`] : []),
    ],
  });
  await verifierEnvois(x.db, x.k, { id: r.id, email: x.email, tel: s.tel, source: "form", evenements: ["demande_recue"] });
  pagePropre(x);
  if (s.crm) x.e.captures.push(await verifierCrm(x.browser, x.k, s.n, r.id, { nom: r.client_nom, email: x.email, tel: s.tel, trajet: `${r.depart_ville} → ${r.arrivee_ville}` }));
  if (s.espaceReconnu === "carrefour") await verifierRh(x, r.client_nom);
}

/** La suite d'une demande sans prix : au tableau des rappels, ni analyse ni devis. */
async function sansPrixSuite(x: X, r: Record<string, unknown> & { id: string }, _tel: string | null | undefined, creneau?: string) {
  const rap = await x.db.attendreEvenement(r.id, "rappel");
  x.k.egal("base", "rappel : statut", rap.payload.statut, "a_rappeler");
  if (creneau) x.k.egal("base", "rappel : créneau demandé", rap.payload.creneau, creneau);
  await x.db.attendreEvenement(r.id, "creagidem");
  const types = await evenementsDe(x, r.id);
  for (const t of ["created", "jeton_modification"]) x.k.vrai("base", `événement « ${t} »`, types.includes(t), types);
  x.k.vrai("base", "ni « analysis » ni « incomplete » (parcours sans prix)", !types.includes("analysis") && !types.includes("incomplete"), types);
  x.k.egal("devis", "aucun devis (parcours sans prix)", (await devisDe(x.db, r.id)).length, 0);
}

/* ───────────────────────── Entreprise ───────────────────────── */

async function contact(x: X, c: { societe: string; nom: string; fonction?: string; tel: string }) {
  const R = x.R;
  await champ(R, "Société").fill(c.societe);
  await champ(R, "Votre nom").fill(c.nom);
  if (c.fonction) await R.getByLabel(/^Fonction/).fill(c.fonction);
  await champ(R, "Téléphone").fill(c.tel);
  await champ(R, "E-mail").fill(x.email);
}

async function parcoursTransfert(x: X, s: Transfert) {
  const R = () => x.R;
  await ouvrir(x);
  await porte(x, "transfert");
  await expect(R().getByRole("heading", { name: /Votre société/ }).first()).toBeVisible();
  await etape(x, "société");
  await contact(x, s);
  if (s.quand) await choisirQuand(R(), s.quand);
  await continuer(x, /D'où, et vers/, "adresses");
  for (const [i, l] of [s.depart, s.arrivee].entries()) {
    const b = bloc(R(), i === 0 ? "Les locaux de départ" : "Les locaux d'arrivée");
    if (l.adresse) await champ(b, "Adresse").fill(l.adresse);
    await choisirVille(x.page, b.getByLabel(/^Ville/), l.ville);
    if (l.etage != null) await R().getByLabel(/^Étage/).nth(i).fill(String(l.etage));
    if (l.ascenseur != null) {
      const ligne = R().getByText("Ascenseur ?", { exact: true }).nth(i).locator("xpath=..");
      await ligne.getByRole("radio", { name: l.ascenseur ? "Oui" : "Non", exact: true }).click();
    }
  }
  await continuer(x, /Que déménagez-vous/, "mobilier");
  for (const [label, n] of Object.entries(s.mobilier)) await R().getByLabel(label, { exact: true }).fill(String(n));
  if (s.lourds) {
    await repondre(R(), "Avez-vous du matériel lourd ou particulier ?", "Oui");
    await R().getByLabel("Lequel ?").fill(s.lourds);
  } else await repondre(R(), "Avez-vous du matériel lourd ou particulier ?", "Non");
  if (s.commentaire) await R().getByPlaceholder(/Accès, horaires/).fill(s.commentaire);
  x.e.captures.push(await capturer(x.page, s.n, "mobilier"));
  await bouton(R(), "Envoyer ma demande").click();
  const ref = await referenceAffichee(x);
  await expect(R().getByText(/Votre demande de transfert est transmise/)).toBeVisible();
  await etape(x, "fin");
  x.e.captures.push(await capturer(x.page, s.n, "fin"));

  const r = await x.db.demande(x.email);
  x.e.demande = r.id;
  x.k.vrai("écran", "la référence affichée est celle de la demande", r.id.startsWith(ref), { ref, id: r.id });
  const liste = Object.entries(s.mobilier).filter(([, n]) => n! > 0) as [string, number][];
  const volume = liste.length ? sommeListe(liste, MOBILIER_BUREAU) : null;
  x.e.volume = volume;
  const dates = dateAttendue(s.quand);
  colonnes(x, r, {
    source: "form", client_nom: s.nom, client_tel: s.tel,
    depart_adresse: s.depart.adresse ?? null, depart_ville: nomVille(s.depart.ville), depart_code_postal: cpVille(s.depart.ville), depart_etage: s.depart.etage ?? null, depart_ascenseur: s.depart.ascenseur ?? null,
    arrivee_ville: nomVille(s.arrivee.ville), arrivee_code_postal: cpVille(s.arrivee.ville), arrivee_etage: s.arrivee.etage ?? null, arrivee_ascenseur: s.arrivee.ascenseur ?? null,
    flexibilite: dates.flexibilite, volume_m3: volume, volume_method: volume != null ? "list" : null,
  });
  x.k.egal("base", "requests.date_souhaitee", await dateDe(x, r.id), dates.date_souhaitee);
  brut(x, r, { type_client: "entreprise", societe: s.societe, articles_lourds: !!s.lourds, articles_lourds_detail: s.lourds ?? null, commentaire: s.commentaire ?? null, "details.parcours": "entreprise", "details.transfert": "simple", "details.fonction": s.fonction ?? null });
  const items = (await x.db.items(r.id)).map((i) => [i.label, i.quantite]).sort();
  x.k.egal("base", "request_items (mobilier compté)", items, liste.sort());
  await sansPrixSuite(x, r, s.tel);
  await fiche(x, r.id, {
    nom: s.nom, prenom: "", tel: s.tel,
    chargement: { ville: nomVille(s.depart.ville), cp: chiffres(cpVille(s.depart.ville)), pays: "France", etage: s.depart.etage, ascenseur: !!s.depart.ascenseur, adresse: s.depart.adresse ?? null },
    livraison: { ville: nomVille(s.arrivee.ville), cp: chiffres(cpVille(s.arrivee.ville)), pays: "France", etage: s.arrivee.etage, ascenseur: !!s.arrivee.ascenseur },
    quand: s.quand, valeur: 0,
    distance: { attendue: null, depart: s.depart.ville, arrivee: s.arrivee.ville, colonne: null },
    detail: [
      "Demande du site Bailly (entreprise, petit transfert)", `Société : ${s.societe}${s.fonction ? ` (contact : ${s.fonction})` : ""}`,
      ...(volume != null ? [`Volume : ${fr(volume)} m³ (liste de meubles)`] : []),
      ...(s.lourds ? [`Objets lourds : ${s.lourds}`] : []),
      ...(s.commentaire ? [`Commentaire du client : ${s.commentaire}`] : []),
      ...(dates.flexibilite ? [`Période : ${dates.flexibilite}`] : []),
    ],
  });
  await verifierEnvois(x.db, x.k, { id: r.id, email: x.email, tel: s.tel, source: "form", evenements: ["demande_recue"] });
  pagePropre(x);
  if (s.crm) x.e.captures.push(await verifierCrm(x.browser, x.k, s.n, r.id, { nom: r.client_nom, email: x.email, tel: s.tel, trajet: `${r.depart_ville} → ${r.arrivee_ville}`, volume }));
}

async function parcoursProjet(x: X, s: Projet) {
  const R = () => x.R;
  await ouvrir(x);
  await porte(x, "projet");
  await expect(R().getByRole("heading", { name: /Votre projet/ }).first()).toBeVisible();
  await etape(x, "projet");
  await R().getByPlaceholder(/Nous déménageons notre siège/).fill(s.description);
  await choisirVille(x.page, R().getByLabel("Ville de départ"), s.depart);
  await choisirVille(x.page, R().getByLabel("Ville d'arrivée"), s.arrivee);
  if (s.postes) await R().getByLabel(/^Nombre de postes/).fill(String(s.postes));
  if (s.surface) await R().getByLabel(/^Surface des locaux/).fill(String(s.surface));
  if (s.quand) await choisirQuand(R(), s.quand);
  await continuer(x, /Comment vous joindre/, "contact");
  await contact(x, s);
  if (s.rdv) await bouton(R(), new RegExp(s.rdv)).click();
  if (s.creneau) await R().getByRole("radio", { name: s.creneau, exact: true }).click();
  x.e.captures.push(await capturer(x.page, s.n, "contact"));
  await bouton(R(), "Envoyer ma demande").click();
  const ref = await referenceAffichee(x);
  await expect(R().getByText(/Votre projet est transmis/)).toBeVisible();
  await etape(x, "fin");
  x.e.captures.push(await capturer(x.page, s.n, "fin"));

  const r = await x.db.demande(x.email);
  x.e.demande = r.id;
  x.k.vrai("écran", "la référence affichée est celle de la demande", r.id.startsWith(ref), { ref, id: r.id });
  const dates = dateAttendue(s.quand);
  const creneau = [s.rdv, s.creneau].filter(Boolean).join(" · ") || undefined;
  colonnes(x, r, { source: "form", client_nom: s.nom, client_tel: s.tel, depart_ville: nomVille(s.depart), depart_code_postal: cpVille(s.depart), arrivee_ville: nomVille(s.arrivee), arrivee_code_postal: cpVille(s.arrivee), flexibilite: dates.flexibilite, volume_m3: null });
  x.k.egal("base", "requests.date_souhaitee", await dateDe(x, r.id), dates.date_souhaitee);
  brut(x, r, {
    type_client: "entreprise", societe: s.societe, commentaire: s.description, "details.parcours": "entreprise", "details.transfert": "projet",
    "details.postes": s.postes ?? null, "details.surface_locaux": s.surface ?? null, "details.rendez_vous": s.rdv ?? null, "details.creneau": creneau ?? null, "details.fonction": s.fonction ?? null,
  });
  await sansPrixSuite(x, r, s.tel, creneau);
  await fiche(x, r.id, {
    nom: s.nom, prenom: "", tel: s.tel,
    chargement: { ville: nomVille(s.depart), cp: chiffres(cpVille(s.depart)), pays: "France" },
    livraison: { ville: nomVille(s.arrivee), cp: chiffres(cpVille(s.arrivee)), pays: "France" },
    quand: s.quand, valeur: 0,
    distance: { attendue: null, depart: s.depart, arrivee: s.arrivee, colonne: null },
    detail: [
      "Demande du site Bailly (entreprise, projet important)", `Société : ${s.societe}${s.fonction ? ` (contact : ${s.fonction})` : ""}`,
      ...(s.postes ? [`Postes de travail : ${s.postes}`] : []), ...(s.surface ? [`Surface des locaux : ${s.surface} m²`] : []),
      ...(creneau ? [`Rendez-vous souhaité : ${creneau}`] : []), `Commentaire du client : ${s.description.slice(0, 50)}`,
      ...(dates.flexibilite ? [`Période : ${dates.flexibilite}`] : []),
    ],
  });
  await verifierEnvois(x.db, x.k, { id: r.id, email: x.email, tel: s.tel, source: "form", evenements: ["demande_recue"] });
  pagePropre(x);
  if (s.crm) x.e.captures.push(await verifierCrm(x.browser, x.k, s.n, r.id, { nom: r.client_nom, email: x.email, tel: s.tel, trajet: `${r.depart_ville} → ${r.arrivee_ville}` }));
}

/* ───────────────────────── Demande incomplète, complétée par le lien ───────────────────────── */

async function parcoursCompleter(x: X, s: Completer) {
  const api = await fabriqueRequetes.newContext({ extraHTTPHeaders: { "x-real-ip": `198.51.100.${s.n}` } });
  const lieu = (r?: { cle: string }) => (r ? { ville: VILLES[r.cle].nom, code_postal: VILLES[r.cle].cp } : {});
  const corps = s.source === "email"
    ? { client: { nom: s.nom, email: x.email, tel: s.tel }, depart: lieu(s.depart), arrivee: lieu(s.arrivee), commentaire: "Bonjour, nous déménageons bientôt, pouvez-vous nous faire un devis ? (e-mail reçu, lu par n8n)" }
    : { client: { nom: s.nom, email: x.email, tel: s.tel }, depart: lieu(s.depart), arrivee: lieu(s.arrivee), type_client: "particulier", details: { express: true } };
  const rep = await api.post(EXT + "/api/requests", { data: corps, headers: s.source === "email" ? { "x-request-source": "email", authorization: `Bearer ${SECRETS!.emails}` } : {} });
  x.k.egal("base", "la demande incomplète est enregistrée (201)", rep.status(), 201);
  const id = (await rep.json()).id as string;
  await api.dispose();
  x.e.demande = id;
  const manque = [...(!s.complete.volume ? [] : ["Volume"]), ...(s.depart ? [] : ["Adresse de départ"]), ...(s.arrivee ? [] : ["Adresse d'arrivée"])];
  const inc = await x.db.attendreEvenement(id, "incomplete");
  x.k.egal("base", "incomplete : ce qui manque", inc.payload.manque, manque);
  const [{ jeton, source }] = await x.db.q<{ jeton: string; source: string }>("select completion_token::text as jeton, source from public.requests where id = $1", [id]);
  x.k.egal("base", "requests.source", source, s.source);
  // Les messages « à compléter » : e-mail (et SMS avec un téléphone), jamais partis.
  await verifierEnvois(x.db, x.k, { id, email: x.email, tel: s.tel, source: s.source, evenements: ["demande_recue", "demande_incomplete"] });

  await ouvrir(x, `/completer/${jeton}`);
  await expect(x.R.getByRole("heading", { name: /complétez votre demande/ })).toBeVisible();
  await etape(x, "complétion");
  await expect(barre(x.R)).toContainText("Il manque");
  await expect(x.R.getByLabel(/^E-mail/)).toHaveValue(x.email);
  if (s.complete.depart) await choisirVille(x.page, bloc(x.R, "Votre adresse de départ").getByLabel(/^Ville/), s.complete.depart);
  if (s.complete.arrivee) await choisirVille(x.page, bloc(x.R, "Votre adresse d'arrivée").getByLabel(/^Ville/), s.complete.arrivee);
  const v = s.complete.volume;
  let volume: number;
  let methode = "explicit";
  if ("saisi" in v) {
    await saisirVolume(x.R, v.saisi);
    volume = v.saisi;
  } else if ("liste" in v) {
    await listerMeubles(x.R, v.liste);
    volume = sommeListe(v.liste);
    methode = "list";
  } else {
    await bouton(x.R, /Je décris mon logement/).click();
    await x.R.getByRole("group", { name: "Votre type de logement" }).getByRole("button", { name: v.logement, exact: true }).click();
    volume = TYPES_LOGEMENT[v.logement];
  }
  x.e.volume = volume;
  await expect(barre(x.R)).toContainText("Tout y est");
  await bouton(x.R, "Valider ma demande").click();
  await expect(x.R.getByRole("heading", { name: /Merci, c.est complet/ })).toBeVisible({ timeout: 60_000 });
  x.k.vrai("écran", `le volume complété est rappelé (~${volume} m³)`, (await x.R.getByText(`~${volume} m³`).count()) > 0);
  await etape(x, "fin");
  x.e.captures.push(await capturer(x.page, s.n, "fin"));

  const [r] = await x.db.q("select * from public.requests where id = $1", [id]);
  const arrivee = s.complete.arrivee ?? (s.arrivee as RefVille);
  const depart = s.complete.depart ?? (s.depart as RefVille);
  colonnes(x, r, { volume_m3: volume, volume_method: methode, completion_token: null, depart_ville: nomVille(depart), depart_code_postal: cpVille(depart), arrivee_ville: nomVille(arrivee), arrivee_code_postal: cpVille(arrivee), client_nom: s.nom, client_tel: s.tel ?? null });
  const fait = await x.db.attendreEvenement(id, "completed");
  x.k.vrai("base", "completed : ce qui a été rempli", Array.isArray(fait.payload.rempli) && (fait.payload.rempli as unknown[]).length >= 1, fait.payload);
  const d = await chiffrage(x, id, { total: null, repli: false }, { distanceConnue: true });
  if (d) x.k.note(`chiffrée après complétion : ${x.e.estimation} € (distance calculée par le serveur : ${x.e.distance} km)`);
  if (x.e.distance != null) {
    const a = coordVille(depart)!, b = coordVille(arrivee)!;
    const vo = volOiseauKm(a, b);
    x.k.vrai("base", `distance calculée par le serveur plausible (${nomVille(depart)} → ${nomVille(arrivee)}, vol d'oiseau ${Math.round(vo)} km)`, x.e.distance >= vo * 0.9 && x.e.distance <= vo * 2, x.e.distance);
  }
  if (s.source === "form") {
    await expect.poll(async () => (await x.db.evenements(id)).filter((e) => e.type === "creagidem").length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    const fiches = (await x.db.evenements(id)).filter((e) => e.type === "creagidem");
    const premiere = (fiches[0].payload as { fiche?: Fiche }).fiche;
    x.k.note(`${fiches.length} fiches Créagidem préparées : à la création (sans volume : « ${(premiere?.operation.detail ?? "").split("\n").slice(1).join(" / ") || "rien après l'en-tête"} »), puis après la complétion`);
    await fiche(x, id, {
      derniere: true,
      nom: s.nom, prenom: "", tel: s.tel,
      chargement: { ville: nomVille(depart), cp: chiffres(cpVille(depart)), pays: "France" },
      livraison: { ville: nomVille(arrivee), cp: chiffres(cpVille(arrivee)), pays: "France" },
      quand: undefined, parDefaut: "", valeur: 0,
      distance: { attendue: null, depart, arrivee, colonne: x.e.distance ?? null },
      detail: ["Demande du site Bailly (particulier, devis express)", `Volume : ${fr(volume)} m³`],
    });
  } else {
    const fiches = (await x.db.evenements(id)).filter((e) => e.type === "creagidem");
    x.k.note(`demande venue d'un e-mail : ${fiches.length} fiche(s) Créagidem (le code ne transmet que les demandes du formulaire)`);
  }
  await verifierEnvois(x.db, x.k, { id, email: x.email, tel: s.tel, source: s.source, evenements: ["demande_recue", "demande_incomplete", "demande_completee", ...(d ? ["devis_cree"] : [])] });
  pagePropre(x);
  if (s.crm) x.e.captures.push(await verifierCrm(x.browser, x.k, s.n, id, { nom: s.nom, email: x.email, tel: s.tel, trajet: `${r.depart_ville} → ${r.arrivee_ville}`, volume }));
}

/* ───────────────────────── Les erreurs volontaires ───────────────────────── */

const erreurFormulaire = (R: Locator) => R.locator("div.text-danger").filter({ hasText: /\S/ });
const technique = /Too (big|small)|expected|Invalid|Required|Validation échouée|undefined|null/;

async function aucuneDemande(x: X, email = x.email) {
  // Laisser à un envoi accepté le temps d'arriver en base.
  await x.page.waitForTimeout(1500);
  const n = (await x.db.demandes(email)).length;
  x.k.egal("base", "aucune demande créée", n, 0);
  return n === 0;
}

/** Un message de refus : affiché, en français, sans détail technique, et qui dit quoi corriger. */
async function refusClair(x: X, sujet: RegExp, quoi: string) {
  const e = erreurFormulaire(x.R);
  const vu = await e.first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  const texte = vu ? (await e.first().innerText()).trim() : "";
  x.k.vrai("écran", `${quoi} : un message de refus s'affiche`, vu);
  if (vu) {
    x.k.vrai("écran", `${quoi} : message en français, sans détail technique`, !technique.test(texte), texte);
    x.k.vrai("écran", `${quoi} : le message dit ce qu'il faut corriger`, sujet.test(texte), texte, String(sujet));
  }
  x.e.captures.push(await capturer(x.page, x.s.n, "refus"));
  if (x.k.liste.length) x.k.dernier(x.e.captures.at(-1)!);
  return texte;
}

async function expressMinimal(x: X, o: { nom?: string; email?: string; depart?: RefVille; volume?: string }) {
  await ouvrir(x);
  await porte(x, "express");
  await champ(x.R, "Nom").fill(o.nom ?? "Batterie Erreur");
  await champ(x.R, "E-mail").fill(o.email ?? x.email);
  await champ(x.R, "Téléphone").fill(T_ERREUR);
  await choisirVille(x.page, x.R.getByLabel("Ville de départ"), o.depart ?? { cle: "lyon" });
  await choisirVille(x.page, x.R.getByLabel("Ville d'arrivée"), { cle: "paris" });
  await saisirVolume(x.R, o.volume ?? "20");
}
const T_ERREUR = "06 39 98 19 00";

/** Un devis complet réduit à l'essentiel, de l'étape « Vous » déjà remplie jusqu'à l'envoi. */
async function completJusquAuBout(x: X, commentaire?: string) {
  await continuer(x, /D'où partez-vous/, "départ");
  await choisirVille(x.page, x.R.getByLabel(/^Ville/), { cle: "lyon" });
  await x.R.getByLabel(/^Surface habitable/).fill("50");
  await continuer(x, /Où allez-vous/, "arrivée");
  await choisirVille(x.page, x.R.getByLabel(/^Ville/), { cle: "grenoble" });
  await x.R.getByLabel(/^Surface habitable/).fill("55");
  await bouton(x.R, "Continuer").click();
  await continuer(x, /Vos meubles à démonter/, "démontage");
  await continuer(x, /Quel volume/, "inventaire");
  await saisirVolume(x.R, "20");
  await continuer(x, /Un dernier mot/, "relecture");
  if (commentaire) await x.R.getByLabel(/^Message/).fill(commentaire);
  await bouton(x.R, "Envoyer ma demande").click();
}

async function parcoursErreur(x: X, s: Erreur) {
  const R = () => x.R;
  switch (s.cas) {
    case "email-sans-domaine": {
      const faux = x.email.replace(/\.com$/, "");
      await expressMinimal(x, { email: faux });
      await expect(barre(R())).toContainText("Indiquez un e-mail valide");
      x.k.vrai("écran", "e-mail sans domaine : le bouton reste fermé", await bouton(R(), "Obtenir mon estimation").isDisabled());
      x.e.captures.push(await capturer(x.page, s.n, "refus"));
      await aucuneDemande(x, faux);
      break;
    }
    case "email-refuse-serveur": {
      const faux = x.email.replace("@", " @");
      await expressMinimal(x, { email: faux });
      await bouton(R(), "Obtenir mon estimation").click();
      await refusClair(x, /e-mail|adresse électronique|courriel/i, "e-mail avec une espace");
      await expect(champ(R(), "E-mail")).toHaveValue(faux);
      await aucuneDemande(x, faux);
      await aucuneDemande(x, faux.replace(" ", ""));
      break;
    }
    case "tel-incomplet": {
      await ouvrir(x);
      await porte(x, "complet");
      await champ(R(), "Prénom").fill("Batterie");
      await champ(R(), "Nom").fill("Téléphone-Court");
      await champ(R(), "Téléphone").fill("06 12");
      await champ(R(), "E-mail").fill(x.email);
      const ferme = await bouton(R(), "Continuer").isDisabled();
      const dit = /t[ée]l[ée]phone/i.test(await barre(R()).innerText());
      x.e.captures.push(await capturer(x.page, s.n, "vous"));
      if (x.k.vrai("écran", "téléphone incomplet (« 06 12 ») : refusé à l'étape « Vous »", ferme && dit, { boutonFerme: ferme, barre: await barre(R()).innerText() })) break;
      x.k.dernier(x.e.captures.at(-1)!);
      await completJusquAuBout(x);
      const fin = await R().getByRole("heading", { name: /Votre estimation est prête/ }).waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
      x.e.captures.push(await capturer(x.page, s.n, "fin"));
      const lignes = await x.db.demandes(x.email);
      x.k.vrai("base", "téléphone incomplet : aucune demande créée", lignes.length === 0, lignes.map((l) => ({ id: l.id, client_tel: l.client_tel })));
      if (lignes.length) {
        x.e.demande = lignes[0].id;
        const f = await ficheCreagidem(x.db, x.k, lignes[0].id);
        x.e.fiche = f;
        x.k.note(`demande acceptée (écran de fin : ${fin}), téléphone enregistré « ${lignes[0].client_tel} », fiche Créagidem tel_portable « ${f?.client.tel_portable} »`);
      }
      break;
    }
    case "nom-adresse-web": {
      await expressMinimal(x, { nom: "Jean www.promo-demenagement.fr" });
      await bouton(R(), "Obtenir mon estimation").click();
      await refusClair(x, /nom/i, "nom contenant une adresse web");
      await expect(champ(R(), "E-mail")).toHaveValue(x.email);
      await aucuneDemande(x);
      break;
    }
    case "ville-inconnue": {
      await expressMinimal(x, { depart: { saisie: "Zzyzx-sur-Mer" } });
      // La page ne peut le dire qu'une fois la vraie base d'adresses interrogée (elle répond parfois en plusieurs secondes).
      const msg = await R().getByText(/ville (inconnue|introuvable)|nous ne trouvons pas|n'existe pas/i).first().waitFor({ timeout: 10_000 }).then(() => 1).catch(() => 0);
      await bouton(R(), "Obtenir mon estimation").click();
      const accepte = await R().getByRole("heading", { name: /Votre estimation est prête/ }).waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
      const est = accepte ? await lireEstimation(R()) : { total: null, repli: true };
      x.e.captures.push(await capturer(x.page, s.n, accepte ? "fin" : "refus"));
      const lignes = await x.db.demandes(x.email);
      if (lignes.length) x.e.demande = lignes[0].id;
      const ban = x.e.journalBan.filter((b) => /zzyzx/i.test(b.q));
      x.k.vrai("écran", "ville inconnue (« Zzyzx-sur-Mer ») : le visiteur est prévenu que la ville est introuvable", msg > 0 || !accepte, { estimationAffichee: est.total, reponsesDeLaBaseAdresse: ban });
      x.k.dernier(x.e.captures.at(-1)!);
      if (lignes.length) {
        const r = lignes[0];
        x.e.distance = r.distance_km == null ? null : Number(r.distance_km);
        x.k.vrai("écran", "ville inconnue : aucune estimation fondée sur une autre commune", est.total == null, `${est.total} € pour ${r.distance_km} km (la base d'adresses a répondu : ${ban.map((b) => b.resultats.map((z) => `${z.ville} ${z.cp} (score ${z.score})`).join(", ")).join(" ; ")})`);
        const f = await ficheCreagidem(x.db, x.k, r.id);
        x.e.fiche = f;
        x.k.note(`demande créée : départ « ${r.depart_ville} », distance ${r.distance_km} km, estimation ${r.estimation_prix} €, Créagidem distance ${f?.operation.distance}`);
      }
      break;
    }
    case "obligatoire-vide": {
      await ouvrir(x);
      await porte(x, "mutation");
      await champ(R(), "Nom").fill("Champ-Vide");
      await champ(R(), "Téléphone").fill(T_ERREUR);
      await champ(R(), "E-mail").fill(x.email);
      await R().getByLabel("Date souhaitée").fill("2027-05-10");
      await expect(barre(R())).toContainText("Indiquez l'entreprise qui vous mute");
      x.k.vrai("écran", "société vide : « Continuer » reste fermé", await bouton(R(), "Continuer").isDisabled());
      x.e.captures.push(await capturer(x.page, s.n, "refus"));
      await R().getByLabel(/Par quelle entreprise/).fill("Batterie Essais");
      await champ(R(), "Nom").fill("");
      await expect(barre(R())).toContainText("Indiquez votre nom");
      x.k.vrai("écran", "nom vide : « Continuer » reste fermé", await bouton(R(), "Continuer").isDisabled());
      await aucuneDemande(x);
      break;
    }
    case "date-passee": {
      await ouvrir(x);
      await porte(x, "complet");
      await champ(R(), "Prénom").fill("Batterie");
      await champ(R(), "Nom").fill("Date-Passée");
      await champ(R(), "Téléphone").fill(T_ERREUR);
      await champ(R(), "E-mail").fill(x.email);
      await choisirQuand(R(), { date: "2025-06-30" });
      const ferme = await bouton(R(), "Continuer").isDisabled();
      x.e.captures.push(await capturer(x.page, s.n, "vous"));
      if (x.k.vrai("écran", "date passée (30/06/2025) : refusée à l'étape « Vous »", ferme, { boutonFerme: ferme, barre: await barre(R()).innerText() })) break;
      x.k.dernier(x.e.captures.at(-1)!);
      await completJusquAuBout(x);
      const fin = await R().getByRole("heading", { name: /Votre estimation est prête/ }).waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
      x.e.captures.push(await capturer(x.page, s.n, fin ? "fin" : "refus"));
      const lignes = await x.db.demandes(x.email);
      x.k.vrai("base", "date passée : aucune demande créée", lignes.length === 0, lignes.map((l) => l.id));
      if (lignes.length) {
        x.e.demande = lignes[0].id;
        const f = await ficheCreagidem(x.db, x.k, lignes[0].id);
        x.e.fiche = f;
        x.k.note(`demande acceptée avec la date ${await dateDe(x, lignes[0].id)} ; fiche Créagidem date_ou_periode « ${f?.chargement.date_ou_periode} » ; estimation ${(await x.db.demandes(x.email))[0].estimation_prix} €`);
      }
      break;
    }
    case "texte-demesure": {
      await ouvrir(x);
      await porte(x, "complet");
      await champ(R(), "Prénom").fill("Batterie");
      await champ(R(), "Nom").fill("Texte-Long");
      await champ(R(), "Téléphone").fill(T_ERREUR);
      await champ(R(), "E-mail").fill(x.email);
      const long = ("Nous avons beaucoup de livres, de vaisselle fragile et des souvenirs de famille à protéger. ").repeat(70).slice(0, 6000);
      await completJusquAuBout(x, long);
      await refusClair(x, /message|commentaire|caract[eè]res|trop long/i, "message de 6 000 caractères");
      await aucuneDemande(x);
      break;
    }
    case "nom-trop-long": {
      const nom = "Marie-Charlotte Élisabeth-Joséphine de Montmorency-Laval de La Rochefoucauld-Liancourt";
      await expressMinimal(x, { nom });
      x.k.note(`nom de ${nom.length} caractères`);
      await bouton(R(), "Obtenir mon estimation").click();
      await refusClair(x, /nom/i, `nom de ${nom.length} caractères`);
      await aucuneDemande(x);
      break;
    }
    case "volume-negatif-ou-nul": {
      await expressMinimal(x, { volume: "-12" });
      const ouvert = await bouton(R(), "Obtenir mon estimation").isEnabled();
      const texteBarre = await barre(R()).innerText();
      x.k.vrai("écran", "volume négatif (-12 m³) : refusé avant l'envoi", !ouvert, texteBarre);
      if (ouvert) {
        x.e.captures.push(await capturer(x.page, s.n, "volume-negatif"));
        x.k.dernier(x.e.captures.at(-1)!);
        await bouton(R(), "Obtenir mon estimation").click();
        await refusClair(x, /volume/i, "volume négatif envoyé");
      }
      await aucuneDemande(x);
      // Puis zéro : un déménagement de 0 m³ ne se chiffre pas.
      await saisirVolume(R(), "0");
      const ouvert0 = await bouton(R(), "Obtenir mon estimation").isEnabled();
      if (!x.k.vrai("écran", "volume nul (0 m³) : refusé avant l'envoi", !ouvert0, await barre(R()).innerText())) {
        await bouton(R(), "Obtenir mon estimation").click();
        const fin = await R().getByRole("heading", { name: /Votre estimation est prête/ }).waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
        const est = fin ? await lireEstimation(R()) : { total: null, repli: true };
        x.e.captures.push(await capturer(x.page, s.n, "volume-nul"));
        x.k.dernier(x.e.captures.at(-1)!);
        const lignes = await x.db.demandes(x.email);
        x.k.vrai("base", "volume nul : aucune demande chiffrée", lignes.length === 0, lignes.map((l) => ({ volume: l.volume_m3, estimation: l.estimation_prix })));
        if (lignes.length) {
          x.e.demande = lignes[0].id;
          const { r } = await attendreChiffrage(x.db, lignes[0].id).catch(() => ({ r: lignes[0] }));
          x.e.estimation = r.estimation_prix == null ? null : Number(r.estimation_prix);
          x.k.note(`volume 0 accepté : demande créée, estimation ${r.estimation_prix} € (écran : ${est.total ?? "repli"})`);
        }
      }
      break;
    }
  }
  pagePropre(x, [/422 |status of 422|\/api\/requests/]);
}

/* ───────────────────────── Les tests ───────────────────────── */

function resume(s: Scenario): string {
  const q = (w?: Quand) => (!w ? "sans date" : "date" in w ? w.date : "periode" in w ? `« ${w.periode} »` : `« ${w.libre} »`);
  const v = (r: RefVille) => nomVille(r);
  switch (s.parcours) {
    case "express": {
      const vol = "saisi" in s.volume ? `${s.volume.saisi} m³ saisis` : "logement" in s.volume ? `logement ${s.volume.logement}` : `${s.volume.photos.length} photo (Gemini)`;
      return [`${s.nom}`, `${v(s.depart)} → ${v(s.arrivee)}`, vol, q(s.quand), s.rappel ? `rappel (${s.rappel})` : "", s.modifier ? "modifiée ensuite" : "", s.resume ?? ""].filter(Boolean).join(" · ");
    }
    case "complet":
    case "pro": {
      const c = s as Complet;
      const vol = "saisi" in s.volume ? `${s.volume.saisi} m³ saisis` : "liste" in s.volume ? `liste de ${s.volume.liste.length} meubles` : "photos" in s.volume ? `${s.volume.photos.length} photo (Gemini)` : `logement ${s.volume.logement.type ?? ""}`;
      return [[s.prenom, s.nom].filter(Boolean).join(" ") || c.entreprise, `${v(s.depart.ville)}${s.depart.pays ? ` (${s.depart.pays})` : ""} → ${v(s.arrivee.ville)}${s.arrivee.pays ? ` (${s.arrivee.pays})` : ""}`, vol, `ét. ${s.depart.etage ?? 0}${s.depart.ascenseur ? "+asc" : ""}/${s.arrivee.etage ?? 0}${s.arrivee.ascenseur ? "+asc" : ""}`, c.formule ? `formule ${c.formule}` : "", c.valeur ? `${c.garantie ?? "standard"} ${c.valeur}` : "", c.piano ? "piano" : "", c.lourds?.length ? `${c.lourds.length} charge(s) lourde(s)` : "", c.retour ? "Retour navigateur" : "", s.parcours === "pro" ? `espace ${(s as Pro).slug}` : "", s.resume ?? ""].filter(Boolean).join(" · ");
    }
    case "mutation":
      return [`${s.prenom ?? ""} ${s.nom}`.trim(), s.societe, `${v(s.depart.ville)} → ${v(s.arrivee.ville)}${s.arrivee.pays ? ` (${s.arrivee.pays})` : ""}`, q(s.quand), s.lourds ? "objets lourds" : "", s.resume ?? ""].filter(Boolean).join(" · ");
    case "transfert":
      return [s.societe, `${v(s.depart.ville)} → ${v(s.arrivee.ville)}`, Object.entries(s.mobilier).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(", ") || "commentaire seul", q(s.quand)].filter(Boolean).join(" · ");
    case "projet":
      return [s.societe, `${v(s.depart)} → ${v(s.arrivee)}`, s.postes ? `${s.postes} postes` : "", s.rdv ?? "", s.creneau ?? "", q(s.quand)].filter(Boolean).join(" · ");
    case "completer":
      return [s.nom, `source ${s.source === "email" ? "e-mail (n8n)" : "formulaire"}`, `manque : ${[!s.depart && "départ", !s.arrivee && "arrivée", "volume"].filter(Boolean).join(", ")}`, `complété : ${"saisi" in s.complete.volume ? `${s.complete.volume.saisi} m³` : "liste" in s.complete.volume ? "liste" : `logement ${s.complete.volume.logement}`}`].join(" · ");
    case "erreur":
      return {
        "email-sans-domaine": "e-mail sans domaine (…@example)",
        "email-refuse-serveur": "e-mail avec une espace",
        "tel-incomplet": "téléphone « 06 12 »",
        "nom-adresse-web": "nom « Jean www.promo-demenagement.fr »",
        "ville-inconnue": "ville « Zzyzx-sur-Mer »",
        "obligatoire-vide": "mutation sans société, puis sans nom",
        "date-passee": "date du 30/06/2025",
        "texte-demesure": "message de 6 000 caractères",
        "nom-trop-long": "nom de 87 caractères",
        "volume-negatif-ou-nul": "volume -12 m³ puis 0 m³",
      }[s.cas];
  }
}

const PHOTOS_GEMINI = new Set(SCENARIOS.filter((s) => (s.parcours === "express" || s.parcours === "complet") && "photos" in s.volume).map((s) => s.n));
const BUDGET_GEMINI = 6;
const COMPTEUR_GEMINI = path.join(ETAT, "campagne-gemini.json");
function reserverGemini(n: number, photos: number): string | null {
  if (process.env.CAMPAGNE_PHOTOS === "factice") return null;
  if (process.env.AVEC_GEMINI !== "1") return "analyse des photos coupée : relancer avec AVEC_GEMINI=1 (serveurs compris)";
  const c: { utilisees: number; par: Record<string, number> } = fs.existsSync(COMPTEUR_GEMINI) ? JSON.parse(fs.readFileSync(COMPTEUR_GEMINI, "utf8")) : { utilisees: 0, par: {} };
  if (c.utilisees + photos > BUDGET_GEMINI) return `budget Gemini épuisé (${c.utilisees}/${BUDGET_GEMINI} analyses réelles)`;
  c.utilisees += photos;
  c.par[String(n)] = (c.par[String(n)] ?? 0) + photos;
  fs.writeFileSync(COMPTEUR_GEMINI, JSON.stringify(c, null, 2));
  return null;
}

test.afterEach(async ({ page }, info) => {
  const e = etat;
  etat = null;
  if (!e) return;
  if (info.status !== "passed" && info.status !== "skipped") e.captures.push(await capturer(page, e.s.n, "echec").catch(() => ""));
  fs.mkdirSync(RESULTATS, { recursive: true });
  fs.writeFileSync(
    path.join(RESULTATS, `${pad(e.s.n)}.json`),
    JSON.stringify(
      {
        n: e.s.n, parcours: e.s.parcours, nomParcours: NOM_PARCOURS[e.s.parcours], appareil: e.s.appareil, cadre: !!e.s.cadre, crm: !!e.s.crm, resume: resume(e.s),
        statut: info.status, duree: Math.round((Date.now() - e.debut) / 1000),
        erreurs: info.errors.map((x) => (x.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 6).join(" ").slice(0, 600)),
        constats: e.k.liste, notes: e.k.notes,
        demande: e.demande ?? null, reference: e.reference ?? null, estimation: e.estimation ?? null, distance: e.distance ?? null, volume: e.volume ?? null,
        fiche: e.fiche ?? null, ban: e.journalBan, captures: e.captures.filter(Boolean),
        ignore: info.status === "skipped" ? info.annotations.find((a) => a.type === "skip")?.description ?? null : null,
      },
      null,
      2,
    ),
  );
});

for (const appareil of ["bureau", "mobile"] as const) {
  test.describe(appareil === "bureau" ? "ordinateur" : "téléphone", () => {
    if (appareil === "mobile") test.use(PIXEL7);
    for (const s of SCENARIOS.filter((x) => x.appareil === appareil)) {
      test(`#${pad(s.n)} ${NOM_PARCOURS[s.parcours]}${s.cadre ? " (cadre du site officiel)" : ""} — ${resume(s)}`.slice(0, 220), async ({ page, context, browser }, info) => {
        const k = new Constats();
        const e: Etat = { s, k, captures: [], journalBan: [], debut: Date.now() };
        etat = e;
        if (PHOTOS_GEMINI.has(s.n)) {
          const refus = reserverGemini(s.n, (s as Express).volume && "photos" in (s as Express).volume ? ((s as Express).volume as { photos: string[] }).photos.length : 1);
          test.skip(!!refus, refus ?? "");
        }
        const db = new Base();
        const sv = surveiller(page);
        await preparerVisiteur(context, e.journalBan);
        if (s.cadre) await servirHote(context);
        const x: X = { page, context, browser, R: page.locator("body"), s, k, db, email: emailUnique(`c${pad(s.n)}`), mobile: appareil === "mobile", cadre: !!s.cadre, e, bilan: sv.bilan };
        info.annotations.push({ type: "e-mail", description: x.email });
        try {
          if (s.parcours === "express") await parcoursExpress(x, s);
          else if (s.parcours === "complet" || s.parcours === "pro") await parcoursComplet(x, s);
          else if (s.parcours === "mutation") await parcoursMutation(x, s);
          else if (s.parcours === "transfert") await parcoursTransfert(x, s);
          else if (s.parcours === "projet") await parcoursProjet(x, s);
          else if (s.parcours === "completer") await parcoursCompleter(x, s);
          else await parcoursErreur(x, s);
        } finally {
          await db.fermer();
        }
      });
    }
  });
}

void CAPTURES;
