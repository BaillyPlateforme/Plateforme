#!/usr/bin/env node
/*
 * La batterie complète, de A à Z, et son rapport.
 *
 *   node lanceur.mjs                     tout
 *   node lanceur.mjs --niveaux unitaires,base
 *   node lanceur.mjs --sans prod,recette
 *
 * Les niveaux, dans l'ordre :
 *   statique   types (tsc), lint (eslint), dépendances (npm audit) ;
 *   build      les deux apps construites pour la batterie (next build) ;
 *   unitaires  la logique pure, sans réseau ni base (Vitest) ;
 *   base       les deux projets Supabase : cloisons, clé publique, registre
 *              des migrations, données (Vitest ; production en lecture seule) ;
 *   local      API et parcours dans un vrai navigateur, sur les apps lancées
 *              ici et branchées sur la recette (Playwright) : écrit des
 *              données fictives, toutes effacées à la fin ;
 *   recette    les services déployés de la recette, tests en lecture seule ;
 *   prod       la production, tests en lecture seule, sans aucun compte.
 *
 * Le rapport : resultats/RAPPORT.md (et la sortie de chaque outil à côté).
 * Code de sortie non nul dès qu'un test échoue de façon inattendue.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ETAT, RACINE, TESTS } from "./outils/config.mjs";

const NIVEAUX = ["statique", "build", "unitaires", "base", "local", "recette", "prod"];
const arg = (nom) => {
  const i = process.argv.indexOf(nom);
  return i > 0 ? process.argv[i + 1]?.split(",").map((s) => s.trim()) : null;
};
const voulus = (arg("--niveaux") ?? NIVEAUX).filter((n) => !(arg("--sans") ?? []).includes(n));
const RES = path.join(TESTS, "resultats");
fs.mkdirSync(RES, { recursive: true });
fs.mkdirSync(ETAT, { recursive: true });

const bilan = [];
const debutTout = Date.now();

function lancer(nom, commande, args, { cwd = TESTS, env = {}, journal } = {}) {
  console.log(`\n━━━ ${nom} : ${commande} ${args.join(" ")}`);
  const debut = Date.now();
  const r = spawnSync(commande, args, { cwd, env: { ...process.env, FORCE_COLOR: "0", ...env }, encoding: "utf8", maxBuffer: 1 << 28 });
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (journal) fs.writeFileSync(path.join(RES, journal), sortie);
  process.stdout.write(sortie.split("\n").slice(-25).join("\n") + "\n");
  return { code: r.status ?? 1, sortie, duree: Math.round((Date.now() - debut) / 1000) };
}

const lireJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);

function bilanVitest(fichier) {
  const j = lireJson(fichier);
  if (!j) return null;
  const echecs = [];
  let attendus = 0;
  for (const f of j.testResults ?? [])
    for (const a of f.assertionResults ?? []) {
      if (a.status === "failed") echecs.push(`${path.relative(TESTS, f.name)} › ${a.fullName} — ${(a.failureMessages?.[0] ?? "").split("\n")[0].slice(0, 160)}`);
    }
  return { total: j.numTotalTests, reussis: j.numPassedTests, echecs: j.numFailedTests, ignores: j.numPendingTests + (j.numTodoTests ?? 0), attendus, liste: echecs };
}

function bilanPlaywright(fichier) {
  const j = lireJson(fichier);
  if (!j) return null;
  const echecs = [];
  let total = 0, reussis = 0, attendus = 0, ignores = 0, instables = 0;
  const parcourir = (s, titre = []) => {
    for (const x of s.suites ?? []) parcourir(x, [...titre, x.title]);
    for (const sp of s.specs ?? [])
      for (const t of sp.tests) {
        total++;
        const r = t.results.at(-1);
        if (t.status === "skipped") ignores++;
        else if (t.status === "flaky") instables++;
        else if (t.status === "expected") (t.expectedStatus === "failed" ? attendus++ : reussis++);
        else echecs.push(`[${t.projectName}] ${sp.file} › ${sp.title} — ${(r?.error?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0].slice(0, 160)}`);
      }
  };
  parcourir(j);
  return { total, reussis, echecs: echecs.length, ignores, attendus, instables, liste: echecs };
}

function noter(niveau, etat, detail = {}) {
  bilan.push({ niveau, etat, ...detail });
}

// ─── statique ───
if (voulus.includes("statique")) {
  const types = lancer("types", "npm", ["run", "typecheck"], { cwd: RACINE, journal: "statique-types.txt" });
  noter("statique · types (tsc)", types.code === 0 ? "ok" : "échec", { duree: types.duree, note: types.code ? (types.sortie.match(/error TS\d+/g) ?? []).length + " erreurs" : "" });
  const lint = lancer("lint", "npm", ["run", "lint"], { cwd: RACINE, journal: "statique-lint.txt" });
  // Une ligne « ✖ N problems (E errors, W warnings) » par app : on les additionne.
  const totaux = [...lint.sortie.matchAll(/✖ \d+ problems? \((\d+) errors?, (\d+) warnings?\)/g)];
  const erreurs = totaux.reduce((s, m) => s + Number(m[1]), 0) || (lint.code ? 1 : 0);
  const avert = totaux.reduce((s, m) => s + Number(m[2]), 0);
  noter("statique · lint (eslint)", lint.code === 0 ? "ok" : "échec", { duree: lint.duree, note: `${erreurs} erreur(s), ${avert} avertissement(s)` });
  const audit = lancer("dépendances", "npm", ["audit", "--omit=dev", "--json"], { cwd: RACINE, journal: "statique-audit.json" });
  let v = {};
  try {
    v = JSON.parse(audit.sortie.slice(audit.sortie.indexOf("{"))).metadata?.vulnerabilities ?? {};
  } catch {}
  const graves = (v.high ?? 0) + (v.critical ?? 0);
  noter("statique · dépendances (npm audit)", graves ? "échec" : "ok", { duree: audit.duree, note: `critiques ${v.critical ?? 0}, hautes ${v.high ?? 0}, moyennes ${v.moderate ?? 0}, basses ${v.low ?? 0}` });
}

// ─── build ───
if (voulus.includes("build")) {
  const b = lancer("build", "node", ["construire.mjs"], { journal: "build.txt" });
  noter("build · externe et interne (next build)", b.code === 0 ? "ok" : "échec", { duree: b.duree });
}

// ─── unitaires ───
if (voulus.includes("unitaires")) {
  const f = path.join(RES, "vitest-unitaires.json");
  const u = lancer("unitaires", "npx", ["vitest", "run", "--project", "unitaires", "--project", "unitaires-interne", "--reporter=dot", "--reporter=json", `--outputFile.json=${f}`], { journal: "unitaires.txt" });
  const b = bilanVitest(f);
  noter("unitaires (Vitest)", u.code === 0 ? "ok" : "échec", { duree: u.duree, ...b });
}

// ─── base ───
if (voulus.includes("base")) {
  const f = path.join(RES, "vitest-base.json");
  const u = lancer("base", "npx", ["vitest", "run", "--project", "base", "--reporter=default", "--reporter=json", `--outputFile.json=${f}`], { journal: "base.txt", env: { BASES: "recette,prod" } });
  noter("base (recette et production)", u.code === 0 ? "ok" : "échec", { duree: u.duree, ...bilanVitest(f) });
}

// ─── Playwright : local, recette, prod ───
const playwright = (nom, cible, extra) => {
  const f = path.join(RES, `playwright-${nom}.json`);
  if (fs.existsSync(f)) fs.rmSync(f);
  const r = lancer(nom, "npx", ["playwright", "test", ...extra], { journal: `playwright-${nom}.txt`, env: { CIBLE: cible, BATTERIE_NOM: nom, PARTAGE: "" } });
  const b = bilanPlaywright(f);
  noter(`${nom} (Playwright, cible ${cible})`, r.code === 0 ? "ok" : "échec", { duree: r.duree, ...b });
};
if (voulus.includes("local")) playwright("local", "local", ["--project=api", "--project=parcours", "--project=parcours-mobile"]);
if (voulus.includes("recette")) playwright("recette", "recette", ["--project=api", "--project=parcours", "--grep", "@lecture"]);
if (voulus.includes("prod")) playwright("prod", "prod", ["--project=api", "--project=parcours", "--grep", "@lecture"]);

// ─── Les défauts connus, relevés dans les tests (marque « BOGUE ») ───
function defautsConnus() {
  const vus = new Map();
  const parcourir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", "resultats", ".etat"].includes(e.name)) parcourir(p);
      } else if (/\.(test|spec)\.ts$/.test(e.name)) {
        fs.readFileSync(p, "utf8")
          .split("\n")
          .forEach((l, i) => {
            const m = l.match(/BOGUE[^:]*:\s*(.+?)\s*(\*\/)?$/);
            if (m && !/test\.fail\(|it\.fails/.test(l)) {
              const cle = m[1].slice(0, 90);
              if (!vus.has(cle)) vus.set(cle, `${path.relative(TESTS, p)}:${i + 1} — ${m[1]}`);
            }
          });
      }
    }
  };
  parcourir(TESTS);
  return [...vus.values()];
}

// ─── Le rapport ───
const git = (a) => spawnSync("git", a, { cwd: RACINE, encoding: "utf8" }).stdout.trim();
const nettoyage = lireJson(path.join(ETAT, "nettoyage.json"));
const lignes = [
  `# Batterie de tests — ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
  "",
  `Code testé : branche \`${git(["rev-parse", "--abbrev-ref", "HEAD"])}\`, commit \`${git(["rev-parse", "--short", "HEAD"])}\`${git(["status", "--porcelain", "--", "apps", "packages", "supabase"]) ? " (avec des modifications non commitées)" : ""}. Durée : ${Math.round((Date.now() - debutTout) / 60000)} min.`,
  "",
  "| Niveau | État | Tests | Réussis | Échecs | Défauts connus (échec attendu) | Ignorés | Durée | Note |",
  "|---|---|---:|---:|---:|---:|---:|---:|---|",
  ...bilan.map((b) => `| ${b.niveau} | ${b.etat === "ok" ? "✅" : "❌"} | ${b.total ?? ""} | ${b.reussis ?? ""} | ${b.echecs ?? ""} | ${b.attendus || ""} | ${b.ignores ?? ""} | ${b.duree ?? ""} s | ${b.note ?? ""} |`),
  "",
];
const echecs = bilan.flatMap((b) => (b.liste ?? []).map((l) => `- **${b.niveau}** : ${l}`));
lignes.push("## Échecs", "", ...(echecs.length ? echecs : ["Aucun."]), "");
const defauts = defautsConnus();
lignes.push("## Défauts connus de l'application (relevés par la batterie)", "", ...(defauts.length ? defauts.map((d) => `- ${d}`) : ["Aucun."]), "");
if (nettoyage) lignes.push("## Nettoyage de la recette", "", `Retiré : ${JSON.stringify(nettoyage.retires)}. Restes : ${Object.keys(nettoyage.restes ?? {}).length ? JSON.stringify(nettoyage.restes) : "aucun"}.`, "");
fs.writeFileSync(path.join(RES, "RAPPORT.md"), lignes.join("\n"));

console.log("\n" + lignes.slice(0, 6 + bilan.length).join("\n"));
console.log(`\nRapport complet : ${path.join(RES, "RAPPORT.md")}`);
process.exit(bilan.some((b) => b.etat !== "ok") ? 1 : 0);
