#!/usr/bin/env node
/*
 * Sème la démonstration de la visite technique (cahier des charges, §3.2)
 * sur trois dossiers fictifs du jeu de l'espace client :
 *
 *   BD-2026-0160 (Antoine Fabre)  trois créneaux proposés, à choisir dans l'espace ;
 *   BD-2026-0161 (Inès Marchal)   une visite réservée demain à 10 h (rappel de la veille) ;
 *   BD-2026-0163 (Karim Perrin)   la visite de ce matin, saisie sur la tablette
 *                                 (pièces, métré, photos, accès, options), prête à
 *                                 signer : le client signe sur la tablette, et le
 *                                 compte-rendu signé rejoint le dossier et l'espace.
 *
 *   node scripts/semer-visites.mjs             sème (ou remet à zéro) la démonstration
 *   node scripts/semer-visites.mjs --retirer   retire tout ce que la démonstration a posé
 *
 * Préalables : le jeu de l'espace client (npm run semer:espace-client), la
 * migration 0013 (npm run migrations) et le schéma du CRM à jour (un
 * démarrage de l'app interne le pose).
 *
 * Garde-fous : le script ne touche qu'à ces trois dossiers, et seulement si
 * leur client est fictif (adresse @example.com, fiche marquée par le jeu de
 * l'espace client). Il ne modifie ni les tables d'origine du schéma public,
 * ni les comptes. Les photos viennent des images du dépôt (public/), rangées
 * dans le seau privé « photos-chantier » sous visites/.
 *
 * Variables : DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL et
 * SUPABASE_SERVICE_ROLE_KEY, prises dans l'environnement ou dans .env.local.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import ts from "typescript";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retirerSeulement = process.argv.includes("--retirer");

if ((!process.env.DATABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && existsSync(path.join(RACINE, ".env.local"))) process.loadEnvFile(path.join(RACINE, ".env.local"));
if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires.");
  process.exit(1);
}

const MARQUE_CRM = "Client fictif du jeu de démonstration de l'espace client (scripts/semer-espace-client.mjs).";
const REFS = { creneaux: "BD-2026-0160", demain: "BD-2026-0161", signe: "BD-2026-0163" };
/** Le volume de chaque dossier dans le jeu de l'espace client : la saisie le recalcule, le retrait le rend. */
const VOLUMES_JEU = { "BD-2026-0160": 36, "BD-2026-0161": 26, "BD-2026-0163": 30 };
const SEAU_PHOTOS = "photos-chantier";
const SEAU_ESPACE = "espace-client";

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  application_name: "bailly-semis-visites",
});
const stockage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage;

/** Un module TypeScript du dépôt sans import (le catalogue, les prestations), transpilé tel quel. */
async function charger(relatif) {
  const source = readFileSync(path.join(RACINE, relatif), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const dossier = mkdtempSync(path.join(tmpdir(), "bailly-visites-"));
  const fichier = path.join(dossier, "module.mjs");
  writeFileSync(fichier, outputText);
  try {
    return await import(pathToFileURL(fichier).href);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

// --- L'heure de Paris -----------------------------------------------------------------------------

function decalageParis(t) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60_000) * 60_000) / 60_000;
}
function instantParis(jour, hhmm) {
  const [a, m, j] = jour.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const naif = Date.UTC(a, m - 1, j, h, mi);
  return new Date(naif - decalageParis(naif - decalageParis(naif) * 60_000) * 60_000);
}
const jourParis = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const lendemain = (jour, n = 1) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// --- Les dossiers ---------------------------------------------------------------------------------

async function dossiers() {
  const { rows } = await db.query(
    `select d.id, d.ref, d.commercial_id, c.email, c.notes from crm.dossiers d join crm.clients c on c.id = d.client_id where d.ref = any($1::text[])`,
    [Object.values(REFS)],
  );
  const parRef = Object.fromEntries(rows.map((r) => [r.ref, r]));
  for (const ref of Object.values(REFS)) {
    const d = parRef[ref];
    if (!d) throw new Error(`Dossier ${ref} introuvable : semez d'abord le jeu de l'espace client (npm run semer:espace-client).`);
    if (!/@example\.com$/i.test(d.email ?? "") || d.notes !== MARQUE_CRM) throw new Error(`Le dossier ${ref} n'est pas un dossier fictif : rien n'est touché.`);
  }
  return parRef;
}

async function retirer(liste) {
  const ids = liste.map((d) => d.id);
  const photos = (await db.query("select p.chemin, p.chemin_vignette from crm.visite_photos p join crm.visites v on v.id = p.visite_id where v.dossier_id = any($1::int[])", [ids])).rows;
  const documents = (await db.query("select document_chemin from crm.visites where dossier_id = any($1::int[]) and document_chemin is not null", [ids])).rows;
  await db.query("begin");
  try {
    await db.query("delete from crm.visites where dossier_id = any($1::int[])", [ids]);
    await db.query("delete from crm.propositions_visite where dossier_id = any($1::int[])", [ids]);
    await db.query("delete from crm.rendez_vous where dossier_id = any($1::int[]) and type in ('phys', 'visio')", [ids]);
    await db.query("delete from crm.inventaire where dossier_id = any($1::int[])", [ids]);
    await db.query("delete from crm.pieces where dossier_id = any($1::int[])", [ids]);
    for (const d of liste) await db.query("update crm.dossiers set volume = $2 where id = $1", [d.id, VOLUMES_JEU[d.ref]]);
    await db.query(
      `update crm.etapes_trajet set etage = null, ascenseur = false, escalier = null, portage_m = null, stationnement = null, poids_lourd = null, monte_meuble = null, acces = null
        where dossier_id = any($1::int[])`,
      [ids],
    );
    await db.query(
      `delete from crm.activite where dossier_id = any($1::int[])
          and (libelle ilike '%visite%' or libelle ilike '%créneau%' or libelle ilike 'compte-rendu%')`,
      [ids],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
  const chemins = photos.flatMap((p) => [p.chemin, p.chemin_vignette]).filter(Boolean);
  if (chemins.length) await stockage.from(SEAU_PHOTOS).remove([...new Set(chemins)]);
  if (documents.length) await stockage.from(SEAU_ESPACE).remove(documents.map((d) => d.document_chemin));
  for (const d of liste) await db.query("select public.ec_projeter_dossier_crm($1), public.ec_projeter_visites_crm($1)", [d.id]);
}

/** Le commercial est-il libre sur ce créneau ? */
async function libre(commercial, debut, duree, saufDossier) {
  const fin = new Date(debut.getTime() + duree * 60_000);
  const { rows } = await db.query(
    `select 1 from crm.rendez_vous r where r.commercial_id = $1 and tstzrange(r.debut, r.debut + make_interval(mins => r.duree_min)) && tstzrange($2, $3)
     union all
     select 1 from crm.creneaux_visite c join crm.propositions_visite p on p.id = c.proposition_id
      where p.commercial_id = $1 and p.statut = 'ouverte' and c.statut = 'propose' and p.dossier_id <> $4
        and tstzrange(c.debut, c.debut + make_interval(mins => p.duree_min)) && tstzrange($2, $3)`,
    [commercial, debut.toISOString(), fin.toISOString(), saufDossier],
  );
  return rows.length === 0;
}

async function semerCreneaux(d) {
  // Trois créneaux libres, sur trois jours ouvrés à partir d'après-demain.
  const heures = ["10:30", "14:00", "16:00", "09:00"];
  const choisis = [];
  for (let jour = lendemain(jourParis(new Date()), 2); choisis.length < 3; jour = lendemain(jour)) {
    const js = new Date(`${jour}T12:00:00Z`).getUTCDay();
    if (js === 0 || js === 6) continue;
    for (const h of heures) {
      const debut = instantParis(jour, h);
      if (await libre(d.commercial_id, debut, 60, d.id)) {
        choisis.push(debut);
        break;
      }
    }
  }
  const { rows } = await db.query(
    "insert into crm.propositions_visite (dossier_id, commercial_id, type, duree_min, demo) values ($1, $2, 'phys', 60, true) returning id",
    [d.id, d.commercial_id],
  );
  for (const debut of choisis) await db.query("insert into crm.creneaux_visite (proposition_id, debut) values ($1, $2)", [rows[0].id, debut.toISOString()]);
  await db.query("update crm.dossiers set statut = 'visite', maj_le = now() where id = $1 and statut = 'prospect'", [d.id]);
  await db.query("insert into crm.activite (dossier_id, libelle) values ($1, '3 créneaux de visite proposés au client (sur place, 1 h)')", [d.id]);
  await db.query("select public.ec_projeter_visites_crm($1)", [d.id]);
  return choisis;
}

async function semerDemain(d) {
  const demain = lendemain(jourParis(new Date()));
  for (const h of ["10:00", "11:30", "14:00", "16:00"]) {
    const debut = instantParis(demain, h);
    const { rows } = await db.query("select public.ec_poser_visite_crm($1, $2, 'phys', $3, 60, null, 'crm', null) as r", [d.id, d.commercial_id, debut.toISOString()]);
    if (rows[0].r.issue === "reserve") return debut;
  }
  throw new Error(`Aucun créneau libre demain pour ${d.ref}.`);
}

/** Une vignette JPEG de 480 px, quand l'outil du système le permet (macOS : sips) ; sinon l'image elle-même. */
function vignette(fichier) {
  try {
    const dossier = mkdtempSync(path.join(tmpdir(), "bailly-vignette-"));
    const sortie = path.join(dossier, "v.jpg");
    execFileSync("sips", ["-Z", "480", "-s", "format", "jpeg", fichier, "--out", sortie], { stdio: "ignore" });
    const octets = readFileSync(sortie);
    rmSync(dossier, { recursive: true, force: true });
    return octets;
  } catch {
    return readFileSync(fichier);
  }
}

async function semerVisitePrete(d) {
  const { CATALOG } = await charger("packages/commun/src/lib/catalog.ts");
  const { PRESTATIONS } = await charger("apps/interne/src/crm/lib/tarif.ts");
  const vol = (label) => CATALOG.find((c) => c.label === label)?.volume ?? 0.5;

  // Le rendez-vous de ce matin, déjà passé : la visite est en cours chez le client.
  const debut = instantParis(jourParis(new Date()), "10:00");
  const { rows: r } = await db.query(
    `insert into crm.rendez_vous (commercial_id, dossier_id, type, titre, lieu, debut, duree_min, notes)
     select $1, d.id, 'phys', 'M. ' || c.nom, (select adresse from crm.etapes_trajet where dossier_id = d.id and genre = 'depart' order by ordre limit 1), $3, 90, 'Démonstration de la visite technique.'
       from crm.dossiers d join crm.clients c on c.id = d.client_id where d.id = $2 returning id`,
    [d.commercial_id, d.id, debut.toISOString()],
  );
  const options = PRESTATIONS.map((libelle, i) => ({ libelle, proposee: [0, 1, 3, 4, 6, 7].includes(i) }));
  const { rows: v } = await db.query(
    `insert into crm.visites (dossier_id, rendez_vous_id, commercial_id, options, formule, remarques, commencee_le, demo)
     values ($1, $2, $3, $4, 'standard', $5, $6, true) returning id`,
    [
      d.id, r[0].id, d.commercial_id, JSON.stringify(options),
      "Le client souhaite emballer lui-même les livres et le linge. Le piano reste sur place. Prévoir la protection du parquet du salon.",
      new Date(debut.getTime() + 5 * 60_000).toISOString(),
    ],
  );
  const visiteId = v[0].id;

  // Les pièces et le métré : une trentaine de mètres cubes, comme le dossier.
  const pieces = [
    ["Salon", "Grandes fenêtres sur cour ; parquet ancien à protéger.", [["Canapé 3 places", 1, false, false], ["Fauteuil", 2, false, false], ["Table basse", 1, false, true], ["Bibliothèque", 2, true, false], ["Meuble TV", 1, false, false], ["Télévision", 1, false, true], ["Vaisselier", 1, false, false], ["Tapis", 2, false, false], ["Lampadaire", 1, false, true]]],
    ["Cuisine", null, [["Réfrigérateur", 1, false, false], ["Congélateur", 1, false, false], ["Lave-vaisselle", 1, false, false], ["Table à manger", 1, true, false], ["Chaise", 6, false, false], ["Buffet", 1, false, false], ["Micro-ondes", 1, false, false], ["Carton vaisselle", 15, false, true]]],
    ["Chambre", "Armoire à démonter : porte de la chambre étroite.", [["Lit double (+ matelas)", 1, true, false], ["Armoire 3 portes", 1, true, false], ["Commode", 1, false, false], ["Table de chevet", 2, false, false], ["Miroir", 1, false, true]]],
    ["Chambre 2", null, [["Lit simple", 1, true, false], ["Armoire 2 portes", 1, true, false], ["Bureau", 1, false, false], ["Chaise de bureau", 1, false, false], ["Carton standard", 15, false, false]]],
    ["Bureau", null, [["Bureau", 1, true, false], ["Chaise de bureau", 1, false, false], ["Bibliothèque", 2, true, false], ["Carton livres", 25, false, false], ["Carton standard", 20, false, false]]],
    ["Cave", "Accès par un escalier étroit depuis la cour.", [["Vélo", 2, false, false], ["Cartons divers", 12, false, false], ["Établi", 1, true, false]]],
  ];
  const cles = {};
  for (const [i, [nom, remarque, objets]] of pieces.entries()) {
    const { rows: p } = await db.query("insert into crm.pieces (dossier_id, nom, ordre, remarque) values ($1, $2, $3, $4) returning id, cle", [d.id, nom, i + 1, remarque]);
    cles[nom] = p[0].cle;
    for (const [j, [libelle, quantite, demontage, fragile]] of objets.entries()) {
      await db.query(
        `insert into crm.inventaire (dossier_id, cle, piece_id, piece, libelle, quantite, volume, destination, demontage, fragile, ordre)
         values ($1, gen_random_uuid(), $2, $3, $4, $5, $6, 'Arrivée', $7, $8, $9)`,
        [d.id, p[0].id, nom, libelle, quantite, vol(libelle), demontage, fragile, i * 100 + j],
      );
    }
  }
  await db.query("update crm.dossiers set volume = coalesce((select sum(quantite * volume) from crm.inventaire where dossier_id = $1), 0), maj_le = now() where id = $1", [d.id]);

  // Les accès : départ et arrivée.
  await db.query(
    `update crm.etapes_trajet set etage = '3', ascenseur = true, escalier = 'droit', portage_m = 15, stationnement = 'autorisation', poids_lourd = 'oui', monte_meuble = 'non',
        acces = 'Code portail 2468, gardien sur place le matin' where dossier_id = $1 and genre = 'depart'`,
    [d.id],
  );
  await db.query(
    `update crm.etapes_trajet set etage = '2', ascenseur = false, escalier = 'etroit', portage_m = 30, stationnement = 'autorisation', poids_lourd = 'ne_sait_pas', monte_meuble = 'a_evaluer',
        acces = 'Rue piétonne : livraison avant 11 h' where dossier_id = $1 and genre = 'arrivee'`,
    [d.id],
  );

  // Quelques photos, rangées par pièce.
  const images = [
    ["Salon", "apps/interne/public/photos-crm/paris-interieur.jpg"],
    ["Salon", "apps/interne/public/photos-crm/interieur-2.jpg"],
    ["Chambre", "apps/interne/public/photos-crm/interieur-3.jpg"],
    ["Cuisine", "apps/interne/public/photos-crm/interieur-4.jpg"],
  ];
  for (const [nom, relatif] of images) {
    const cle = randomUUID();
    const fichier = path.join(RACINE, relatif);
    const base = `visites/${d.id}/${visiteId}/${cle}`;
    const octets = readFileSync(fichier);
    const { error: e1 } = await stockage.from(SEAU_PHOTOS).upload(`${base}.jpg`, octets, { contentType: "image/jpeg", upsert: true });
    const { error: e2 } = await stockage.from(SEAU_PHOTOS).upload(`${base}-v.jpg`, vignette(fichier), { contentType: "image/jpeg", upsert: true });
    if (e1 || e2) throw new Error(`Dépôt d'une photo impossible : ${(e1 ?? e2).message}`);
    await db.query(
      `insert into crm.visite_photos (cle, visite_id, piece_cle, piece_nom, chemin, chemin_vignette, type, taille, auteur_id, demo)
       values ($1, $2, $3, $4, $5, $6, 'image/jpeg', $7, $8, true)`,
      [cle, visiteId, cles[nom], nom, `${base}.jpg`, `${base}-v.jpg`, octets.length, d.commercial_id],
    );
  }
  await db.query("insert into crm.activite (dossier_id, libelle) values ($1, 'Visite technique commencée sur la tablette')", [d.id]);
  await db.query("select public.ec_projeter_dossier_crm($1), public.ec_projeter_visites_crm($1)", [d.id]);
  return { visiteId, debut };
}

await db.connect();
try {
  const d = await dossiers();
  await retirer(Object.values(d));
  if (retirerSeulement) {
    console.log("Démonstration de la visite technique retirée.");
  } else {
    const creneaux = await semerCreneaux(d[REFS.creneaux]);
    const demain = await semerDemain(d[REFS.demain]);
    const { visiteId } = await semerVisitePrete(d[REFS.signe]);
    const f = (x) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" }).format(x);
    console.log(`${REFS.creneaux} : 3 créneaux proposés — ${creneaux.map(f).join(" ; ")}`);
    console.log(`${REFS.demain} : visite réservée — ${f(demain)}`);
    console.log(`${REFS.signe} : visite ${visiteId} prête à signer — /tablette/${visiteId}/signature`);
  }
} finally {
  await db.end();
}
