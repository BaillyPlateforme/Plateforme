import "server-only";
import { q, q1, type Row } from "./db";
import { activiteRecente, aPlanifier, relancesDevis } from "./data";
import { gmEnRetard } from "./data2";

/*
 * La page d'accueil (/) : la journée de l'agence, lue en une fois — les
 * rendez-vous et les chantiers des 7 prochains jours, ce qui attend une
 * action, l'activité récente, et les quelques nombres de la rangée du haut.
 * Les analyses (courbe du chiffre d'affaires, tunnel, répartitions) vivent
 * dans les Statistiques ; l'accueil ne lit que ce qu'il montre.
 */

/** Le premier jour d'un mois (AAAA-MM-JJ), décalé de `n` mois — même calcul que `stats()`. */
function premierDuMois(n = 0) {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function journee() {
  const d1 = premierDuMois(), d0 = premierDuMois(-1);
  // Le CA signé se rattache au déménagement, ou au mois prévu (comme le Pilotage d'avant et les statistiques).
  const CA = "coalesce(d.date_chargement, d.mois_ca)";
  const [ca, rendezVous, chantiers, relances, planifier, activite, gardeMeuble, totaux] = await Promise.all([
    q1<{ cur: number; prec: number }>(
      `select
         coalesce(sum(v.montant) filter (where ${CA} >= $1::date and ${CA} < ($1::date + interval '1 month')), 0)::float8 as cur,
         coalesce(sum(v.montant) filter (where ${CA} >= $2::date and ${CA} < $1::date), 0)::float8 as prec
       from devis v join dossiers d on d.id = v.dossier_id where v.statut = 'signe'`,
      [d1, d0],
    ),
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
    activiteRecente(6),
    gmEnRetard(),
    // Les vrais nombres de la rangée du haut : les listes ci-dessus sont tronquées (8 chantiers, 6 relances,
    // 8 rendez-vous sur la semaine) ; les tuiles affichaient leur longueur (8 déménagements quand il y en avait 9).
    q1<{ chantiers: number; relances: number; visites: number }>(`select
       (select count(*) from dossiers d where d.date_chargement between current_date and current_date + 6 and d.statut <> 'perdu')::int as chantiers,
       (select count(distinct d.id) from devis v join dossiers d on d.id = v.dossier_id
         where v.statut = 'envoye' and d.statut = 'devis' and v.envoye_le < now() - interval '2 days')::int as relances,
       (select count(*) from rendez_vous r where r.type in ('phys', 'visio')
         and (r.debut at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date)::int as visites`),
  ]);
  return {
    ca: { cur: ca?.cur ?? 0, prec: ca?.prec ?? 0 },
    rendezVous: rendezVous as Row[],
    chantiers: chantiers as Row[],
    relances,
    planifier,
    activite,
    gardeMeuble,
    nombreChantiers: totaux?.chantiers ?? chantiers.length,
    nombreRelances: totaux?.relances ?? relances.length,
    visitesDuJour: totaux?.visites ?? 0,
  };
}
