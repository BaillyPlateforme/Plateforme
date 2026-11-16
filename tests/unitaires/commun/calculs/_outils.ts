/*
 * Outils partagés par les tests des calculs métier. Aucun test ici : le
 * fichier ne finit pas en .test.ts, vitest ne le lance pas.
 */

/** Intl met des espaces insécables (U+00A0, U+202F) : on les ramène à une espace simple pour comparer. */
export const esp = (s: string) => s.replace(/[  ]/g, " ");

/** Un générateur pseudo-aléatoire déterministe (LCG) : les propriétés se rejouent à l'identique. */
export function hasard(graine = 42) {
  let etat = graine >>> 0 || 1;
  return () => (etat = (etat * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/**
 * Un faux client Supabase : chaque table rend la réponse qu'on lui donne,
 * quelle que soit la chaîne de filtres (select, eq, order, limit…). La
 * réponse est lue à la fin, par maybeSingle() ou par un await direct.
 */
export type ReponseFausse = { data: unknown; error?: { message: string } | null; count?: number | null };

export function fauxSupabase(tables: Record<string, ReponseFausse | (() => ReponseFausse)>) {
  const appels: { table: string; methode: string; args: unknown[] }[] = [];
  const lire = (table: string): ReponseFausse => {
    const r = tables[table];
    const v = typeof r === "function" ? r() : r;
    return v ?? { data: null, error: null };
  };
  const chaine = (table: string) => {
    const reponse = () => Promise.resolve({ error: null, ...lire(table) });
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === "then") return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => reponse().then(ok, ko);
          if (prop === "maybeSingle" || prop === "single") return () => reponse();
          return (...args: unknown[]) => {
            appels.push({ table, methode: prop, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return {
    appels,
    client: {
      from: (table: string) => {
        appels.push({ table, methode: "from", args: [] });
        return chaine(table);
      },
      rpc: (fonction: string, params: unknown) => {
        appels.push({ table: fonction, methode: "rpc", args: [params] });
        return chaine(fonction);
      },
    },
  };
}
