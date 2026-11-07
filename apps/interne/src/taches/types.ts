/*
 * Une tâche de la veille : ce qu'elle reçoit, ce qu'elle rend.
 *
 * Chaque tâche est idempotente par elle-même — relancée le même jour, elle
 * n'envoie rien en double (les messages passent par le module d'envoi, avec
 * une clé d'idempotence) — et ne lève pas : elle rend un compte rendu, que
 * l'exécution inscrit au journal (public.taches_executions).
 */

export interface ContexteTache {
  /** Le jour de l'exécution, à Paris (AAAA-MM-JJ). */
  jour: string;
  /** Le lendemain : le jour que la veille prépare. */
  demain: string;
  declenchement: "planifie" | "manuel";
}

export interface CompteRendu {
  /**
   * faite : du travail a été fait ; rien : rien à faire ce jour-là ;
   * en_attente : la tâche n'est pas encore branchée ; partielle : une partie
   * a échoué ; echec : rien n'a pu se faire.
   */
  statut: "faite" | "rien" | "en_attente" | "partielle" | "echec";
  resume: string;
  details?: Record<string, unknown>;
}

export interface Tache {
  cle: string;
  libelle: string;
  executer(ctx: ContexteTache): Promise<CompteRendu>;
}
