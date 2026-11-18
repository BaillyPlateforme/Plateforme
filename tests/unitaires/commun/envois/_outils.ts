/*
 * Les doublures communes aux tests des envois : une fausse base Supabase
 * (le constructeur de requêtes de supabase-js, enchaînable et « thenable »),
 * qui note chaque requête et rend ce que le test décide.
 *
 * Aucun réseau : la fausse base ne parle à personne.
 */
import { vi } from "vitest";

export type Filtre = [methode: string, ...args: unknown[]];

export interface Requete {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete" | "rpc";
  charge?: unknown;
  options?: unknown;
  /** Les arguments de .select(…) (colonnes, { count, head }). */
  selection?: unknown[];
  /** .select() après une écriture : la ligne écrite est rendue. */
  rendLignes?: boolean;
  filtres: Filtre[];
  unique?: "single" | "maybeSingle";
}

export type Reponse = { data?: unknown; error?: { message: string } | null; count?: number | null } | undefined | void;
export type Repondeur = (r: Requete) => Reponse | Promise<Reponse>;

/** La valeur d'un filtre : `filtre(r, "eq", "statut")` → la valeur comparée à « statut ». */
export function filtre(r: Requete, methode: string, colonne: string): unknown {
  const f = r.filtres.find((x) => x[0] === methode && x[1] === colonne);
  return f ? f[2] : undefined;
}

export function fausseBase(repondre: Repondeur = () => ({ data: null, error: null })) {
  const requetes: Requete[] = [];
  const thenable = (r: Requete, chaine: Record<string, unknown>) => {
    chaine.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      requetes.push(r);
      return Promise.resolve()
        .then(() => repondre(r))
        .then((v) => ({ data: v?.data ?? null, error: v?.error ?? null, count: v?.count ?? null }))
        .then(ok, ko);
    };
    return chaine;
  };
  const client = {
    from(table: string) {
      const r: Requete = { table, action: "select", filtres: [] };
      const chaine: Record<string, unknown> = {};
      const filtreur = (nom: string) => (...a: unknown[]) => {
        r.filtres.push([nom, ...a]);
        return chaine;
      };
      Object.assign(chaine, {
        select: (...a: unknown[]) => {
          if (r.action === "select") r.selection = a;
          else r.rendLignes = true;
          return chaine;
        },
        insert: (charge: unknown, options?: unknown) => Object.assign(r, { action: "insert", charge, options }) && chaine,
        upsert: (charge: unknown, options?: unknown) => Object.assign(r, { action: "upsert", charge, options }) && chaine,
        update: (charge: unknown, options?: unknown) => Object.assign(r, { action: "update", charge, options }) && chaine,
        delete: () => Object.assign(r, { action: "delete" }) && chaine,
        eq: filtreur("eq"),
        neq: filtreur("neq"),
        like: filtreur("like"),
        gte: filtreur("gte"),
        lte: filtreur("lte"),
        lt: filtreur("lt"),
        gt: filtreur("gt"),
        in: filtreur("in"),
        is: filtreur("is"),
        not: filtreur("not"),
        order: filtreur("order"),
        limit: filtreur("limit"),
        maybeSingle: () => {
          r.unique = "maybeSingle";
          return chaine;
        },
        single: () => {
          r.unique = "single";
          return chaine;
        },
      });
      return thenable(r, chaine);
    },
    rpc(nom: string, args?: unknown) {
      const r: Requete = { table: nom, action: "rpc", charge: args, filtres: [] };
      return thenable(r, {});
    },
  };
  return { client, requetes, de: (table: string, action?: Requete["action"]) => requetes.filter((r) => r.table === table && (!action || r.action === action)) };
}

/** Une réponse HTTP minimale pour un `fetch` simulé (avec ses en-têtes : SendGrid rend son identifiant dans X-Message-Id). */
export function reponseHttp(statut: number, corps: unknown = "", options: { texteEchoue?: boolean; entetes?: Record<string, string> } = {}) {
  const texte = typeof corps === "string" ? corps : JSON.stringify(corps);
  return {
    ok: statut >= 200 && statut < 300,
    status: statut,
    headers: new Headers(options.entetes ?? {}),
    text: options.texteEchoue ? () => Promise.reject(new Error("corps illisible")) : () => Promise.resolve(texte),
    json: () => Promise.resolve(JSON.parse(texte)),
  } as unknown as Response;
}

/** Un `fetch` simulé qui refuse tout appel : la preuve qu'aucun réseau n'est touché. */
export function fetchInterdit() {
  return vi.fn(async (url: unknown) => {
    throw new Error(`Appel réseau interdit dans les tests : ${String(url)}`);
  });
}

/** Laisse passer les tâches lancées sans attente (import dynamique, promesses non attendues). */
export const laisserFiler = () => new Promise((ok) => setTimeout(ok, 15));
