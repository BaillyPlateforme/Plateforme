import "server-only";
import { rappelsRendezVousDuLendemain } from "@/crm/rdv/sms";
import { rappelsVisitesDuLendemain } from "@/crm/visites/rappels";
import { q } from "@/crm/lib/db";
import { tacheCartons } from "./cartons";
import { tacheRelances, tacheVeilleDemenagement } from "./relances";
import { tacheRappelsVisites, type SourceRappels } from "./rappels-visites";
import { tacheRetentionSuivi } from "./suivi";
import type { Tache } from "./types";

/*
 * Le registre des tâches de la veille, exécutées dans cet ordre par
 * POST /api/taches/veille (ou « Relancer » dans le back-office). Une tâche
 * nouvelle s'ajoute ici : elle reçoit le jour et le lendemain, rend un
 * compte rendu, et n'envoie rien en double si on la relance.
 */

/**
 * La source des rappels de la veille : UNE par canal, pour qu'un client ne
 * reçoive jamais deux fois le même rappel.
 *   - Le SMS vient des SMS de rendez-vous (src/crm/rdv) : visites et visios
 *     de demain, sauf celles que le client a annulées en répondant « 2 ».
 *   - L'e-mail vient du module des visites (src/crm/visites/rappels.ts) :
 *     visites physiques de demain, avec la date, l'heure et l'adresse ; on
 *     écarte aussi les rendez-vous annulés par SMS.
 */
const SOURCE_RAPPELS: SourceRappels = async (jour) => {
  const [sms, visites] = await Promise.all([rappelsRendezVousDuLendemain(jour), rappelsVisitesDuLendemain(jour)]);
  const annules = new Set(
    (await q<{ id: number }>("select rendez_vous_id as id from rdv_sms where reponse = 'annule'").catch(() => [])).map((r) => r.id),
  );
  return [...sms, ...visites.filter((r) => r.canal === "email" && !annules.has(r.rendezVousId))];
};

// La conservation du suivi des e-mails (13 mois) passe en dernier : elle n'envoie rien.
export const TACHES_VEILLE: Tache[] = [tacheCartons, tacheRappelsVisites(SOURCE_RAPPELS), tacheRelances, tacheVeilleDemenagement, tacheRetentionSuivi];
