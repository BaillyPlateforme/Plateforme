import "server-only";
import { q } from "@/crm/lib/db";
import { occupation } from "@/crm/visites/creneaux";
import { distancesParLaRoute, situer, situerTout } from "@/crm/visites/geo";
import {
  conseiller, lieuDuRdv, trajetEstime, trajetParLaRoute, villeDe,
  type Conseil, type EtapeLieu, type LieuPlanning, type Trajet,
} from "@/crm/visites/proximite";
import { instantParis, jourParis, jourSemaine, lendemain } from "@/lib/visite/regles";

/*
 * Le planificateur de visite et la géographie (retours de Céline,
 * 16/11/2026) : pour l'adresse de la visite que l'on planifie,
 *   - la distance et le temps moyen depuis chaque rendez-vous situé de la
 *     semaine montrée (le survol d'une visite placée) ;
 *   - les créneaux les plus cohérents sur trois semaines, près des visites
 *     déjà programmées (proximite.ts, `conseiller`).
 * Les adresses sont situées par la Base Adresse, la route mesurée par OSRM
 * en un seul appel (geo.ts) ; sans réponse, la distance est estimée.
 */

const HORIZON_JOURS = 21;
const JOURS_OUVRES = new Set([1, 2, 3, 4, 5]);

export interface Proximite {
  /** L'adresse de la visite, telle que la Base Adresse l'a située (ou non). */
  cible: { ville: string | null; trouvee: boolean };
  /** Par rendez-vous de la semaine montrée : sa ville et le trajet jusqu'à l'adresse de la visite. */
  trajets: Record<number, Trajet & { ville: string | null }>;
  /** Les créneaux les plus cohérents (trois au plus), du plus petit détour au plus grand. */
  conseils: Conseil[];
}

type Ligne = { id: number; type: string; titre: string; lieu: string | null; debut: Date; duree_min: number; etape: EtapeLieu };

/** Les rendez-vous du commercial qui ont un lieu (visites sur place, tâches), entre deux instants. */
const lieuxDuCommercial = (commercialId: number, de: Date, a: Date, saufRdv: number | null) =>
  q<Ligne>(
    `select r.id, r.type, r.titre, r.lieu, r.debut, r.duree_min,
            (select json_build_object('adresse', e.adresse, 'code_postal', e.code_postal, 'ville', e.ville) from etapes_trajet e
              where e.dossier_id = r.dossier_id and (btrim(coalesce(e.adresse, '')) <> '' or btrim(coalesce(e.ville, '')) <> '')
              order by (lower(btrim(coalesce(e.adresse, ''))) = lower(btrim(coalesce(r.lieu, '')))) desc, (e.genre = 'depart') desc, e.ordre, e.id
              limit 1) as etape
       from rendez_vous r
      where r.commercial_id = $1 and r.type in ('phys', 'tache') and not r.journee and not r.sans_suite and r.duree_min > 0
        and r.debut >= $2 and r.debut < $3 and r.id <> coalesce($4::int, -1)
      order by r.debut, r.id`,
    [commercialId, de.toISOString(), a.toISOString(), saufRdv],
  );

export async function proximite(o: {
  commercialId: number;
  /** Le lundi de la semaine montrée (AAAA-MM-JJ). */
  lundi: string;
  adresse: string;
  dossierId: number | null;
  duree: number;
  saufRdv: number | null;
  maintenant?: Date;
}): Promise<Proximite> {
  const maintenant = o.maintenant ?? new Date();
  // L'adresse de la visite : l'étape du dossier qui porte la même lui prête son code postal et sa ville (une rue
  // seule, « 12 Rue de Versailles », se trouve dans vingt communes).
  const etape = o.dossierId
    ? (
        await q<{ etape: EtapeLieu }>(
          `select json_build_object('adresse', e.adresse, 'code_postal', e.code_postal, 'ville', e.ville) as etape from etapes_trajet e
            where e.dossier_id = $1 and lower(btrim(coalesce(e.adresse, ''))) = lower(btrim($2)) order by e.ordre, e.id limit 1`,
          [o.dossierId, o.adresse],
        )
      )[0]?.etape ?? null
    : null;
  const lieuCible = lieuDuRdv({ type: "phys", lieu: o.adresse, etape });
  const cible = await situer(lieuCible.adresse ?? o.adresse);
  const vide: Proximite = { cible: { ville: lieuCible.ville ?? villeDe(o.adresse), trouvee: !!cible }, trajets: {}, conseils: [] };
  if (!cible) return vide;

  // La semaine montrée (pour le survol) et les trois semaines à venir (pour les conseils).
  const premier = lendemain(jourParis(maintenant));
  const dernier = lendemain(premier, HORIZON_JOURS);
  const finSemaine = lendemain(o.lundi, 7);
  const de = instantParis(o.lundi < premier ? o.lundi : premier, "00:00");
  const a = instantParis(finSemaine > dernier ? finSemaine : dernier, "00:00");
  const [lignes, occupe] = await Promise.all([
    lieuxDuCommercial(o.commercialId, de, a, o.saufRdv),
    occupation(o.commercialId, instantParis(premier, "00:00"), instantParis(dernier, "00:00"), o.dossierId, undefined, o.saufRdv),
  ]);

  const lieux = lignes.map((l) => ({ l, ...lieuDuRdv(l) }));
  const points = await situerTout(lieux.map((x) => x.adresse ?? ""));
  const situes = lieux
    .map(({ l, adresse, ville }) => {
      const point = adresse ? points.get(adresse) : null;
      if (!point) return null;
      const debut = new Date(l.debut).getTime();
      return { id: l.id, debut, fin: debut + l.duree_min * 60_000, titre: l.titre, ville, point } satisfies LieuPlanning;
    })
    .filter((x): x is LieuPlanning => !!x);

  // La route, en un seul appel ; sans réponse, l'estimation.
  const routes = await distancesParLaRoute(situes.map((s) => s.point), cible);
  const trajet = new Map<number, Trajet>(situes.map((s, i) => [s.id, routes[i] != null ? trajetParLaRoute(routes[i]!) : trajetEstime(s.point, cible)]));

  const semaine = new Set(Array.from({ length: 7 }, (_, i) => lendemain(o.lundi, i)));
  const trajets: Proximite["trajets"] = {};
  for (const s of situes) if (semaine.has(jourParis(new Date(s.debut)))) trajets[s.id] = { ...trajet.get(s.id)!, ville: s.ville };

  const jours: string[] = [];
  for (let j = premier; j < dernier; j = lendemain(j)) if (JOURS_OUVRES.has(jourSemaine(j))) jours.push(j);
  const conseils = conseiller({
    cible,
    duree: o.duree,
    jours,
    occupation: occupe,
    lieux: situes,
    maintenant: maintenant.getTime(),
    trajetVers: (l: LieuPlanning) => trajet.get(l.id),
  });
  return { cible: { ville: vide.cible.ville, trouvee: true }, trajets, conseils };
}

