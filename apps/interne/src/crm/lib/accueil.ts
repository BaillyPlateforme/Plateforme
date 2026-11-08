import "server-only";
import { q, q1, type Row } from "./db";
import { activiteRecente, aPlanifier, relancesDevis, stats } from "./data";
import { gmEnRetard } from "./data2";

/*
 * Le tableau de bord de la page d'accueil : la journée de l'agence, lue en
 * une fois — les rendez-vous et les chantiers des 7 prochains jours,
 * ce qui attend une action, l'activité récente, et les chiffres du mois
 * (repris de `stats()`, qui sert aussi la page Pilotage).
 */
export async function journee() {
  const [chiffres, rendezVous, chantiers, relances, planifier, activite, gardeMeuble, totaux] = await Promise.all([
    stats(),
    q(`select r.id, r.type, r.titre, r.lieu, r.debut, r.duree_min, r.dossier_id, r.termine, u.nom as commercial, u.initiales
       from rendez_vous r join utilisateurs u on u.id = r.commercial_id
       where (r.debut at time zone 'Europe/Paris')::date between (now() at time zone 'Europe/Paris')::date and (now() at time zone 'Europe/Paris')::date + 6
         and r.type in ('phys', 'visio', 'tache')
       order by r.debut limit 8`),
    q(`select d.id, d.ref, d.date_chargement, d.volume::float8 as volume, d.statut, c.nom, c.prenom, c.societe,
         (select adresse from etapes_trajet where dossier_id = d.id and genre = 'depart' order by ordre limit 1) as depart,
         (select adresse from etapes_trajet where dossier_id = d.id and genre = 'arrivee' order by ordre desc limit 1) as arrivee
       from dossiers d join clients c on c.id = d.client_id
       where d.date_chargement between current_date and current_date + 6 and d.statut <> 'perdu'
       order by d.date_chargement, d.id limit 8`),
    relancesDevis(),
    aPlanifier(),
    activiteRecente(5),
    gmEnRetard(),
    // Les vrais nombres des chiffres du haut : les listes ci-dessus sont tronquées (8 chantiers, 6 relances),
    // les tuiles affichaient leur longueur (8 déménagements quand il y en avait 9).
    q1<{ chantiers: number; relances: number }>(`select
       (select count(*) from dossiers d where d.date_chargement between current_date and current_date + 6 and d.statut <> 'perdu')::int as chantiers,
       (select count(distinct d.id) from devis v join dossiers d on d.id = v.dossier_id
         where v.statut = 'envoye' and d.statut = 'devis' and v.envoye_le < now() - interval '2 days')::int as relances`),
  ]);
  return {
    chiffres, rendezVous: rendezVous as Row[], chantiers: chantiers as Row[], relances, planifier, activite, gardeMeuble,
    nombreChantiers: totaux?.chantiers ?? chantiers.length, nombreRelances: totaux?.relances ?? relances.length,
  };
}
