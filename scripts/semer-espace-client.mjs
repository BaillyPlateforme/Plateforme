#!/usr/bin/env node
/*
 * Sème le jeu de démonstration de l'espace client dans les tables ec_*.
 *
 *   node scripts/semer-espace-client.mjs              sème (ou remet à zéro) le jeu fictif
 *   node scripts/semer-espace-client.mjs --catalogues ne sème que les listes de départ
 *                                                     (pièces à fournir, tutos, services)
 *   node scripts/semer-espace-client.mjs --retirer    retire tout le jeu fictif, comptes compris
 *
 * Le jeu est celui de la démonstration en mémoire (packages/commun/src/lib/
 * espace-client/seed.ts) : les profils A à D et les dossiers E à I, datés par
 * rapport à aujourd'hui. Chaque client fictif reçoit un compte Supabase Auth
 * sans mot de passe à son adresse @example.com, marqué
 * app_metadata = { role: "client", demo: true }, et sa ligne ec_clients est
 * marquée demo = true : c'est à ce double signe que l'application reconnaît
 * les profils qu'elle peut ouvrir sans boîte mail.
 *
 * Garde-fous : le script ne touche qu'aux lignes du jeu fictif (clients
 * demo = true en @example.com, leurs dossiers, les conseillers demo) et aux
 * comptes Auth qu'il a créés. Une adresse du jeu déjà prise par un compte qui
 * n'est pas un client fictif arrête tout, sans rien modifier. Les listes de
 * départ ne sont qu'ajoutées si elles manquent : une liste retouchée par
 * l'équipe reste telle quelle.
 *
 * Variables : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, prises
 * dans l'environnement ou dans .env.local à la racine du dépôt.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = new Set(process.argv.slice(2));

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(path.join(RACINE, ".env.local"))) process.loadEnvFile(path.join(RACINE, ".env.local"));
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SUPABASE || !CLE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires (environnement ou .env.local).");
  process.exit(1);
}
const db = createClient(URL_SUPABASE, CLE, { auth: { persistSession: false, autoRefreshToken: false } });

/** Le jeu de seed.ts : le fichier n'importe que des types, il se transpile tel quel. */
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

/** Un UUID stable pour chaque identifiant du jeu (« do-a ») : semer deux fois donne les mêmes lignes. */
function uuidDe(id) {
  const h = createHash("sha1").update(`bailly-espace-client-demo:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const fictive = (email) => /@example\.com$/i.test(email);

async function verifier(r, quoi) {
  const { data, error } = await r;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data;
}

/** Les clients fictifs déjà en table, et leurs dossiers. */
async function lignesFictives() {
  const clients = await verifier(db.from("ec_clients").select("id, email, auth_user_id").eq("demo", true).like("email", "%@example.com"), "Lecture des clients fictifs");
  const ids = clients.map((c) => c.id);
  const dossiers = ids.length ? await verifier(db.from("ec_dossiers").select("id").in("client_id", ids), "Lecture des dossiers fictifs") : [];
  return { clients, dossiers: dossiers.map((d) => d.id) };
}

/** Retire les dossiers fictifs, leurs messages et leurs fichiers. Les clients, eux, restent (sauf --retirer). */
async function viderDossiersFictifs(dossiers) {
  if (!dossiers.length) return;
  await verifier(db.from("ec_notifications").delete().in("dossier_id", dossiers), "Retrait du journal fictif");
  for (const id of dossiers) {
    for (const sous of ["", "/acces", "/sav"]) {
      const { data } = await db.storage.from("espace-client").list(`fichiers/${id}${sous}`, { limit: 1000 });
      const chemins = (data ?? []).filter((f) => f.id).map((f) => `fichiers/${id}${sous}/${f.name}`);
      if (chemins.length) await db.storage.from("espace-client").remove(chemins);
    }
  }
  await verifier(db.from("ec_dossiers").delete().in("id", dossiers), "Retrait des dossiers fictifs");
}

/** Le compte Auth d'un client fictif : créé s'il manque, repris s'il est bien fictif, sinon refus. */
async function compteFictif(email) {
  const existant = (await verifier(db.rpc("ec_compte_auth", { p_email: email }), "Lecture des comptes"))?.[0];
  if (existant) {
    const { data } = await db.auth.admin.getUserById(existant.id);
    const m = data?.user?.app_metadata ?? {};
    if (m.role !== "client" || m.demo !== true) throw new Error(`${email} appartient déjà à un compte qui n'est pas un client fictif : rien n'est modifié.`);
    return existant.id;
  }
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "client", demo: true } });
  if (error) throw new Error(`Création du compte ${email} impossible : ${error.message}`);
  return data.user.id;
}

async function semerCatalogues(jeu) {
  const d = jeu.amorcer(new Date());
  const avecId = (lignes) => lignes.map((l) => ({ ...l, id: uuidDe(l.id) }));
  for (const [table, lignes] of [["ec_document_requirements", d.document_requirements], ["ec_tutos", d.tutos], ["ec_services", d.services]]) {
    await verifier(db.from(table).upsert(avecId(lignes), { onConflict: "id", ignoreDuplicates: true }), `Listes de départ (${table})`);
  }
  console.log(`Listes de départ : ${d.document_requirements.length} pièces, ${d.tutos.length} tutos, ${d.services.length} services (ajoutés s'ils manquaient).`);
}

async function semer(jeu) {
  const d = jeu.amorcer(new Date());
  const inconnues = d.clients.filter((c) => !fictive(c.email));
  if (inconnues.length) throw new Error(`Adresses non fictives dans le jeu : ${inconnues.map((c) => c.email).join(", ")}.`);

  // Les identifiants du jeu deviennent des UUID stables, et les références suivent.
  const ids = new Map();
  for (const t of Object.keys(d)) if (Array.isArray(d[t])) for (const l of d[t]) if (l && typeof l.id === "string") ids.set(l.id, uuidDe(l.id));
  const u = (v) => (v == null ? v : (ids.get(v) ?? v));
  const lien = (l) => {
    const out = { ...l, id: u(l.id) };
    for (const k of ["client_id", "dossier_id", "conseiller_id", "devis_id", "requirement_id", "cible_id", "created_by"]) if (k in out) out[k] = u(out[k]);
    if (Array.isArray(out.photos)) out.photos = out.photos.map((p) => ({ ...p, id: u(p.id) }));
    return out;
  };

  // 1. Remise à zéro : les dossiers fictifs déjà semés partent, avec ce qui s'y rattache.
  const avant = await lignesFictives();
  await viderDossiersFictifs(avant.dossiers);

  // 2. Les listes de départ, les conseillers fictifs.
  await semerCatalogues(jeu);
  await verifier(db.from("ec_conseillers").upsert(d.conseillers.map((c) => ({ ...lien(c), demo: true })), { onConflict: "id" }), "Conseillers fictifs");

  // 3. Les clients et leurs comptes.
  const deja = new Map(avant.clients.map((c) => [c.email, c]));
  const clients = [];
  for (const c of d.clients) {
    const compte = deja.get(c.email)?.auth_user_id ?? (await compteFictif(c.email));
    clients.push({ ...lien(c), auth_user_id: compte, demo: true, sessions_revoquees_le: null });
  }
  await verifier(db.from("ec_clients").upsert(clients, { onConflict: "id" }), "Clients fictifs");

  // 4. Les dossiers et tout ce qui s'y rattache, dans l'ordre des clés étrangères.
  const ordre = ["dossiers", "devis", "factures", "documents", "acceptations", "declarations_valeurs", "conditions_livraison", "livraisons_cartons", "sav_declarations", "notifications"];
  const comptes = {};
  for (const t of ordre) {
    const lignes = d[t].map(lien);
    if (lignes.length) await verifier(db.from(`ec_${t}`).insert(lignes), `Jeu fictif (ec_${t})`);
    comptes[t] = lignes.length;
  }
  console.log(`Jeu fictif semé : ${clients.length} clients (comptes Auth en @example.com), ${d.conseillers.length} conseillers fictifs,`, comptes);
  console.log("Profils : " + jeu.PROFILS_DEMO.map((p) => `${p.lettre} ${p.email} (${p.reference})`).join(" · "));
}

async function retirer() {
  const { clients, dossiers } = await lignesFictives();
  await viderDossiersFictifs(dossiers);
  if (clients.length) await verifier(db.from("ec_clients").delete().in("id", clients.map((c) => c.id)), "Retrait des clients fictifs");
  let comptes = 0;
  for (const c of clients) {
    if (!c.auth_user_id) continue;
    const { data } = await db.auth.admin.getUserById(c.auth_user_id);
    const m = data?.user?.app_metadata ?? {};
    // Seul un compte de client fictif, à une adresse fictive, est supprimé.
    if (data?.user && m.role === "client" && m.demo === true && fictive(data.user.email ?? "")) {
      await db.auth.admin.deleteUser(c.auth_user_id);
      comptes += 1;
    }
  }
  const restants = await verifier(db.from("ec_clients").select("conseiller_id"), "Lecture des clients");
  const utilises = new Set(restants.map((c) => c.conseiller_id));
  const fictifs = await verifier(db.from("ec_conseillers").select("id").eq("demo", true), "Lecture des conseillers");
  const libres = fictifs.map((c) => c.id).filter((id) => !utilises.has(id));
  if (libres.length) await verifier(db.from("ec_conseillers").delete().in("id", libres), "Retrait des conseillers fictifs");
  console.log(`Jeu fictif retiré : ${dossiers.length} dossiers, ${clients.length} clients, ${comptes} comptes Auth, ${libres.length} conseillers.`);
}

try {
  const jeu = await chargerJeu();
  if (options.has("--retirer")) await retirer();
  else if (options.has("--catalogues")) await semerCatalogues(jeu);
  else await semer(jeu);
} catch (e) {
  console.error(`Échec : ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
