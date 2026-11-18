#!/usr/bin/env node
/*
 * Sème le jeu de démonstration de l'espace client dans les tables ec_*, et
 * ses dossiers fictifs dans le CRM.
 *
 *   node scripts/semer-espace-client.mjs              sème (ou remet à zéro) le jeu fictif
 *   node scripts/semer-espace-client.mjs --catalogues ne sème que les listes de départ
 *                                                     (pièces à fournir, tutos, services)
 *   node scripts/semer-espace-client.mjs --retirer    retire tout le jeu fictif, comptes compris
 *
 * Le jeu est celui de la démonstration en mémoire (packages/commun/src/lib/
 * espace-client/seed.ts) : les profils A à F et les dossiers de la tournée de
 * cartons, datés par rapport à aujourd'hui. Chaque client fictif reçoit un
 * compte Supabase Auth sans mot de passe à son adresse @example.com, marqué
 * app_metadata = { role: "client", demo: true }, et sa ligne ec_clients est
 * marquée demo = true : c'est à ce double signe que l'application reconnaît
 * les profils qu'elle peut ouvrir sans boîte mail.
 *
 * Un dossier, deux faces (migration 0012) : chaque dossier fictif de
 * l'espace est relié à un dossier fictif du CRM, du même numéro. Le client,
 * le trajet, les dates, les devis, les factures et les paiements du jeu sont
 * semés dans le CRM, puis reviennent dans l'espace par la projection
 * (ec_projeter_dossier_crm) — exactement comme en production. Le reste
 * (documents, conditions de livraison, déclaration de valeurs, CGV, cartons,
 * SAV) est semé dans l'espace. Le commercial de chaque dossier est l'un des
 * commerciaux du CRM.
 *
 * Garde-fous : le script ne touche qu'aux lignes du jeu fictif (clients
 * demo = true en @example.com, leurs dossiers, les conseillers demo, les
 * dossiers du CRM de ces clients, en @example.com et marqués comme fictifs)
 * et aux comptes Auth qu'il a créés. Une adresse du jeu déjà prise par un
 * compte qui n'est pas un client fictif arrête tout, sans rien modifier ; un
 * numéro de dossier déjà pris dans le CRM par un vrai dossier aussi. Les
 * listes de départ ne sont qu'ajoutées si elles manquent : une liste
 * retouchée par l'équipe reste telle quelle.
 *
 * Variables : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et
 * DATABASE_URL (le pooler en mode session, pour le CRM), prises dans
 * l'environnement ou dans .env.local à la racine du dépôt.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import ts from "typescript";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = new Set(process.argv.slice(2));

if ((!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.DATABASE_URL) && existsSync(path.join(RACINE, ".env.local"))) process.loadEnvFile(path.join(RACINE, ".env.local"));
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SUPABASE || !CLE || !process.env.DATABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et DATABASE_URL sont nécessaires (environnement ou .env.local).");
  process.exit(1);
}
const db = createClient(URL_SUPABASE, CLE, { auth: { persistSession: false, autoRefreshToken: false } });

/** La connexion au CRM : le schéma crm, comme le pool du CRM (apps/interne/src/crm/lib/db.ts). */
const crm = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  application_name: "bailly-semis-espace-client",
});

/** La marque des clients fictifs du CRM, dans leurs notes : le retrait ne touche qu'à eux. */
const MARQUE_CRM = "Client fictif du jeu de démonstration de l'espace client (scripts/semer-espace-client.mjs).";

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

/** Les clients fictifs déjà en table, et leurs dossiers (avec le dossier du CRM de chacun). */
async function lignesFictives() {
  const clients = await verifier(db.from("ec_clients").select("id, email, auth_user_id").eq("demo", true).like("email", "%@example.com"), "Lecture des clients fictifs");
  const ids = clients.map((c) => c.id);
  const dossiers = ids.length ? await verifier(db.from("ec_dossiers").select("id, crm_dossier_id").in("client_id", ids), "Lecture des dossiers fictifs") : [];
  return { clients, dossiers: dossiers.map((d) => d.id), crm: dossiers.map((d) => d.crm_dossier_id).filter((x) => typeof x === "number") };
}

/**
 * Retire du CRM les dossiers fictifs reliés aux espaces fictifs, puis leurs
 * clients s'ils n'ont plus de dossier. Seuls partent les dossiers dont le
 * client est en @example.com et marqué fictif : un vrai dossier, même relié
 * par erreur, reste.
 */
async function viderCrmFictif(ids) {
  if (!ids.length) return 0;
  const { rows } = await crm.query(
    `delete from crm.dossiers d using crm.clients c
      where d.client_id = c.id and d.id = any($1::int[]) and c.email ilike '%@example.com' and c.notes = $2
      returning d.client_id`,
    [ids, MARQUE_CRM],
  );
  await crm.query(
    `delete from crm.clients c where c.notes = $1 and c.email ilike '%@example.com' and not exists (select 1 from crm.dossiers d where d.client_id = c.id)`,
    [MARQUE_CRM],
  );
  return rows.length;
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

/**
 * La colonne `condition` des pièces (migration 0021) existe-t-elle ? Sans
 * elle, une pièce conditionnelle serait demandée à tous : elle n'est pas
 * semée (scripts/pieces-cimob.mjs le fera, une fois la migration appliquée).
 */
async function avecConditions() {
  const { error } = await db.from("ec_document_requirements").select("condition").limit(1);
  return !error;
}

async function semerCatalogues(jeu) {
  const d = jeu.amorcer(new Date());
  const avecId = (lignes) => lignes.map((l) => ({ ...l, id: uuidDe(l.id) }));
  const conditions = await avecConditions();
  // Avant 0021 : pas de colonne `condition`, et pas de pièce qui en a une.
  const pieces = conditions ? d.document_requirements : d.document_requirements.filter((p) => !p.condition).map(({ condition: _, ...p }) => p);
  for (const [table, lignes] of [["ec_document_requirements", pieces], ["ec_tutos", d.tutos], ["ec_services", d.services]]) {
    await verifier(db.from(table).upsert(avecId(lignes), { onConflict: "id", ignoreDuplicates: true }), `Listes de départ (${table})`);
  }
  console.log(`Listes de départ : ${pieces.length} pièces, ${d.tutos.length} tutos, ${d.services.length} services (ajoutés s'ils manquaient).`);
  if (!conditions) console.log(`Migration 0021 absente : ${d.document_requirements.length - pieces.length} pièces conditionnelles (CIMOB/DICOM) non semées.`);
}

// --- Le jeu dans le CRM ------------------------------------------------------------------------

/** Le type de client du CRM d'un segment de l'espace. */
const TYPE_CRM = { particulier: "particulier", grand_compte: "compte", militaire: "militaire", logement_social: "logement_social" };

/** Les formules du jeu, dans les trois formules du CRM. */
const FORMULE_CRM = {
  Essentielle: "economique",
  Confort: "standard",
  Standard: "standard",
  "Porte à porte international": "premium",
  "Groupage international": "economique",
  "Mobilité collaborateur": "standard",
};

const STATUT_DEVIS_CRM = { envoye: "envoye", accepte: "signe", refuse: "refuse", expire: "envoye" };
const arrondi = (n) => Math.round(n * 100) / 100;

/** Le statut du dossier dans le CRM, d'après ce que le jeu en dit. */
function statutCrm(dossier, devis, client) {
  if (dossier.statut === "termine") return "termine";
  if (devis.some((v) => v.statut === "accepte") || (client.type === "militaire" && dossier.commande_le)) return dossier.statut === "planifie" ? "planifie" : "commande";
  if (devis.some((v) => v.statut === "envoye")) return "devis";
  return dossier.statut === "planifie" ? "planifie" : "visite";
}

/** Le prochain numéro d'une série du CRM, à la manière du CRM (le plus grand, plus un). */
async function prochainNumeroCrm(prefixe, annee) {
  const { rows } = await crm.query(
    "select coalesce(max(substring(numero from '[0-9]+$')::int), 0) + 1 as n from crm.factures where numero like $1",
    [`${prefixe}-${annee}-%`],
  );
  return `${prefixe}-${annee}-${String(rows[0].n).padStart(4, "0")}`;
}

/**
 * Sème un dossier du jeu dans le CRM : son client, son trajet, ses devis, ses
 * paiements (les arrhes) et ses factures. Rend l'identifiant du dossier CRM.
 */
async function semerDansLeCrm(d, dossier, commerciaux) {
  const client = d.clients.find((c) => c.id === dossier.client_id);
  const devis = d.devis.filter((v) => v.dossier_id === dossier.id);
  const factures = d.factures.filter((f) => f.dossier_id === dossier.id);

  const deja = await crm.query("select d.id, c.email, c.notes from crm.dossiers d join crm.clients c on c.id = d.client_id where d.ref = $1", [dossier.reference]);
  if (deja.rows.length && !(fictive(deja.rows[0].email ?? "") && deja.rows[0].notes === MARQUE_CRM)) {
    throw new Error(`Le numéro ${dossier.reference} est déjà celui d'un vrai dossier du CRM : rien n'est semé.`);
  }
  if (deja.rows.length) await viderCrmFictif([deja.rows[0].id]);

  const { rows: [c] } = await crm.query(
    "insert into crm.clients(type,civilite,prenom,nom,societe,email,telephone,notes) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [TYPE_CRM[client.type], client.civilite, client.prenom || null, client.nom, client.societe, client.email, client.telephone, MARQUE_CRM],
  );
  const commercial = commerciaux.length ? commerciaux[client.conseiller_id === "eq-marc" ? 1 % commerciaux.length : 0] : null;
  const international = dossier.portee === "international";
  const { rows: [x] } = await crm.query(
    `insert into crm.dossiers(ref,client_id,commercial_id,statut,mois_ca,date_chargement,date_livraison,volume,observations,type_demenagement,cree_le)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [
      dossier.reference, c.id, commercial, statutCrm(dossier, devis, client), `${dossier.periode_debut.slice(0, 7)}-01`, dossier.periode_debut, dossier.periode_fin,
      dossier.volume_m3, "Dossier fictif du jeu de démonstration de l'espace client.",
      international ? (dossier.mode_transport === "route" ? "international" : dossier.mode_transport) : "national", dossier.created_at,
    ],
  );
  await crm.query(
    "insert into crm.etapes_trajet(dossier_id,ordre,genre,adresse) values($1,0,'depart',$2),($1,1,'arrivee',$3)",
    [x.id, dossier.adresse_depart, dossier.adresse_arrivee],
  );

  // Les devis : les montants du CRM sont TTC, ses lignes aussi.
  for (const v of devis) {
    const lignes = v.lignes.map((l) => ({ libelle: l.libelle, prix: arrondi(l.montant_ht * 1.2), charge: "bailly", ...(l.detail ? { detail: l.detail } : {}) }));
    await crm.query(
      `insert into crm.devis(dossier_id,numero,formule,lignes,montant,statut,envoye_le,signe_le,cree_le,validite)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [x.id, v.numero, FORMULE_CRM[v.formule] ?? "standard", JSON.stringify(lignes), v.montant_ttc, STATUT_DEVIS_CRM[v.statut], `${v.emis_le}T09:00:00Z`,
        v.accepte_le ? `${v.accepte_le}T18:00:00Z` : null, `${v.emis_le}T09:00:00Z`, v.valide_jusqu_au],
    );
  }
  // Les arrhes réglées sont des paiements du CRM ; le solde et le garde-meubles, des factures.
  for (const f of factures) {
    if (f.type === "arrhes") {
      if (f.statut === "payee") await crm.query("insert into crm.paiements(dossier_id,libelle,montant,recu_le) values($1,'Arrhes 30 %',$2,$3)", [x.id, f.montant_ttc, f.payee_le]);
      continue;
    }
    const numero = await prochainNumeroCrm("FA", f.emise_le.slice(0, 4));
    await crm.query(
      "insert into crm.factures(dossier_id,numero,objet,montant,statut,emise_le,payee_le) values($1,$2,$3,$4,$5,$6,$7)",
      [x.id, numero, f.libelle, f.montant_ttc, f.statut === "payee" ? "payee" : f.statut === "en_retard" ? "retard" : "emise", f.emise_le, f.payee_le],
    );
  }
  await crm.query("insert into crm.activite(dossier_id,libelle) values($1,'Dossier fictif semé pour la démonstration de l''espace client')", [x.id]);
  return x.id;
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

  // 1. Remise à zéro : les dossiers fictifs déjà semés partent, avec ce qui s'y rattache, dans l'espace et dans le CRM.
  const avant = await lignesFictives();
  await viderDossiersFictifs(avant.dossiers);
  const retires = await viderCrmFictif(avant.crm);

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

  // 4. Chaque dossier dans le CRM, puis son espace relié à lui.
  const commerciaux = (await crm.query("select id from crm.utilisateurs where role = 'commercial' order by id")).rows.map((r) => r.id);
  const relies = [];
  for (const dossier of d.dossiers) {
    const crmId = await semerDansLeCrm(d, dossier, commerciaux);
    relies.push(crmId);
    await verifier(db.from("ec_dossiers").insert({ ...lien(dossier), crm_dossier_id: crmId }), `Dossier fictif ${dossier.reference}`);
  }

  // 5. Ce qui est propre à l'espace. Les devis et les factures n'y sont pas semés : ils viennent du CRM.
  const ordre = ["documents", "acceptations", "declarations_valeurs", "conditions_livraison", "livraisons_cartons", "sav_declarations", "notifications"];
  const comptes = { dossiers: d.dossiers.length };
  for (const t of ordre) {
    const lignes = d[t].map(lien);
    if (lignes.length) await verifier(db.from(`ec_${t}`).insert(lignes), `Jeu fictif (ec_${t})`);
    comptes[t] = lignes.length;
  }

  // 6. La projection : devis, factures, client et trajet reviennent du CRM ; puis, depuis la migration 0021, la
  //    situation (repli, véhicules, outre-mer), qui manque sans rien bloquer tant qu'elle n'est pas appliquée.
  for (const crmId of relies) await crm.query("select public.ec_projeter_dossier_crm($1)", [crmId]);
  for (const crmId of relies) {
    try {
      await crm.query("select public.ec_projeter_situation_crm($1)", [crmId]);
    } catch {
      break;
    }
  }
  // Le conseiller présenté est désormais le commercial du CRM : les conseillers fictifs
  // du jeu (Nadia, Marc), qui ne servent qu'à la démonstration en mémoire, partent.
  await crm.query("delete from public.ec_conseillers k where k.demo and not exists (select 1 from public.ec_clients c where c.conseiller_id = k.id)");

  console.log(`Jeu fictif semé : ${clients.length} clients (comptes Auth en @example.com), ${d.conseillers.length} conseillers fictifs,`, comptes);
  console.log(`CRM : ${relies.length} dossiers fictifs reliés${retires ? ` (${retires} anciens retirés)` : ""}, commerciaux ${commerciaux.slice(0, 2).join(" et ") || "aucun"}.`);
  console.log("Profils : " + jeu.PROFILS_DEMO.map((p) => `${p.lettre} ${p.email} (${p.reference})`).join(" · "));
}

async function retirer() {
  const { clients, dossiers, crm: relies } = await lignesFictives();
  await viderDossiersFictifs(dossiers);
  const crmRetires = await viderCrmFictif(relies);
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
  console.log(`Jeu fictif retiré : ${dossiers.length} dossiers, ${clients.length} clients, ${comptes} comptes Auth, ${libres.length} conseillers, ${crmRetires} dossiers du CRM.`);
}

try {
  await crm.connect();
  const jeu = await chargerJeu();
  if (options.has("--retirer")) await retirer();
  else if (options.has("--catalogues")) await semerCatalogues(jeu);
  else await semer(jeu);
} catch (e) {
  console.error(`Échec : ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await crm.end().catch(() => undefined);
}
