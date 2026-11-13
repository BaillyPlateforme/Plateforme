import "server-only";
import { Pool, types, type CustomTypesConfig, type PoolClient } from "pg";
import { SCHEMA } from "./schema";
import { seed } from "./seed";

/*
 * La base du CRM.
 *
 * Le CRM partage le projet Supabase de Bailly, qui sert aussi de base de
 * développement en attendant : le schéma `public` y porte déjà les tables de
 * l'espace équipe, dont une table `devis` sans rapport avec celle du CRM. Tout
 * le CRM vit donc dans un schéma à lui, `crm`, et chaque connexion du pool ne
 * voit que celui-là : une requête écrite sans préfixe, comme toutes celles du
 * CRM, ne peut pas atteindre `public` par mégarde — si la table n'existe pas
 * dans `crm`, Postgres renvoie une erreur au lieu de chercher ailleurs.
 *
 * La V1 autonome avait un repli sur une base embarquée (PGlite) quand
 * DATABASE_URL manquait. Il n'est pas repris : sur le serveur, une base locale
 * créée en silence perdrait les dossiers au prochain déploiement.
 */

/** Les lignes SQL sont lues telles quelles : leur forme dépend de chaque requête. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- une ligne SQL n'a pas de type fixe
export type Row = Record<string, any>;

export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

/*
 * Les dates sans heure (type `date` : chargement, livraison, échéances…) sont
 * lues à minuit UTC, comme le faisait la base embarquée de la V1, pour
 * laquelle le CRM a été écrit. Par défaut, pg les lit à minuit heure locale :
 * sur un serveur à l'heure de Paris, chaque `toISOString().slice(0, 10)` du CRM
 * reculait alors d'un jour (champs de date, planning d'exploitation). Sur un
 * serveur en UTC, les deux lectures sont identiques. Ce réglage ne vaut que
 * pour le pool du CRM.
 */
const DATE = types.builtins.DATE;
const TYPES: CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === DATE && format !== "binary" ? (v: string) => new Date(v) : types.getTypeParser(oid, format)) as typeof types.getTypeParser,
};

/** Le pool, réglé pour ne voir que le schéma `crm`. */
function creerPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "BaillyCRM : la variable DATABASE_URL manque. Le CRM enregistre ses données dans le schéma « crm » " +
        "de la base Supabase de Bailly : renseignez l'URL du pooler en mode session (port 5432) dans .env.local.",
    );
  }
  // En mode transaction (port 6543), le pooler peut servir chaque requête
  // par une connexion différente : le réglage du schéma, posé une fois par
  // connexion, ne suivrait pas, et une requête pourrait viser `public`.
  if (new URL(url).port === "6543") {
    throw new Error(
      "BaillyCRM : DATABASE_URL vise le pooler en mode transaction (port 6543). " +
        "Le CRM exige le mode session (port 5432), seul à garder le schéma « crm » d'une requête à l'autre.",
    );
  }
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    // Le pooler Supabase en mode session plafonne à 15 connexions pour tout le projet :
    // CRM_POOL_MAX réduit la part d'un serveur (plusieurs serveurs de développement à la fois).
    max: Math.max(1, Math.min(10, Number(process.env.CRM_POOL_MAX) || 5)),
    idleTimeoutMillis: 10_000,
    types: TYPES,
    // Attendu avant la première requête de chaque connexion : si le réglage
    // échoue, la connexion est fermée et la requête échoue avec elle.
    onConnect: async (client) => {
      await client.query("set search_path to crm");
    },
  });
  // Une connexion au repos coupée par le pooler ne doit pas faire tomber le serveur.
  pool.on("error", (e) => console.error("BaillyCRM : connexion à la base perdue", e.message));
  return pool;
}

/** Les requêtes d'un client précis, pour le jeu de démonstration semé dans une transaction. */
function surClient(c: PoolClient): Db {
  return { query: async <T = Row>(sql: string, params?: unknown[]) => (await c.query(sql, params)).rows as T[] };
}

/**
 * Pose le schéma, puis sème le jeu de démonstration si la base du CRM est vide.
 *
 * Tout se fait dans une seule transaction, sous un verrou : deux serveurs qui
 * démarrent ensemble ne créent pas les tables deux fois, et un jeu de
 * démonstration interrompu à mi-chemin est annulé en entier — il sera semé de
 * nouveau au démarrage suivant.
 */
async function preparer(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(hashtext('bailly.crm.schema'))");
    await c.query(SCHEMA);
    // Le schéma vient peut-être d'être créé : on s'assure qu'il est bien celui où l'on écrit.
    const [{ schema }] = (await c.query<{ schema: string | null }>("select current_schema() as schema")).rows;
    if (schema !== "crm") throw new Error(`BaillyCRM : schéma courant inattendu (${schema ?? "aucun"}), rien n'a été semé.`);
    const [{ n }] = (await c.query<{ n: number }>("select count(*)::int as n from utilisateurs")).rows;
    // Jamais en production : une base de prod vide doit le rester, sans clients ni dossiers fictifs.
    // Les utilisateurs du CRM y naissent à la première visite de chacun (auth.ts).
    if (n === 0 && process.env.RAILWAY_ENVIRONMENT_NAME !== "production") await seed(surClient(c));
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Un seul pool par processus, y compris quand le serveur de développement recharge le module.
const g = globalThis as unknown as { __crmDb?: Promise<Pool> };

function pool(): Promise<Pool> {
  if (!g.__crmDb) {
    g.__crmDb = (async () => {
      const p = creerPool();
      try {
        await preparer(p);
      } catch (e) {
        await p.end().catch(() => {});
        throw e;
      }
      return p;
    })().catch((e) => {
      g.__crmDb = undefined;
      throw e;
    });
  }
  return g.__crmDb;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await (await pool()).query(sql, params)).rows as T[];
}

export async function q1<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

/**
 * Plusieurs écritures d'un seul tenant : toutes passent, ou aucune. Sert au
 * dispatch des conteneurs (déplacer un client, appliquer une proposition),
 * où une écriture à moitié faite laisserait un planning incohérent.
 */
export async function transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const c = await (await pool()).connect();
  try {
    await c.query("begin");
    const r = await fn(surClient(c));
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
