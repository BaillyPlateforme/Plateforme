import "server-only";
import { q, q1 } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { creneauxProposesSemaine } from "@/crm/visites/donnees";
import { estVisite, etatVisite, type EtatVisite } from "@/crm/visites/cycle";
import { rappelPrevu } from "@/crm/visites/rappels";
import { jourParis, minutesParis } from "@/lib/visite/regles";

/*
 * Le planning commercial, lu pour la grille : chaque rendez-vous avec son
 * jour et ses minutes à l'heure de Paris (le serveur peut être réglé en UTC),
 * l'état de la visite dans son cycle, et le rappel de la veille prévu. Les
 * créneaux proposés aux clients y tiennent leur place.
 */

export interface EvenementPlanning {
  id: number;
  type: "phys" | "visio" | "tache" | "perso";
  titre: string;
  lieu: string | null;
  jour: string;
  debutMin: number;
  duree: number;
  journee: boolean;
  commercial: string;
  initiales: string;
  dossierId: number | null;
  ref: string | null;
  termine: boolean;
  devisEtabli: boolean;
  etat: Exclude<EtatVisite, "a_planifier"> | null;
  dernier: boolean;
  rappel: ("sms" | "email")[] | null;
}

export interface CreneauPlanning {
  id: number;
  jour: string;
  debutMin: number;
  duree: number;
  client: string;
  dossierId: number;
  initiales: string;
}

/** Les sept jours d'une semaine, AAAA-MM-JJ à Paris, du lundi au dimanche. */
export function joursDeLaSemaine(lundi: Date) {
  // À midi : un lundi lu à minuit d'un autre fuseau reste le bon jour.
  return Array.from({ length: 7 }, (_, i) => jourParis(new Date(lundi.getTime() + i * 86_400_000 + 12 * 3_600_000)));
}

export async function planningSemaine(lundi: Date, commercialId: number | null) {
  // Quelques heures de marge de chaque côté : le lundi du serveur n'est pas forcément minuit à Paris.
  const de = new Date(lundi.getTime() - 6 * 3_600_000);
  const a = new Date(lundi.getTime() + 7 * 86_400_000 + 6 * 3_600_000);
  const jours = joursDeLaSemaine(lundi);
  const [lignes, proposes] = await Promise.all([
    q(
      `select r.id, r.type, r.titre, r.lieu, r.debut, r.duree_min, r.journee, r.termine, r.devis_etabli, r.sans_suite, r.dossier_id,
              u.nom as commercial, u.initiales, d.ref, d.statut as dossier_statut, d.passer_en_dernier as dernier,
              c.email, c.telephone, c.notes as client_notes,
              exists (select 1 from visites v where v.rendez_vous_id = r.id and v.statut = 'signee') as compte_rendu_signe
         from rendez_vous r join utilisateurs u on u.id = r.commercial_id
         left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id
        where r.debut >= $1 and r.debut < $2 and ($3::int is null or r.commercial_id = $3)
        order by r.debut, r.id`,
      [de.toISOString(), a.toISOString(), commercialId],
    ),
    creneauxProposesSemaine(de, commercialId),
  ]);
  const evenements: EvenementPlanning[] = lignes
    .map((r) => {
      const visite = estVisite(r.type) && !!r.dossier_id && !r.journee;
      const rappel = r.dossier_id && !r.journee ? rappelPrevu(r as { type: string; dossier_id: number; debut: Date; termine: boolean }, { email: r.email, telephone: r.telephone, notes: r.client_notes }) : null;
      return {
        id: r.id, type: r.type, titre: r.titre, lieu: r.lieu, jour: jourParis(r.debut), debutMin: minutesParis(r.debut), duree: r.duree_min,
        journee: r.journee, commercial: r.commercial, initiales: r.initiales, dossierId: r.dossier_id, ref: r.ref, termine: r.termine,
        devisEtabli: r.devis_etabli, etat: visite ? etatVisite(r as Parameters<typeof etatVisite>[0]) : null, dernier: !!r.dernier,
        rappel: rappel ? rappel.canaux : null,
      };
    })
    .filter((e) => jours.includes(e.jour));
  const creneaux: CreneauPlanning[] = proposes
    .map((c) => ({
      id: c.id, jour: jourParis(c.debut), debutMin: minutesParis(c.debut), duree: c.duree_min, client: c.societe || nomClient(c),
      dossierId: c.dossier_id, initiales: c.initiales,
    }))
    .filter((c) => jours.includes(c.jour));
  return { jours, evenements, creneaux };
}

/** Un rendez-vous, pour sa page de modification. */
export const rendezVous = (id: number) =>
  Number.isSafeInteger(id) && id > 0
    ? q1(
        `select r.*, u.nom as commercial, d.ref, d.statut as dossier_statut, c.civilite, c.prenom, c.nom, c.societe, c.telephone as client_telephone,
                exists (select 1 from visites v where v.rendez_vous_id = r.id and v.statut = 'signee') as compte_rendu_signe
           from rendez_vous r join utilisateurs u on u.id = r.commercial_id
           left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id
          where r.id = $1`,
        [id],
      )
    : Promise.resolve(undefined);

/** Les étapes du trajet d'un dossier, avec tous les champs de la fenêtre de visite. */
export const etapesDossier = (dossierId: number) =>
  q(
    `select id, ordre, genre, adresse, code_postal, ville, pays, telephone, etage, ascenseur, monte_charge, transbordement, escalier,
            portage_m, stationnement, poids_lourd, monte_meuble, acces
       from etapes_trajet where dossier_id = $1 order by ordre, id`,
    [dossierId],
  );
