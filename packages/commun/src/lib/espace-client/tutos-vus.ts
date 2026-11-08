import "server-only";
import { baseCrm } from "@/lib/base-crm";
import { createAuthClient } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { baseConfiguree, estDemo } from "./config";
import { avecDelai, maintenant } from "./depot";
import { SCHEMA_TUTOS_VUS } from "./tutos-vus-schema";

/*
 * Les tutoriels vus par le client : une table, public.ec_tutos_vus
 * (tutos-vus-schema.ts), une ligne par client et par tutoriel.
 *
 * Les lectures suivent la règle de l'espace (depot.ts) :
 *   - le client lit ses « vus » avec SA session et la clé publique : c'est la
 *     RLS qui ne rend que ses lignes ;
 *   - l'aperçu de l'équipe (pas de session de client) et l'équipe lisent par
 *     la clé de service, filtrées par client.
 * L'écriture passe par la clé de service, après les contrôles de l'action
 * (actions/tutos.ts : session, tutoriel publié, aperçu refusé).
 *
 * Comme le fil de la discussion, les « vus » ne font pas partie du document
 * de l'espace (depot.lire) : seules les pages des tutos et la fiche de
 * l'équipe les lisent. Une table absente ou illisible ne casse rien : rien
 * n'est vu.
 *
 * En démonstration en mémoire, les « vus » vivent en mémoire.
 */

const TABLE = "ec_tutos_vus";

export interface TutoVu {
  tuto_id: string;
  vu_le: string;
  par: "bouton" | "video";
}

const g = globalThis as typeof globalThis & { __ecTutosVusPrete?: Promise<void>; __ecTutosVus?: Map<string, TutoVu> };
const memoire = () => (g.__ecTutosVus ??= new Map());

/**
 * Pose la table si elle manque, une fois par processus, par la petite
 * connexion des modules partagés (base-crm.ts). Sans DATABASE_URL
 * utilisable, rien : la table vient alors du CRM ou de la migration 0017. Ne
 * lève jamais.
 */
export function assurerTableTutosVus(): Promise<void> {
  if (estDemo()) return Promise.resolve();
  if (!g.__ecTutosVusPrete) {
    g.__ecTutosVusPrete = (async () => {
      const lire = baseCrm();
      if (lire) await lire(SCHEMA_TUTOS_VUS);
    })().catch((e) => {
      g.__ecTutosVusPrete = undefined;
      console.error("Tutos : création de la table ec_tutos_vus impossible", e instanceof Error ? e.message : e);
    });
  }
  return g.__ecTutosVusPrete;
}

const tableAbsente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || /could not find the table|does not exist/i.test(e.message ?? ""));

/**
 * Une requête sur la table, après s'être assuré qu'elle existe. Juste créée,
 * l'API de Supabase met un instant à la voir : une seconde tentative, une
 * seconde plus tard. Rend null si la table manque toujours.
 */
async function requete<T>(faire: () => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>): Promise<T | null> {
  await assurerTableTutosVus();
  let r = await avecDelai(faire(), 5000);
  if (tableAbsente(r.error)) {
    await new Promise((ok) => setTimeout(ok, 1200));
    r = await avecDelai(faire(), 5000);
  }
  if (tableAbsente(r.error)) return null;
  if (r.error) throw new Error(`Tutos vus : ${r.error.message}`);
  return r.data;
}

/**
 * Les tutoriels vus par un client. `par` : « session » — le client connecté,
 * sous la RLS ; « service » — la clé de service, pour l'équipe et l'aperçu.
 * Illisible : aucun (la page s'affiche quand même).
 */
export async function lireTutosVus(clientId: string, par: "session" | "service"): Promise<TutoVu[]> {
  if (estDemo()) {
    return [...memoire().entries()].filter(([cle]) => cle.startsWith(`${clientId}:`)).map(([, v]) => ({ ...v }));
  }
  if (!baseConfiguree()) return [];
  try {
    const db = par === "session" ? ((await createAuthClient()) as unknown as ReturnType<typeof createServiceClient>) : createServiceClient();
    const lignes = await requete<TutoVu[]>(() => db.from(TABLE).select("tuto_id, vu_le, par").eq("client_id", clientId));
    return lignes ?? [];
  } catch (e) {
    console.error("Tutos : lecture des tutoriels vus impossible", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Marque un tutoriel vu : la première fois seulement (un second « vu » ne
 * change ni la date ni la façon). Rend vrai si la ligne vient d'être créée.
 * L'appelant a vérifié la session, le tutoriel et l'absence d'aperçu.
 */
export async function marquerTutoVu(clientId: string, tutoId: string, par: TutoVu["par"]): Promise<boolean> {
  if (estDemo()) {
    const cle = `${clientId}:${tutoId}`;
    if (memoire().has(cle)) return false;
    memoire().set(cle, { tuto_id: tutoId, vu_le: maintenant(), par });
    return true;
  }
  const r = await requete<{ tuto_id: string }[]>(() =>
    createServiceClient()
      .from(TABLE)
      .upsert({ client_id: clientId, tuto_id: tutoId, vu_le: maintenant(), par }, { onConflict: "client_id,tuto_id", ignoreDuplicates: true })
      .select("tuto_id"),
  );
  if (r === null) throw new Error("Les tutoriels ne sont pas encore prêts : réessayez dans un instant.");
  return r.length > 0;
}
