import "server-only";
import { q, q1 } from "@/crm/lib/db";
import { douzeMois, type Periode } from "./periodes";

/*
 * Les lectures des statistiques (Créagidem : « Stats Comm. » et « Stats
 * Exploit. »), dans le schéma `crm` comme le reste du CRM.
 *
 * Commerciales — par commercial, sur la période :
 * - visites : rendez-vous de type visite physique ou visio (crm.rendez_vous),
 *   au nom du commercial du rendez-vous, datés par leur début ;
 * - devisés : DOSSIERS ayant au moins un devis envoyé, signé ou refusé (Bailly
 *   envoie trois formules par dossier : on compte le dossier, pas la ligne),
 *   datés par le premier envoi (à défaut, la création du devis) ;
 * - signés et CA : devis signés, datés par la signature (à défaut, la
 *   création), ou rattachés au déménagement (date de chargement, à défaut le
 *   mois prévu, comme le chiffre d'affaires du Pilotage). Les montants des
 *   devis sont TTC ;
 * - taux de transformation : parmi les dossiers devisés sur la période, ceux
 *   qui sont signés aujourd'hui ; visites → devis : parmi les dossiers
 *   visités sur la période, ceux qui ont reçu un devis.
 * Le commercial d'un devis est celui du dossier.
 *
 * Exploitation — sur la période : déménagements confirmés (dossiers signés,
 * planifiés ou terminés dont le chargement tombe dans la période), volumes,
 * types, occupation des équipes (lettres de voiture et opérations du
 * planning), sous-traitance (coût, part, prestataires), conteneurs partis ou
 * prévus (remplissage, marges saisies), et deux états du jour : garde-meuble
 * et litiges en cours.
 */

export type Rattachement = "signature" | "demenagement";

const JOUR_PARIS = (col: string) => `((${col}) at time zone 'Europe/Paris')::date`;
const DATE_CA = `(case when $3 = 'demenagement' then coalesce(d.date_chargement, d.mois_ca) else ${JOUR_PARIS("coalesce(v.signe_le, v.cree_le)")} end)`;

export type LigneCommercial = {
  id: number | null;
  nom: string;
  initiales: string;
  visites: number;
  visitesDossiers: number;
  visitesDevisees: number;
  devises: number;
  devisesSignes: number;
  signes: number;
  ca: number;
};

export async function statsCommerciales(p: Periode, rattachement: Rattachement) {
  const { mois, debut: s0, fin: s1 } = douzeMois();
  const [lignes, serie, sansDate] = await Promise.all([
    q<LigneCommercial>(
      `with vis as (
         select r.commercial_id as cid, count(*)::int as visites,
           count(distinct r.dossier_id)::int as vd,
           count(distinct r.dossier_id) filter (where exists (
             select 1 from devis v where v.dossier_id = r.dossier_id and v.statut in ('envoye','signe','refuse')))::int as vdv
         from rendez_vous r
         where r.type in ('phys','visio') and ${JOUR_PARIS("r.debut")} >= $1::date and ${JOUR_PARIS("r.debut")} < $2::date
         group by 1),
       dd as (
         select v.dossier_id, min(coalesce(v.envoye_le, v.cree_le)) as le, bool_or(v.statut = 'signe') as signe
         from devis v where v.statut in ('envoye','signe','refuse') group by 1),
       dev as (
         select d.commercial_id as cid, count(*)::int as devises, count(*) filter (where dd.signe)::int as ds
         from dd join dossiers d on d.id = dd.dossier_id
         where ${JOUR_PARIS("dd.le")} >= $1::date and ${JOUR_PARIS("dd.le")} < $2::date
         group by 1),
       sig as (
         select d.commercial_id as cid, count(distinct d.id)::int as signes, coalesce(sum(v.montant), 0)::float8 as ca
         from devis v join dossiers d on d.id = v.dossier_id
         where v.statut = 'signe' and ${DATE_CA} >= $1::date and ${DATE_CA} < $2::date
         group by 1),
       ids as (select cid from vis union select cid from dev union select cid from sig union select id from utilisateurs where role = 'commercial')
       select ids.cid as id, coalesce(u.nom, 'Sans commercial') as nom, coalesce(u.initiales, '—') as initiales,
         coalesce(vis.visites, 0) as visites, coalesce(vis.vd, 0) as "visitesDossiers", coalesce(vis.vdv, 0) as "visitesDevisees",
         coalesce(dev.devises, 0) as devises, coalesce(dev.ds, 0) as "devisesSignes",
         coalesce(sig.signes, 0) as signes, coalesce(sig.ca, 0)::float8 as ca
       from ids left join utilisateurs u on u.id = ids.cid
         left join vis on vis.cid is not distinct from ids.cid
         left join dev on dev.cid is not distinct from ids.cid
         left join sig on sig.cid is not distinct from ids.cid
       order by ids.cid nulls last`,
      [p.debut, p.fin, rattachement],
    ),
    q<{ cid: number | null; mois: string; ca: number; n: number }>(
      `select d.commercial_id as cid, to_char(${DATE_CA}, 'YYYY-MM') as mois, sum(v.montant)::float8 as ca, count(distinct d.id)::int as n
       from devis v join dossiers d on d.id = v.dossier_id
       where v.statut = 'signe' and ${DATE_CA} >= $1::date and ${DATE_CA} < $2::date
       group by 1, 2`,
      [s0, s1, rattachement],
    ),
    rattachement === "demenagement"
      ? q1<{ n: number; ca: number }>(
          `select count(*)::int as n, coalesce(sum(v.montant), 0)::float8 as ca from devis v join dossiers d on d.id = v.dossier_id
           where v.statut = 'signe' and d.date_chargement is null and d.mois_ca is null`,
        )
      : Promise.resolve(undefined),
  ]);
  // « Sans commercial » n'apparaît que s'il porte quelque chose.
  const visibles = lignes.filter((l) => l.id != null || l.visites + l.devises + l.signes > 0 || serie.some((x) => x.cid == null));
  return { lignes: visibles, mois, serie, sansDate: sansDate && sansDate.n > 0 ? sansDate : null };
}

/* ───────────────────────── Exploitation ───────────────────────── */

const CONFIRMES = "statut in ('commande','planifie','termine')";

export async function statsExploitation(p: Periode) {
  const { mois, debut: s0, fin: s1 } = douzeMois();
  const P = [p.debut, p.fin];
  const [dem, types, serie, aPlanifier, equipes, st, prestataires, conteneurs, gm, litiges] = await Promise.all([
    q1<{ n: number; volume: number; moyen: number | null; termines: number }>(
      `select count(*)::int as n, coalesce(sum(volume), 0)::float8 as volume, avg(nullif(volume, 0))::float8 as moyen,
         count(*) filter (where statut = 'termine')::int as termines
       from dossiers where ${CONFIRMES} and date_chargement >= $1::date and date_chargement < $2::date`,
      P,
    ),
    q<{ type: string; n: number; volume: number }>(
      `select coalesce(type_demenagement, 'national') as type, count(*)::int as n, coalesce(sum(volume), 0)::float8 as volume
       from dossiers where ${CONFIRMES} and date_chargement >= $1::date and date_chargement < $2::date
       group by 1 order by 2 desc, 1`,
      P,
    ),
    q<{ mois: string; n: number; volume: number }>(
      `select to_char(date_chargement, 'YYYY-MM') as mois, count(*)::int as n, coalesce(sum(volume), 0)::float8 as volume
       from dossiers where ${CONFIRMES} and date_chargement >= $1::date and date_chargement < $2::date group by 1`,
      [s0, s1],
    ),
    q1<{ n: number }>("select count(*)::int as n from dossiers where statut = 'commande' and date_chargement is null"),
    // L'occupation des équipes : un chargement, une livraison (si elle tombe un autre jour), une opération du planning.
    q<{ equipe: string; lettres: number; autres: number }>(
      `with ev as (
         select nullif(btrim(split_part(coalesce(l.equipe, l.prestataire), ' · ', 1)), '') as eq, 'lettre' as k
           from lettres_voiture l where l.date_chargement >= $1::date and l.date_chargement < $2::date
         union all
         select nullif(btrim(split_part(coalesce(l.equipe, l.prestataire), ' · ', 1)), ''), 'lettre'
           from lettres_voiture l where l.date_livraison >= $1::date and l.date_livraison < $2::date and l.date_livraison is distinct from l.date_chargement
         union all
         select nullif(btrim(split_part(o.equipe, ' · ', 1)), ''), 'operation'
           from operations o where o.jour >= $1::date and o.jour < $2::date)
       select coalesce(eq, 'Sans équipe') as equipe, count(*) filter (where k = 'lettre')::int as lettres, count(*) filter (where k <> 'lettre')::int as autres
       from ev group by 1 order by count(*) desc, 1 limit 10`,
      P,
    ),
    q1<{ total: number; sous_traitees: number; cout: number; sans_prix: number }>(
      `select count(*)::int as total, count(*) filter (where st)::int as sous_traitees,
         coalesce(sum(prix) filter (where st), 0)::float8 as cout, count(*) filter (where st and prix is null)::int as sans_prix
       from (select l.prix_sous_traitance::float8 as prix, coalesce(l.date_chargement, l.date_livraison) as j,
               (l.prix_sous_traitance is not null or s.categorie in ('sous_traitant','partenaire')) as st
             from lettres_voiture l left join sous_traitants s on s.id = l.sous_traitant_id) x
       where j >= $1::date and j < $2::date`,
      P,
    ),
    q<{ nom: string; sid: number | null; n: number; cout: number }>(
      `select coalesce(s.nom, l.prestataire) as nom, l.sous_traitant_id as sid, count(*)::int as n, coalesce(sum(l.prix_sous_traitance), 0)::float8 as cout
       from lettres_voiture l left join sous_traitants s on s.id = l.sous_traitant_id
       where (l.prix_sous_traitance is not null or s.categorie in ('sous_traitant','partenaire'))
         and coalesce(l.date_chargement, l.date_livraison) >= $1::date and coalesce(l.date_chargement, l.date_livraison) < $2::date
       group by 1, 2 order by 4 desc, 3 desc, 1 limit 6`,
      P,
    ),
    q<{
      id: number; numero: string; sens: string; statut: string; destination: string; capacite: number; depart: string;
      utilise: number; clients: number; rp: number | null; rr: number | null; vp: number | null; vr: number | null;
    }>(
      `select c.id, c.numero, c.sens, c.statut, c.destination, c.capacite::float8 as capacite, c.depart_prevu::text as depart,
         coalesce((select sum(volume) from conteneur_dossiers where conteneur_id = c.id), 0)::float8 as utilise,
         (select count(*) from conteneur_dossiers where conteneur_id = c.id)::int as clients,
         k.rp, k.rr, k.vp, k.vr
       from conteneurs c
       left join lateral (
         select sum(revient_prevu)::float8 as rp, sum(revient_reel)::float8 as rr, sum(vente_prevue)::float8 as vp, sum(vente_reelle)::float8 as vr
         from conteneur_couts where conteneur_id = c.id) k on true
       where c.depart_prevu >= $1::date and c.depart_prevu < $2::date
       order by c.depart_prevu, c.id`,
      P,
    ),
    q1<{ contrats: number; caisses: number; loyers: number; nouveaux: number }>(
      `select count(*) filter (where actif)::int as contrats, coalesce(sum(nb_caisses) filter (where actif), 0)::int as caisses,
         coalesce(sum(loyer_mensuel) filter (where actif), 0)::float8 as loyers,
         count(*) filter (where debut >= $1::date and debut < $2::date)::int as nouveaux
       from garde_meuble`,
      P,
    ),
    q1<{ ouverts: number; montant: number; enCours: number; montantEnCours: number; clos: number }>(
      `select count(*) filter (where ouvert_le >= $1::date and ouvert_le < $2::date)::int as ouverts,
         coalesce(sum(montant) filter (where ouvert_le >= $1::date and ouvert_le < $2::date), 0)::float8 as montant,
         count(*) filter (where statut <> 'clos')::int as "enCours",
         coalesce(sum(montant) filter (where statut <> 'clos'), 0)::float8 as "montantEnCours",
         count(*) filter (where statut = 'clos' and clos_le >= $1::date and clos_le < $2::date)::int as clos
       from litiges`,
      P,
    ),
  ]);
  return {
    dem: dem!,
    types,
    mois,
    serie,
    aPlanifier: aPlanifier?.n ?? 0,
    equipes,
    sousTraitance: st!,
    prestataires,
    conteneurs,
    gm: gm!,
    litiges: litiges!,
  };
}
