import "server-only";
import { Pool } from "pg";

/*
 * La petite connexion des modules partagés au schéma crm : les alertes de
 * l'équipe (alertes-equipe) et le journal des gestes (journal.ts).
 *
 * L'espace équipe passe par Supabase (PostgREST), qui ne voit que le schéma
 * public ; l'app externe n'a pas le pool du CRM. Ces modules ont donc une
 * connexion à eux — une seule, en mode session, par DATABASE_URL, fermée
 * après cinq secondes de repos : le pooler Supabase plafonne à quinze
 * connexions pour tout le projet. Sans DATABASE_URL utilisable (absente, ou
 * le mode transaction, port 6543), rien : l'appelant fait sans.
 */

export type Lire = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

const g = globalThis as typeof globalThis & { __crmPetitPool?: Pool | null };

export function baseCrm(): Lire | null {
  if (g.__crmPetitPool === undefined) {
    const url = process.env.DATABASE_URL;
    let ok = false;
    try {
      ok = !!url && new URL(url).port !== "6543";
    } catch {
      ok = false;
    }
    g.__crmPetitPool = ok ? new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1, idleTimeoutMillis: 5_000 }) : null;
    g.__crmPetitPool?.on("error", (e) => console.error("Base du CRM (modules partagés) : connexion perdue", e.message));
  }
  const p = g.__crmPetitPool;
  return p ? async <T,>(sql: string, params: unknown[] = []) => (await p.query(sql, params)).rows as T[] : null;
}
