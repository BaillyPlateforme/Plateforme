#!/usr/bin/env node
/*
 * Pose sur une base les pièces CIMOB/DICOM de Céline (mail du 17/11/2026) et
 * leurs modèles à télécharger.
 *
 *   node scripts/pieces-cimob.mjs <dossier des modèles>                    pièces et modèles
 *   node scripts/pieces-cimob.mjs <dossier des modèles> --essai            dit ce qui serait fait, sans rien écrire
 *   node scripts/pieces-cimob.mjs <dossier des modèles> --avec-inventaire  rattache aussi l'inventaire-déclaration
 *                                                                          aux deux déclarations de valeurs (à valider
 *                                                                          avec Céline d'abord)
 *   node scripts/pieces-cimob.mjs --sans-modeles                           les pièces seules
 *
 * Ce qu'il fait, dans l'ordre :
 *   1. vérifie que la migration 0021 est appliquée (colonne `condition`,
 *      table ec_modeles_pieces, seau « espace-client-modeles ») — sinon il
 *      s'arrête sans rien écrire ;
 *   2. crée ou met à jour les pièces du segment militaire, telles que les
 *      écrit packages/commun/src/lib/espace-client/seed.ts (PIECES_PAR_DEFAUT) :
 *      une pièce retouchée depuis l'éditeur du CRM reprend le texte de Céline ;
 *   3. retire les deux pièces provisoires (« Ordre de mutation », « Carte
 *      militaire ») : un document déjà déposé pour elles reste au dossier,
 *      détaché de sa pièce (la base met requirement_id à null) ;
 *   4. charge les modèles du dossier donné vers le seau privé et les rattache
 *      à leur pièce (seed.ts, MODELES_CIMOB). Chaque fichier est rangé sous
 *      l'empreinte de son contenu : un fichier inchangé n'est pas renvoyé, un
 *      fichier modifié remplace l'ancien, qui est retiré du seau. Les fichiers
 *      du dossier qui ne sont rattachés à aucune pièce sont seulement cités ;
 *   5. projette la situation (repli, véhicules, outre-mer) de tous les espaces
 *      reliés au CRM, pour que les pièces conditionnelles soient justes tout
 *      de suite.
 *
 * Idempotent : le relancer ne crée rien deux fois. Les identifiants des
 * pièces et des modèles sont ceux du semis des catalogues
 * (scripts/semer-espace-client.mjs) : une pièce déjà semée par lui est
 * reconnue, pas dédoublée.
 *
 * Les fichiers ne sont JAMAIS dans le dépôt Git, qui est public : on les
 * passe par un dossier local (les pièces jointes du mail de Céline).
 *
 * Variables : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, prises
 * dans l'environnement ou dans .env.local à la racine du dépôt — celles de la
 * base visée (recette ou production).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const options = new Set(args.filter((a) => a.startsWith("--")));
const dossierModeles = args.find((a) => !a.startsWith("--")) ?? null;
const essai = options.has("--essai");
const sansModeles = options.has("--sans-modeles");
const avecInventaire = options.has("--avec-inventaire");

/** Le seau privé des modèles (migration 0021, packages/commun/src/lib/espace-client/fichiers.ts). */
const SEAU = "espace-client-modeles";
/** La limite du seau. */
const TAILLE_MAX = 10 * 1024 * 1024;

if (!dossierModeles && !sansModeles) {
  console.error("Usage : node scripts/pieces-cimob.mjs <dossier des modèles> [--essai] [--avec-inventaire]   (ou --sans-modeles)");
  process.exit(1);
}
if (dossierModeles && !(existsSync(dossierModeles) && statSync(dossierModeles).isDirectory())) {
  console.error(`Dossier des modèles introuvable : ${dossierModeles}`);
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(path.join(RACINE, ".env.local"))) process.loadEnvFile(path.join(RACINE, ".env.local"));
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SUPABASE || !CLE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires (environnement ou .env.local).");
  process.exit(1);
}
const db = createClient(URL_SUPABASE, CLE, { auth: { persistSession: false, autoRefreshToken: false } });

/** seed.ts n'importe que des types : il se transpile et se charge tel quel (comme dans semer-espace-client.mjs). */
async function chargerJeu() {
  const source = readFileSync(path.join(RACINE, "packages/commun/src/lib/espace-client/seed.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const dossier = mkdtempSync(path.join(tmpdir(), "bailly-seed-"));
  const fichier = path.join(dossier, "seed.mjs");
  writeFileSync(fichier, outputText);
  try {
    return await import(pathToFileURL(fichier).href);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/** Le même UUID stable que scripts/semer-espace-client.mjs pour un identifiant du jeu (« rq-cimob-cerfa »). */
function uuidDe(id) {
  const h = createHash("sha1").update(`bailly-espace-client-demo:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

/** Le nom rangé dans le seau : la règle de nomPropre (packages/commun/src/lib/espace-client/fichiers.ts). */
const nomPropre = (nom) =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80) || "fichier";

async function verifier(r, quoi) {
  const { data, error } = await r;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data;
}

const faire = async (quoi, fn) => {
  if (essai) {
    console.log(`  (essai) ${quoi}`);
    return;
  }
  await fn();
  console.log(`  ${quoi}`);
};

// --- 1. La migration 0021 ------------------------------------------------------------------------

async function exigerMigration() {
  const manques = [];
  if ((await db.from("ec_document_requirements").select("condition").limit(1)).error) manques.push("la colonne ec_document_requirements.condition");
  if ((await db.from("ec_modeles_pieces").select("id").limit(1)).error) manques.push("la table ec_modeles_pieces");
  if (!sansModeles && (await db.storage.getBucket(SEAU)).error) manques.push(`le seau « ${SEAU} »`);
  if (manques.length) {
    throw new Error(
      `la migration 0021 n'est pas appliquée sur cette base (il manque ${manques.join(", ")}). ` +
        "Appliquez-la d'abord : node scripts/appliquer-migrations.mjs (DATABASE_URL de la même base). Rien n'a été écrit.",
    );
  }
}

// --- 2 et 3. Les pièces --------------------------------------------------------------------------

const CHAMPS = ["pays", "segment", "condition", "libelle", "description", "obligatoire", "ordre"];

async function poserPieces(jeu) {
  const pieces = jeu.PIECES_PAR_DEFAUT.filter((p) => p.segment === "militaire").map((p) => ({
    id: uuidDe(p.id), pays: p.pays, segment: p.segment, condition: p.condition ?? null, libelle: p.libelle, description: p.description, obligatoire: p.obligatoire, ordre: p.ordre,
  }));
  const existantes = new Map(
    (await verifier(db.from("ec_document_requirements").select("*").in("id", pieces.map((p) => p.id)), "Lecture des pièces")).map((p) => [p.id, p]),
  );
  const nouvelles = pieces.filter((p) => !existantes.has(p.id));
  const changees = pieces.filter((p) => existantes.has(p.id) && CHAMPS.some((k) => (existantes.get(p.id)[k] ?? null) !== (p[k] ?? null)));
  console.log(`Pièces CIMOB/DICOM : ${pieces.length} dans la liste de Céline — ${nouvelles.length} à créer, ${changees.length} à mettre à jour, ${pieces.length - nouvelles.length - changees.length} déjà à jour.`);
  for (const p of nouvelles) await faire(`créée : ${p.libelle}${p.condition ? ` (seulement : ${p.condition})` : ""}`, () => verifier(db.from("ec_document_requirements").insert(p), `Création de « ${p.libelle} »`));
  for (const p of changees) {
    const avant = existantes.get(p.id);
    const quoi = CHAMPS.filter((k) => (avant[k] ?? null) !== (p[k] ?? null)).join(", ");
    await faire(`mise à jour : ${p.libelle} (${quoi})`, () => verifier(db.from("ec_document_requirements").update(p).eq("id", p.id), `Mise à jour de « ${p.libelle} »`));
  }

  // Les deux pièces provisoires : par leur identifiant de semis, ou par leur libellé dans le segment militaire.
  const ids = new Set(pieces.map((p) => p.id));
  const provisoires = jeu.PIECES_PROVISOIRES_RETIREES;
  const parId = await verifier(db.from("ec_document_requirements").select("id, libelle").in("id", provisoires.map((p) => uuidDe(p.id))), "Lecture des pièces provisoires");
  const parLibelle = await verifier(
    db.from("ec_document_requirements").select("id, libelle").eq("segment", "militaire").in("libelle", provisoires.map((p) => p.libelle)),
    "Lecture des pièces provisoires",
  );
  const aRetirer = [...new Map([...parId, ...parLibelle].filter((p) => !ids.has(p.id)).map((p) => [p.id, p])).values()];
  if (!aRetirer.length) console.log("Pièces provisoires : aucune à retirer.");
  for (const p of aRetirer) {
    const { count } = await db.from("ec_documents").select("id", { count: "exact", head: true }).eq("requirement_id", p.id);
    await faire(
      `retirée : ${p.libelle}${count ? ` — ${count} document(s) déjà déposé(s) restent au dossier, sans pièce` : ""}`,
      () => verifier(db.from("ec_document_requirements").delete().eq("id", p.id), `Retrait de « ${p.libelle} »`),
    );
  }
}

// --- 4. Les modèles ------------------------------------------------------------------------------

async function poserModeles(jeu) {
  const voulus = [...jeu.MODELES_CIMOB, ...(avecInventaire ? jeu.MODELES_CIMOB_A_VALIDER : [])];
  const presents = readdirSync(dossierModeles).filter((f) => !f.startsWith(".") && statSync(path.join(dossierModeles, f)).isFile());
  const existants = new Map(
    (await verifier(db.from("ec_modeles_pieces").select("*").in("id", voulus.map((m) => uuidDe(m.id))), "Lecture des modèles")).map((m) => [m.id, m]),
  );
  console.log(`Modèles : ${voulus.length} rattachés à une pièce${avecInventaire ? " (inventaire-déclaration compris)" : ""}.`);
  const absents = [];
  for (const m of voulus) {
    const source = path.join(dossierModeles, m.fichier);
    if (!existsSync(source)) {
      absents.push(m.fichier);
      continue;
    }
    const octets = readFileSync(source);
    if (octets.length > TAILLE_MAX) throw new Error(`« ${m.fichier} » dépasse 10 Mo : le seau le refuserait.`);
    const empreinte = createHash("sha256").update(octets).digest("hex");
    const pieceId = uuidDe(m.piece);
    const ligne = {
      id: uuidDe(m.id), requirement_id: pieceId, libelle: m.libelle, chemin: `modeles/${pieceId}/${empreinte.slice(0, 12)}-${nomPropre(m.fichier)}`,
      nom_fichier: m.fichier, mime: m.mime, taille_octets: octets.length, ordre: m.ordre, created_by: "scripts/pieces-cimob.mjs",
    };
    const avant = existants.get(ligne.id);
    if (avant && avant.chemin === ligne.chemin && avant.libelle === ligne.libelle && avant.ordre === ligne.ordre && avant.requirement_id === ligne.requirement_id) {
      console.log(`  inchangé : ${m.fichier} → ${m.piece} (${m.libelle})`);
      continue;
    }
    await faire(`${avant ? "remplacé" : "ajouté"} : ${m.fichier} → ${m.piece} (${m.libelle}, ${Math.round(octets.length / 1024)} Ko)`, async () => {
      if (!avant || avant.chemin !== ligne.chemin) {
        // Rangé sous l'empreinte du contenu : le même chemin, c'est le même fichier.
        await verifier(db.storage.from(SEAU).upload(ligne.chemin, octets, { contentType: m.mime, upsert: true }), `Envoi de « ${m.fichier} »`);
      }
      await verifier(db.from("ec_modeles_pieces").upsert({ ...ligne, created_at: new Date().toISOString() }, { onConflict: "id" }), `Rattachement de « ${m.fichier} »`);
      if (avant && avant.chemin !== ligne.chemin) await db.storage.from(SEAU).remove([avant.chemin]);
    });
  }
  if (absents.length) console.log(`  absents du dossier, laissés tels quels : ${absents.join(", ")}`);
  const rattaches = new Set([...jeu.MODELES_CIMOB, ...jeu.MODELES_CIMOB_A_VALIDER].map((m) => m.fichier));
  const libres = presents.filter((f) => !rattaches.has(f));
  if (libres.length) console.log(`  non rattachés à une pièce (à valider avec Céline), non chargés : ${libres.join(", ")}`);
  if (!avecInventaire) {
    const enAttente = jeu.MODELES_CIMOB_A_VALIDER.map((m) => m.fichier).filter((f, i, t) => t.indexOf(f) === i && presents.includes(f));
    if (enAttente.length) console.log(`  en attente de Céline (option --avec-inventaire) : ${enAttente.join(", ")}`);
  }
}

// --- 5. La situation des espaces reliés ------------------------------------------------------------

async function projeterSituations() {
  const relies = (await verifier(db.from("ec_dossiers").select("crm_dossier_id").not("crm_dossier_id", "is", null).limit(5000), "Lecture des espaces reliés"))
    .map((x) => x.crm_dossier_id);
  if (essai) {
    console.log(`  (essai) situation projetée pour ${relies.length} espace(s) relié(s) au CRM`);
    return;
  }
  let echecs = 0;
  for (const id of relies) {
    const { error } = await db.rpc("ec_projeter_situation_crm", { p_crm: id });
    if (error) echecs += 1;
  }
  console.log(`Situation (repli, véhicules, outre-mer) projetée pour ${relies.length - echecs} espace(s) relié(s) au CRM${echecs ? `, ${echecs} en échec (tables CIMOB/DICOM du CRM absentes ?)` : ""}.`);
}

try {
  console.log(`Base : ${new URL(URL_SUPABASE).host}${essai ? " — ESSAI, rien n'est écrit" : ""}`);
  const jeu = await chargerJeu();
  await exigerMigration();
  await poserPieces(jeu);
  if (!sansModeles) await poserModeles(jeu);
  await projeterSituations();
  console.log(essai ? "Essai terminé : relancez sans --essai pour écrire." : "Terminé.");
} catch (e) {
  console.error(`Échec : ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}
