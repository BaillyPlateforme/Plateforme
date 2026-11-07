import "server-only";
import { rappelsRendezVousDuLendemain } from "@/crm/rdv/sms";
import { tacheCartons } from "./cartons";
import { tacheRelances, tacheVeilleDemenagement } from "./relances";
import { tacheRappelsVisites, type SourceRappels } from "./rappels-visites";
import type { Tache } from "./types";

/*
 * Le registre des tâches de la veille, exécutées dans cet ordre par
 * POST /api/taches/veille (ou « Relancer » dans le back-office). Une tâche
 * nouvelle s'ajoute ici : elle reçoit le jour et le lendemain, rend un
 * compte rendu, et n'envoie rien en double si on la relance.
 */

/**
 * La source des rappels de visite (SMS de la veille). En attendant le module
 * des visites techniques, celle des SMS de rendez-vous (src/crm/rdv) : les
 * visites de demain, avec la carte « Rappel de la veille ».
 *
 * À la fusion avec le module des visites, n'en garder QU'UNE : leurs clés
 * d'idempotence diffèrent, deux sources enverraient deux rappels.
 *
 *   import { rappelsVisitesDuLendemain } from "@/crm/visites/rappels";
 *   const SOURCE_RAPPELS: SourceRappels | null = rappelsVisitesDuLendemain;
 */
const SOURCE_RAPPELS: SourceRappels | null = rappelsRendezVousDuLendemain;

export const TACHES_VEILLE: Tache[] = [tacheCartons, tacheRappelsVisites(SOURCE_RAPPELS), tacheRelances, tacheVeilleDemenagement];
