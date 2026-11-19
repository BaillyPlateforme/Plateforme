import "server-only";
import { q } from "@/crm/lib/db";

/** Les pages masquées, toutes rôles confondus ; rien si la table manque encore (premier démarrage). */
export async function lireMasques(): Promise<{ href: string; role: string }[]> {
  return q<{ href: string; role: string }>("select href, role from crm.onglets_masques order by role, href").catch(() => []);
}
