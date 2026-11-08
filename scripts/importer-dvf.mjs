#!/usr/bin/env node
/*
 * Importe le prix médian au m² des logements de chaque commune (DVF) dans
 * crm.dvf_communes, et en tire le « prestige de l'adresse » des demandes
 * (Demandes › Top demandes, carte Évaluation d'une demande).
 *
 * Source : « Statistiques DVF », data.gouv.fr (Etalab), Licence Ouverte 2.0
 *   https://www.data.gouv.fr/datasets/statistiques-dvf
 *   fichier « Statistiques totales DVF » (stats_whole_period.csv) : par
 *   commune, le nombre de ventes et la médiane du prix au m² sur toute la
 *   période disponible (10 semestres : ventes 2021 à 2025 à la mise à jour
 *   du 21/10/2026). Ventes, VEFA et adjudications d'un seul bien.
 *
 * Ce qui est gardé, par commune (arrondissement pour Paris, Lyon, Marseille) :
 * la médiane des maisons et appartements confondus (med_prix_m2_whole_apt_maison)
 * et leur nombre de ventes.
 *
 * Le prestige (0 à 100) : la part des ventes de logements en France faites
 * dans une commune où le prix médian au m² est plus bas (rang centile pondéré
 * par les ventes ; les ex æquo comptent pour moitié). Base : les communes
 * d'au moins 5 ventes, sans Paris, Lyon et Marseille entières (leurs
 * arrondissements y sont déjà). Sous 5 ventes, le prix est gardé mais le
 * prestige reste vide. Exemple : 82 = la commune est plus chère que celles
 * où se sont faites 82 % des ventes.
 *
 * Rafraîchir : deux fois par an, après la publication DVF (avril, octobre).
 *
 *   node scripts/importer-dvf.mjs                 télécharge le fichier et importe
 *   node scripts/importer-dvf.mjs fichier.csv     importe un fichier déjà téléchargé
 *   node scripts/importer-dvf.mjs --essai         calcule et affiche, sans rien écrire
 *
 * Variables : DATABASE_URL, prise dans l'environnement, .env.local ou
 * apps/interne/.env.local. N'écrit que dans crm.dvf_communes (remplacée en entier,
 * dans une transaction).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JEU = "64998de5926530ebcecc7b15";
const URL_FICHIER = "https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/dvf/stats_whole_period.csv";
const PERIODE = "2021–2025";
/** Paris, Lyon et Marseille entières : leurs arrondissements sont déjà des communes du fichier. */
const VILLES_ENTIERES = new Set(["75056", "69123", "13055"]);
const VENTES_MIN = 5;

const essai = process.argv.includes("--essai");
const fichier = process.argv.slice(2).find((a) => !a.startsWith("--"));

for (const f of [path.join(RACINE, ".env.local"), path.join(RACINE, "apps/interne/.env.local")]) {
  if (!process.env.DATABASE_URL && existsSync(f)) process.loadEnvFile(f);
}
if (!essai && !process.env.DATABASE_URL) {
  console.error("DATABASE_URL est nécessaire (environnement, .env.local ou apps/interne/.env.local).");
  process.exit(1);
}

/** Une ligne CSV, guillemets compris. */
function champs(ligne) {
  const out = [];
  let cur = "";
  let dedans = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dedans) {
      if (c === '"' && ligne[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') dedans = false;
      else cur += c;
    } else if (c === '"') dedans = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function lireSource() {
  if (fichier) return { texte: readFileSync(fichier, "utf8"), maj: null };
  const meta = await fetch(`https://www.data.gouv.fr/api/1/datasets/${JEU}/`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const ressource = meta?.resources?.find((r) => r.url === URL_FICHIER);
  console.log(`Téléchargement de ${URL_FICHIER}…`);
  const r = await fetch(URL_FICHIER);
  if (!r.ok) throw new Error(`Téléchargement impossible (${r.status}).`);
  return { texte: await r.text(), maj: ressource?.last_modified?.slice(0, 10) ?? null };
}

const { texte, maj } = await lireSource();
const lignes = texte.split(/\r?\n/);
const tete = champs(lignes[0]);
const col = (nom) => {
  const i = tete.indexOf(nom);
  if (i < 0) throw new Error(`Colonne absente du fichier : ${nom}`);
  return i;
};
const [iCode, iLibelle, iEchelle, iVentes, iMediane] = ["code_geo", "libelle_geo", "echelle_geo", "nb_ventes_whole_apt_maison", "med_prix_m2_whole_apt_maison"].map(col);

const communes = [];
for (const l of lignes.slice(1)) {
  if (!l) continue;
  const c = champs(l);
  if (c[iEchelle] !== "commune" || !c[iVentes] || !c[iMediane]) continue;
  const ventes = Math.round(Number(c[iVentes]));
  const prix = Math.round(Number(c[iMediane]));
  if (!/^[0-9AB]{5}$/.test(c[iCode]) || !(ventes > 0) || !(prix > 0)) continue;
  communes.push({ code: c[iCode], libelle: c[iLibelle], prix, ventes });
}

// Le rang centile pondéré par les ventes, sur la base.
const base = communes.filter((c) => !VILLES_ENTIERES.has(c.code) && c.ventes >= VENTES_MIN).sort((a, b) => a.prix - b.prix);
const total = base.reduce((s, c) => s + c.ventes, 0);
const parPrix = new Map();
let cumul = 0;
for (const c of base) {
  const p = parPrix.get(c.prix) ?? { avant: cumul, egal: 0 };
  p.egal += c.ventes;
  parPrix.set(c.prix, p);
  cumul += c.ventes;
}
const prix = [...parPrix.keys()].sort((a, b) => a - b);
function prestige(p) {
  // Les ventes des communes strictement moins chères, plus la moitié des ex æquo.
  let bas = 0;
  let haut = prix.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (prix[m] < p) bas = m + 1;
    else haut = m;
  }
  const exact = parPrix.get(p);
  const avant = exact ? exact.avant : bas < prix.length ? parPrix.get(prix[bas]).avant : total;
  return Math.round((100 * (avant + (exact ? exact.egal / 2 : 0))) / total);
}
for (const c of communes) c.prestige = c.ventes >= VENTES_MIN ? prestige(c.prix) : null;

console.log(`${communes.length} communes avec des ventes ; base du prestige : ${base.length} communes, ${total} ventes.`);
for (const code of ["75116", "75056", "92051", "92012", "91477", "69383", "13208", "31555", "59350", "30189"]) {
  const c = communes.find((x) => x.code === code);
  if (c) console.log(`  ${c.code} ${c.libelle} : ${c.prix} €/m², ${c.ventes} ventes, prestige ${c.prestige}`);
}
if (essai) process.exit(0);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, application_name: "bailly-import-dvf" });
await db.connect();
try {
  await db.query("begin");
  await db.query(`create table if not exists crm.dvf_communes (
    code_insee text primary key, libelle text not null, prix_m2_median int not null, ventes int not null,
    prestige smallint check (prestige between 0 and 100), periode text not null, source_maj date, importe_le timestamptz not null default now())`);
  await db.query("alter table crm.dvf_communes enable row level security");
  await db.query("delete from crm.dvf_communes");
  for (let i = 0; i < communes.length; i += 2000) {
    const lot = communes.slice(i, i + 2000);
    await db.query(
      `insert into crm.dvf_communes (code_insee, libelle, prix_m2_median, ventes, prestige, periode, source_maj)
       select * , $6::text, $7::date from unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::smallint[])`,
      [lot.map((c) => c.code), lot.map((c) => c.libelle), lot.map((c) => c.prix), lot.map((c) => c.ventes), lot.map((c) => c.prestige), PERIODE, maj],
    );
  }
  await db.query("commit");
  const [{ n }] = (await db.query("select count(*)::int as n from crm.dvf_communes")).rows;
  console.log(`crm.dvf_communes : ${n} communes importées (DVF ${PERIODE}${maj ? `, mise à jour du ${maj}` : ""}).`);
} catch (e) {
  await db.query("rollback").catch(() => {});
  throw e;
} finally {
  await db.end();
}
