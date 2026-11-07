import "server-only";
import { plusJours } from "@/lib/espace-client/cartons";
import { aujourdhui } from "@/lib/espace-client/format";
import { createServiceClient } from "@/lib/supabase/server";
import { TACHES_VEILLE } from "./registre";
import type { CompteRendu } from "./types";

/*
 * L'exécution de la veille : les tâches du registre, l'une après l'autre,
 * et leur compte rendu au journal (public.taches_executions, migration 0013).
 *
 * Idempotente par jour, à deux niveaux :
 *   - le verrou du jour : une exécution PLANIFIÉE réservée (en cours ou
 *     réussie) empêche toute autre exécution planifiée le même jour — un
 *     second appel du cron répond « déjà exécutée » sans rien lancer. Une
 *     exécution en échec ou partielle ne verrouille pas : le cron suivant
 *     peut réessayer ;
 *   - les messages : chacun a sa clé d'idempotence (module d'envoi). Même
 *     relancée à la main (« Relancer », qui passe outre le verrou), la veille
 *     ne renvoie rien de ce qui est déjà parti.
 *
 * Une exécution restée « en cours » plus de vingt minutes (serveur coupé en
 * route) est close en échec, et ne bloque plus le jour.
 */

const TACHE = "veille";
const TABLE = "taches_executions";
const INTERROMPUE_MIN = 20;

export type CompteTache = CompteRendu & { cle: string; libelle: string; duree_ms: number };

export interface Execution {
  id: string;
  tache: string;
  jour: string;
  cible: string | null;
  declenchement: "planifie" | "manuel";
  force: boolean;
  statut: "en_cours" | "reussie" | "partielle" | "echec";
  resultat: { taches?: CompteTache[]; motif?: string };
  par: string | null;
  debut: string;
  fin: string | null;
}

export type IssueVeille = { lancee: true; execution: Execution } | { lancee: false; raison: string; execution: Execution | null };

const db = () => createServiceClient();

export async function executerVeille(o: { declenchement: "planifie" | "manuel"; par: string; force?: boolean; maintenant?: Date }): Promise<IssueVeille> {
  const maintenant = o.maintenant ?? new Date();
  const jour = aujourdhui(maintenant);
  const demain = plusJours(jour, 1);

  // Les exécutions interrompues ne bloquent plus le jour.
  await db()
    .from(TABLE)
    .update({ statut: "echec", fin: maintenant.toISOString(), resultat: { motif: `Interrompue : aucune nouvelle depuis ${INTERROMPUE_MIN} minutes.` } })
    .eq("tache", TACHE)
    .eq("statut", "en_cours")
    .lt("debut", new Date(maintenant.getTime() - INTERROMPUE_MIN * 60_000).toISOString());

  const reservee = await db()
    .from(TABLE)
    .insert({ tache: TACHE, jour, cible: demain, declenchement: o.declenchement, force: !!o.force, statut: "en_cours", par: o.par })
    .select("*")
    .single();
  if (reservee.error) {
    if (reservee.error.code === "23505") {
      const { data } = await db().from(TABLE).select("*").eq("tache", TACHE).eq("jour", jour).eq("force", false).in("statut", ["en_cours", "reussie"]).order("debut", { ascending: false }).limit(1);
      const deja = (data?.[0] as Execution | undefined) ?? null;
      return { lancee: false, raison: deja?.statut === "en_cours" ? "La veille est en cours d'exécution." : "La veille a déjà été exécutée aujourd'hui : rien n'est relancé.", execution: deja };
    }
    throw new Error(`Journal des tâches indisponible : ${reservee.error.message}`);
  }
  const execution = reservee.data as Execution;

  const comptes: CompteTache[] = [];
  for (const t of TACHES_VEILLE) {
    const t0 = Date.now();
    let r: CompteRendu;
    try {
      r = await t.executer({ jour, demain, declenchement: o.declenchement });
    } catch (e) {
      r = { statut: "echec", resume: e instanceof Error ? e.message : "Erreur inconnue." };
    }
    comptes.push({ cle: t.cle, libelle: t.libelle, ...r, duree_ms: Date.now() - t0 });
  }
  const sansSouci = (c: CompteTache) => ["faite", "rien", "en_attente"].includes(c.statut);
  const statut: Execution["statut"] = comptes.every(sansSouci) ? "reussie" : comptes.every((c) => c.statut === "echec") ? "echec" : "partielle";

  const fin = await db().from(TABLE).update({ statut, fin: new Date().toISOString(), resultat: { taches: comptes } }).eq("id", execution.id).select("*").single();
  if (fin.error) console.error("Veille : compte rendu non inscrit", fin.error.message);
  return { lancee: true, execution: (fin.data as Execution | null) ?? { ...execution, statut, resultat: { taches: comptes } } };
}

/** Les dernières exécutions, pour le back-office. */
export async function historiqueVeille(limite = 15): Promise<Execution[]> {
  const { data, error } = await db().from(TABLE).select("*").eq("tache", TACHE).order("debut", { ascending: false }).limit(limite);
  if (error) throw new Error(`Lecture des exécutions impossible : ${error.message}`);
  return (data ?? []) as Execution[];
}
