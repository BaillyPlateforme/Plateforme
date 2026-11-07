#!/usr/bin/env node
/*
 * Applique les migrations manquantes de supabase/migrations/ sur la base de
 * DATABASE_URL, et consigne chacune dans public.schema_migrations.
 *
 *   node scripts/appliquer-migrations.mjs            applique ce qui manque
 *   node scripts/appliquer-migrations.mjs --essai    dit ce qui serait appliqué, sans rien faire
 *   node scripts/appliquer-migrations.mjs --socle    base NEUVE seulement : applique aussi 0001 à 0010
 *
 * Le registre ne connaît que les migrations postérieures à 0010. Celles de
 * 0001 à 0010 forment le socle, appliqué à la main dans l'éditeur SQL avant
 * que le registre existe : le script ne les rejoue jamais sur une base qui
 * vit déjà (0001 n'est pas rejouable, et 0010 est facultative). Sur une base
 * neuve, `--socle` les applique dans l'ordre.
 *
 * Chaque migration passe dans une transaction, avec sa ligne de registre :
 * elle s'applique en entier ou pas du tout. Un verrou consultatif empêche
 * deux exécutions simultanées. Une migration déjà appliquée dont le fichier
 * a changé depuis est signalée, jamais rejouée.
 *
 * DATABASE_URL : prise dans l'environnement, ou à défaut dans .env.local à la
 * racine du dépôt. Avec Supabase, le pooler en mode session (port 5432).
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "supabase", "migrations");
/** La dernière migration du socle, appliquée à la main avant le registre. */
const DERNIERE_DU_SOCLE = 10;

const options = new Set(process.argv.slice(2));
const essai = options.has("--essai");
const avecSocle = options.has("--socle");

if (!process.env.DATABASE_URL && existsSync(path.join(RACINE, ".env.local"))) {
  process.loadEnvFile(path.join(RACINE, ".env.local"));
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquante (environnement ou .env.local).");
  process.exit(1);
}

/** « 0011_espace_client.sql » → { numero: 11, version: "0011_espace_client" }. */
const migrations = readdirSync(DOSSIER)
  .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
  .sort()
  .map((fichier) => {
    const sql = readFileSync(path.join(DOSSIER, fichier), "utf8");
    return {
      fichier,
      version: fichier.replace(/\.sql$/, ""),
      numero: Number(fichier.slice(0, 4)),
      sql,
      empreinte: createHash("sha256").update(sql).digest("hex"),
    };
  });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Le pooler Supabase présente un certificat que Node ne sait pas rattacher à une autorité connue.
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  application_name: "bailly-migrations",
});

await client.connect();
try {
  await client.query("select pg_advisory_lock(hashtext('bailly-schema-migrations'))");

  const registre = (await client.query("select to_regclass('public.schema_migrations') is not null as existe")).rows[0].existe;
  if (!registre && !essai) {
    // Le registre lui-même : créé une fois, fermé à la clé publique.
    await client.query(`
      create table if not exists public.schema_migrations (
        version       text primary key,
        empreinte     text not null,
        appliquee_le  timestamptz not null default now()
      );
      alter table public.schema_migrations enable row level security;
      revoke all on table public.schema_migrations from anon, authenticated;
      comment on table public.schema_migrations is
        'Les migrations appliquées par scripts/appliquer-migrations.mjs (0011 et suivantes).';
    `);
    console.log("Registre public.schema_migrations créé.");
  }

  const appliquees = new Map(
    registre || !essai ? (await client.query("select version, empreinte from public.schema_migrations")).rows.map((r) => [r.version, r.empreinte]) : [],
  );

  const aAppliquer = [];
  for (const m of migrations) {
    const deja = appliquees.get(m.version);
    if (deja) {
      if (deja !== m.empreinte) console.warn(`! ${m.fichier} : déjà appliquée, mais le fichier a changé depuis. Elle n'est pas rejouée : écrivez une nouvelle migration.`);
      continue;
    }
    if (m.numero <= DERNIERE_DU_SOCLE && !avecSocle) continue;
    aAppliquer.push(m);
  }

  const socle = migrations.filter((m) => m.numero <= DERNIERE_DU_SOCLE && !appliquees.has(m.version));
  if (socle.length && !avecSocle) {
    console.log(`Socle (0001 à ${String(DERNIERE_DU_SOCLE).padStart(4, "0")}) hors registre, non rejoué : ${socle.map((m) => m.version).join(", ")}.`);
  }

  if (!aAppliquer.length) {
    console.log("Rien à appliquer : la base est à jour.");
  } else if (essai) {
    console.log(`À appliquer (${aAppliquer.length}) :`);
    for (const m of aAppliquer) console.log(`  · ${m.fichier}`);
  } else {
    for (const m of aAppliquer) {
      process.stdout.write(`→ ${m.fichier} … `);
      try {
        await client.query("begin");
        await client.query(m.sql);
        await client.query("insert into public.schema_migrations (version, empreinte) values ($1, $2)", [m.version, m.empreinte]);
        await client.query("commit");
        console.log("appliquée.");
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        console.log("ÉCHEC, rien n'a été appliqué.");
        throw e;
      }
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(hashtext('bailly-schema-migrations'))").catch(() => undefined);
  await client.end();
}
