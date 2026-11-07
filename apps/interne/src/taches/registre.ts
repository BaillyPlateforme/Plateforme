import "server-only";
import { tacheCartons } from "./cartons";
import { tacheRappelsVisites, type SourceRappels } from "./rappels-visites";
import type { Tache } from "./types";

/*
 * Le registre des tâches de la veille, exécutées dans cet ordre par
 * POST /api/taches/veille (ou « Relancer » dans le back-office). Une tâche
 * nouvelle s'ajoute ici : elle reçoit le jour et le lendemain, rend un
 * compte rendu, et n'envoie rien en double si on la relance.
 */

/**
 * La source des rappels de visite technique. À brancher à la fusion avec le
 * module des visites :
 *
 *   import { rappelsVisitesDuLendemain } from "@/crm/visites/rappels";
 *   const SOURCE_RAPPELS: SourceRappels | null = rappelsVisitesDuLendemain;
 */
const SOURCE_RAPPELS: SourceRappels | null = null;

export const TACHES_VEILLE: Tache[] = [tacheCartons, tacheRappelsVisites(SOURCE_RAPPELS)];
