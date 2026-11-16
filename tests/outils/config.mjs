/*
 * La configuration commune de la batterie : où sont les apps, quelles bases,
 * quelles clés. Aucune valeur secrète n'est écrite ici ni affichée : les clés
 * sont lues à l'exécution dans les fichiers déjà exclus de Git
 * (apps/interne/.env.local pour la recette, « Clés » pour la production).
 *
 * Trois cibles, choisies par la variable CIBLE :
 *   local    (défaut) les deux apps construites et lancées sur ce poste,
 *            branchées sur la base de RECETTE, envois et Créagidem coupés ;
 *            seule cible où la batterie écrit (objets fictifs, effacés ensuite)
 *            et où elle peut se présenter sous plusieurs adresses IP ;
 *   recette  les services déployés de la recette, en lecture seule ;
 *   prod     les services de production, en lecture seule : aucun compte
 *            de test, aucune écriture, aucune clé de service.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUTILS = path.dirname(fileURLToPath(import.meta.url));
export const TESTS = path.resolve(OUTILS, "..");
export const RACINE = path.resolve(TESTS, "..");
export const ETAT = path.join(TESTS, ".etat");

/** Un fichier « CLE=valeur » lu sans rien afficher (guillemets retirés). */
export function lireEnv(fichier) {
  if (!fs.existsSync(fichier)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(fichier, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
  );
}

export const PORTS = { externe: 4101, interne: 4102 };

export const CIBLES = {
  local: {
    nom: "local",
    externe: `http://localhost:${PORTS.externe}`,
    interne: `http://localhost:${PORTS.interne}`,
    base: "recette",
    ecritures: true,
    ipForgeable: true,
  },
  recette: {
    nom: "recette",
    externe: "https://externe-dev.up.railway.app",
    interne: "https://interne-dev.up.railway.app",
    base: "recette",
    ecritures: false,
    ipForgeable: false,
  },
  prod: {
    nom: "prod",
    externe: "https://bailly-plateforme.up.railway.app",
    interne: "https://bailly-crm.up.railway.app",
    base: "prod",
    ecritures: false,
    ipForgeable: false,
  },
};

export function cible(nom = process.env.CIBLE || "local") {
  const c = CIBLES[nom];
  if (!c) throw new Error(`CIBLE="${nom}" inconnue (local, recette ou prod).`);
  return c;
}

const REF_PROD = "scxmbmkuoinyakjhvyvo";

/**
 * Les accès d'un projet Supabase. La clé de service n'existe que pour la
 * recette : en production, la batterie n'a que la clé publique (ce qu'a un
 * visiteur) et une connexion Postgres ouverte en lecture seule.
 */
export function projet(base) {
  if (base === "recette") {
    const env = lireEnv(path.join(RACINE, "apps/interne/.env.local"));
    return {
      nom: "recette",
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      service: env.SUPABASE_SERVICE_ROLE_KEY,
      db: env.DATABASE_URL,
    };
  }
  if (base === "prod") {
    const k = lireEnv(path.join(RACINE, "Clés"));
    return {
      nom: "prod",
      url: k.SUPABASE_PROD_URL,
      anon: k.SUPABASE_PROD_ANON_KEY,
      service: null,
      db: k.SUPABASE_PROD_DB_PASSWORD
        ? `postgresql://postgres.${REF_PROD}:${encodeURIComponent(k.SUPABASE_PROD_DB_PASSWORD)}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
        : null,
    };
  }
  throw new Error(`Base « ${base} » inconnue.`);
}

/**
 * Toute donnée créée par la batterie porte ce préfixe d'adresse, en
 * @example.com : c'est à lui que le nettoyage la reconnaît, et à lui seul.
 */
export const PREFIXE = "batterie.";
export const emailDeTest = (etiquette) => `${PREFIXE}${etiquette}@example.com`.toLowerCase();
export const estEmailDeTest = (e) => typeof e === "string" && e.toLowerCase().startsWith(PREFIXE) && e.toLowerCase().endsWith("@example.com");

/** Le secret partagé de cette exécution (n8n, tâches, diagnostic…), connu des serveurs locaux et des tests. */
export function secretsDuPassage() {
  const f = path.join(ETAT, "secrets.json");
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  return null;
}
