import "server-only";
import { q, type Db } from "@/crm/lib/db";
import { instantParis, jourParis, jourSemaine, lendemain } from "@/lib/visite/regles";

/*
 * Les créneaux libres d'un commercial, tirés de son planning.
 *
 * Est occupé tout ce qui figure au planning commercial du commercial
 * (visites, visios, tâches, règles perso comme « semaine des enfants »), et
 * les créneaux qu'il propose encore à d'autres clients : tant que la
 * proposition est ouverte, ils lui sont réservés. La même règle est tenue
 * par la base au moment de réserver (ec_poser_visite_crm, migration 0013).
 *
 * Les heures proposées d'office sont des points de départ : du lundi au
 * vendredi, 9 h, 10 h 30, 14 h et 16 h, à partir du lendemain et sur trois
 * semaines, deux au plus par jour pour laisser le choix entre plusieurs
 * journées. Le commercial peut toujours ajouter une autre heure à la main.
 */

export const HEURES_PROPOSEES = ["09:00", "10:30", "14:00", "16:00"];
const JOURS_OUVRES = new Set([1, 2, 3, 4, 5]);
const HORIZON_JOURS = 21;
const PAR_JOUR = 2;

export type Plage = { debut: number; fin: number; libelle: string };
export type Suggestion = { debut: string; jour: string; heure: string };

/**
 * Ce qui occupe le commercial entre deux instants. `sauf` : le dossier dont
 * on refait la proposition — ses anciens créneaux vont se libérer.
 */
export async function occupation(commercialId: number, de: Date, a: Date, sauf?: number | null, db?: Db): Promise<Plage[]> {
  const lire = <T,>(sql: string, p: unknown[]) => (db ? db.query<T>(sql, p) : q<T>(sql, p));
  const lignes = await lire<{ debut: Date; duree_min: number; libelle: string }>(
    `select r.debut, r.duree_min, r.titre as libelle from rendez_vous r
      where r.commercial_id = $1 and r.debut < $3 and r.debut + make_interval(mins => r.duree_min) > $2
     union all
     select c.debut, p.duree_min, 'Créneau proposé à un autre client' from creneaux_visite c join propositions_visite p on p.id = c.proposition_id
      where p.commercial_id = $1 and p.statut = 'ouverte' and c.statut = 'propose' and p.dossier_id <> coalesce($4::int, -1)
        and c.debut < $3 and c.debut + make_interval(mins => p.duree_min) > $2`,
    [commercialId, de.toISOString(), a.toISOString(), sauf ?? null],
  );
  return lignes.map((l) => ({ debut: new Date(l.debut).getTime(), fin: new Date(l.debut).getTime() + l.duree_min * 60_000, libelle: l.libelle }));
}

/** Le créneau chevauche-t-il l'une des plages ? Rend la première, ou null. */
export const conflit = (plages: Plage[], debut: Date, dureeMin: number) => {
  const d = debut.getTime();
  const f = d + dureeMin * 60_000;
  return plages.find((p) => p.debut < f && p.fin > d) ?? null;
};

/** Les prochains créneaux libres du commercial, pour une visite de `dureeMin` minutes. */
export async function suggestions(commercialId: number, dureeMin: number, options: { nb?: number; sauf?: number | null; maintenant?: Date } = {}): Promise<Suggestion[]> {
  const nb = options.nb ?? 8;
  const maintenant = options.maintenant ?? new Date();
  const premier = lendemain(jourParis(maintenant));
  const dernier = lendemain(premier, HORIZON_JOURS);
  const plages = await occupation(commercialId, instantParis(premier, "00:00"), instantParis(dernier, "00:00"), options.sauf);
  const out: Suggestion[] = [];
  for (let jour = premier; jour < dernier && out.length < nb; jour = lendemain(jour)) {
    if (!JOURS_OUVRES.has(jourSemaine(jour))) continue;
    let ce = 0;
    for (const heure of HEURES_PROPOSEES) {
      if (ce >= PAR_JOUR || out.length >= nb) break;
      const debut = instantParis(jour, heure);
      if (conflit(plages, debut, dureeMin)) continue;
      // Deux créneaux d'une même journée : l'un le matin, l'autre l'après-midi.
      if (ce === 1 && out[out.length - 1]?.jour === jour && Number(out[out.length - 1].heure.slice(0, 2)) < 12 === Number(heure.slice(0, 2)) < 12) continue;
      out.push({ debut: debut.toISOString(), jour, heure });
      ce++;
    }
  }
  return out;
}
