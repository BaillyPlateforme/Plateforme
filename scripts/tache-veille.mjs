#!/usr/bin/env node
/*
 * Lance la tâche de la veille de l'app interne : cartons du samedi (tournée,
 * bons de livraison, récapitulatif pour l'équipe, créneau au client) et
 * rappels de visite technique. C'est le point d'entrée du service cron de
 * Railway.
 *
 *   node scripts/tache-veille.mjs
 *
 * Variables :
 *   TACHES_URL      l'adresse de l'app interne (https://plateforme.…), sans
 *                   la route ; à défaut NEXT_PUBLIC_URL_INTERNE ;
 *   TACHES_SECRET   le même secret que celui de l'app interne.
 * Prises dans l'environnement, ou à défaut dans .env.local à la racine.
 *
 * Service cron Railway (à créer dans l'environnement voulu, rien n'est créé
 * par ce script) : un service à partir de ce dépôt, commande de démarrage
 * `node scripts/tache-veille.mjs`, planification « 0 16 * * * » (Railway
 * compte en UTC : 17 h à Paris en hiver, 18 h en été), variables TACHES_URL
 * et TACHES_SECRET. Le service doit s'arrêter après chaque exécution : ce
 * script se termine toujours, avec le code 1 si la veille n'a pas pu se
 * faire (Railway marque alors l'exécution en échec).
 *
 * La veille est idempotente par jour : relancer ce script le même jour ne
 * renvoie rien (« déjà exécutée »). Pour relancer malgré tout, le bouton
 * « Relancer maintenant » de Réglages › Envois et veille.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.TACHES_SECRET && existsSync(path.join(RACINE, ".env.local"))) process.loadEnvFile(path.join(RACINE, ".env.local"));

const base = (process.env.TACHES_URL || process.env.NEXT_PUBLIC_URL_INTERNE || "").replace(/\/$/, "");
const secret = process.env.TACHES_SECRET;
if (!base || !secret) {
  console.error("TACHES_URL (ou NEXT_PUBLIC_URL_INTERNE) et TACHES_SECRET sont nécessaires.");
  process.exit(1);
}

const debut = Date.now();
try {
  const res = await fetch(`${base}/api/taches/veille`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
    // La veille calcule une tournée et envoie des messages : quelques minutes au plus.
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const texte = await res.text();
  let corps;
  try {
    corps = JSON.parse(texte);
  } catch {
    corps = { brut: texte.slice(0, 500) };
  }
  if (!res.ok) {
    console.error(`Veille : HTTP ${res.status}`, corps);
    process.exit(1);
  }
  const e = corps.execution;
  if (!corps.lancee) console.log(`Veille non relancée : ${corps.raison}`);
  else console.log(`Veille du ${e?.jour} (pour le ${e?.cible}) : ${e?.statut}, en ${Math.round((Date.now() - debut) / 1000)} s.`);
  for (const t of e?.taches ?? []) console.log(`  · ${t.cle} — ${t.statut} — ${t.resume}`);
  process.exit(corps.lancee && e?.statut === "echec" ? 1 : 0);
} catch (err) {
  console.error("Veille : appel impossible", err instanceof Error ? err.message : err);
  process.exit(1);
}
