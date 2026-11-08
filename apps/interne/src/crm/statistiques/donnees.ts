import "server-only";
import { q, q1 } from "@/crm/lib/db";
import { comparaisonDe, douzeMois, type Intervalle, type Periode } from "./periodes";

/*
 * Les lectures des statistiques (Créagidem : « Stats Comm. » et « Stats
 * Exploit. »), dans le schéma `crm` comme le reste du CRM. Lecture seule.
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
 *   visités sur la période, ceux qui ont reçu un devis ;
 * - l'entonnoir : les dossiers OUVERTS sur la période (leur création), et
 *   parmi eux ceux qui ont reçu un devis, puis ceux qui sont signés à ce
 *   jour — une même cohorte, donc chaque étape est contenue dans la
 *   précédente (les visites, comptées par rendez-vous, ne le sont pas).
 * Le commercial d'un devis est celui du dossier.
 *
 * Chaque tuile se compare à la période d'avant (periodes.ts, comparaisonDe) ;
 * ses petites colonnes sont les douze derniers mois.
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
/** Le premier envoi de devis de chaque dossier devisé, et s'il est signé aujourd'hui. */
const DOSSIERS_DEVISES = `select v.dossier_id, min(coalesce(v.envoye_le, v.cree_le)) as le, bool_or(v.statut = 'signe') as signe
  from devis v where v.statut in ('envoye','signe','refuse') group by 1`;

/** Une valeur par mois des douze derniers mois (0 quand rien). */
const parMois = (mois: string[], lignes: { mois: string; v: number }[]) => mois.map((m) => lignes.filter((x) => x.mois === m).reduce((a, x) => a + x.v, 0));

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

/** Les chiffres de chaque commercial entre deux dates. */
function lignesCommerciales(i: Intervalle, rattachement: Rattachement) {
  return q<LigneCommercial>(
    `with vis as (
       select r.commercial_id as cid, count(*)::int as visites,
         count(distinct r.dossier_id)::int as vd,
         count(distinct r.dossier_id) filter (where exists (
           select 1 from devis v where v.dossier_id = r.dossier_id and v.statut in ('envoye','signe','refuse')))::int as vdv
       from rendez_vous r
       where r.type in ('phys','visio') and ${JOUR_PARIS("r.debut")} >= $1::date and ${JOUR_PARIS("r.debut")} < $2::date
       group by 1),
     dd as (${DOSSIERS_DEVISES}),
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
    [i.debut, i.fin, rattachement],
  );
}

const lireArrhes = (i: Intervalle) =>
  q1<{ n: number; total: number }>(
    `select count(*)::int as n, coalesce(sum(montant), 0)::float8 as total from paiements
     where nature = 'arrhes' and recu_le >= $1::date and recu_le < $2::date`,
    [i.debut, i.fin],
  ).then((a) => ({ n: a?.n ?? 0, total: a?.total ?? 0 }));

export type TotauxCommerciaux = { visites: number; vd: number; vdv: number; devises: number; ds: number; signes: number; ca: number; arrhes: number };

const sommer = (lignes: LigneCommercial[], arrhes: number): TotauxCommerciaux =>
  lignes.reduce(
    (a, l) => ({ ...a, visites: a.visites + l.visites, vd: a.vd + l.visitesDossiers, vdv: a.vdv + l.visitesDevisees, devises: a.devises + l.devises, ds: a.ds + l.devisesSignes, signes: a.signes + l.signes, ca: a.ca + l.ca }),
    { visites: 0, vd: 0, vdv: 0, devises: 0, ds: 0, signes: 0, ca: 0, arrhes },
  );

async function totauxCommerciaux(i: Intervalle, rattachement: Rattachement) {
  const [lignes, arrhes] = await Promise.all([lignesCommerciales(i, rattachement), lireArrhes(i)]);
  return sommer(lignes, arrhes.total);
}

export async function statsCommerciales(p: Periode, rattachement: Rattachement) {
  const { mois, debut: s0, fin: s1 } = douzeMois();
  // Les signatures ne se datent que dans le passé : on compare « à date ». Le CA rattaché au déménagement compte aussi le planning : la période d'avant, entière.
  const cmp = comparaisonDe(p, rattachement === "signature" ? "a-date" : "entiere");
  const memeBornes = cmp.courante.fin === p.fin;
  const unAnAvant = (j: string) => `${Number(j.slice(0, 4)) - 1}${j.slice(4)}`;
  const [lignes, serie, seriePrec, mensuel, sansDate, arrhes, clients, cohorte, utilisateurs, avant, courant] = await Promise.all([
    lignesCommerciales(p, rattachement),
    q<{ cid: number | null; mois: string; ca: number; n: number }>(
      `select d.commercial_id as cid, to_char(${DATE_CA}, 'YYYY-MM') as mois, sum(v.montant)::float8 as ca, count(distinct d.id)::int as n
       from devis v join dossiers d on d.id = v.dossier_id
       where v.statut = 'signe' and ${DATE_CA} >= $1::date and ${DATE_CA} < $2::date
       group by 1, 2`,
      [s0, s1, rattachement],
    ),
    // Le même CA, un an plus tôt, mois par mois : la courbe de comparaison.
    q<{ mois: string; v: number }>(
      `select to_char(${DATE_CA} + interval '1 year', 'YYYY-MM') as mois, sum(v.montant)::float8 as v
       from devis v join dossiers d on d.id = v.dossier_id
       where v.statut = 'signe' and ${DATE_CA} >= $1::date and ${DATE_CA} < $2::date
       group by 1`,
      [unAnAvant(s0), unAnAvant(s1), rattachement],
    ),
    // Les petites colonnes des tuiles : visites, dossiers devisés (et signés depuis), arrhes, mois par mois.
    q<{ k: "visites" | "devises" | "arrhes"; mois: string; v: number; w: number }>(
      `with dd as (${DOSSIERS_DEVISES})
       select 'visites' as k, to_char(${JOUR_PARIS("r.debut")}, 'YYYY-MM') as mois, count(*)::float8 as v, 0::float8 as w
         from rendez_vous r where r.type in ('phys','visio') and ${JOUR_PARIS("r.debut")} >= $1::date and ${JOUR_PARIS("r.debut")} < $2::date group by 2
       union all
       select 'devises', to_char(${JOUR_PARIS("dd.le")}, 'YYYY-MM'), count(*)::float8, (count(*) filter (where dd.signe))::float8
         from dd where ${JOUR_PARIS("dd.le")} >= $1::date and ${JOUR_PARIS("dd.le")} < $2::date group by 2
       union all
       select 'arrhes', to_char(recu_le, 'YYYY-MM'), coalesce(sum(montant), 0)::float8, count(*)::float8
         from paiements where nature = 'arrhes' and recu_le >= $1::date and recu_le < $2::date group by 2`,
      [s0, s1],
    ),
    rattachement === "demenagement"
      ? q1<{ n: number; ca: number }>(
          `select count(*)::int as n, coalesce(sum(v.montant), 0)::float8 as ca from devis v join dossiers d on d.id = v.dossier_id
           where v.statut = 'signe' and d.date_chargement is null and d.mois_ca is null`,
        )
      : Promise.resolve(undefined),
    // Repris du Pilotage (l'ancienne page d'accueil) : les arrhes reçues et la répartition des nouveaux
    // dossiers par type de client, sur la période choisie (le Pilotage les donnait au mois et à 90 jours).
    lireArrhes(p),
    q<{ type: string; n: number }>(
      `select coalesce(c.type, 'particulier') as type, count(*)::int as n from dossiers d join clients c on c.id = d.client_id
       where ${JOUR_PARIS("d.cree_le")} >= $1::date and ${JOUR_PARIS("d.cree_le")} < $2::date group by 1 order by 2 desc`,
      [p.debut, p.fin],
    ),
    // L'entonnoir : les dossiers ouverts sur la période, devisés depuis, signés à ce jour (une seule cohorte).
    q<{ cid: number | null; ouverts: number; visites: number; devises: number; signes: number }>(
      `select d.commercial_id as cid, count(*)::int as ouverts,
         count(*) filter (where exists (select 1 from rendez_vous r where r.dossier_id = d.id and r.type in ('phys','visio')))::int as visites,
         count(*) filter (where exists (select 1 from devis v where v.dossier_id = d.id and v.statut in ('envoye','signe','refuse')))::int as devises,
         count(*) filter (where exists (select 1 from devis v where v.dossier_id = d.id and v.statut = 'signe'))::int as signes
       from dossiers d
       where ${JOUR_PARIS("d.cree_le")} >= $1::date and ${JOUR_PARIS("d.cree_le")} < $2::date
       group by 1`,
      [p.debut, p.fin],
    ),
    q<{ id: number; role: string }>("select id, role from utilisateurs"),
    totauxCommerciaux(cmp.precedente, rattachement),
    memeBornes ? Promise.resolve(null) : totauxCommerciaux(cmp.courante, rattachement),
  ]);
  // « Sans commercial » n'apparaît que s'il porte quelque chose sur la période.
  const visibles = lignes.filter((l) => l.id != null || l.visites + l.devises + l.signes > 0);
  const totaux = sommer(lignes, arrhes.total);
  const de = (k: string, champ: "v" | "w") => parMois(mois, mensuel.filter((x) => x.k === k).map((x) => ({ mois: x.mois, v: x[champ] })));
  return {
    lignes: visibles,
    totaux,
    mois,
    serie,
    sansDate: sansDate && sansDate.n > 0 ? sansDate : null,
    arrhes,
    clients,
    cohorte,
    utilisateurs,
    comparaison: { libelle: cmp.libelle, precis: cmp.precis, avant, courant: courant ?? totaux },
    mensuel: {
      ca: parMois(mois, serie.map((x) => ({ mois: x.mois, v: x.ca }))),
      signes: parMois(mois, serie.map((x) => ({ mois: x.mois, v: x.n }))),
      caAnPasse: parMois(mois, seriePrec),
      visites: de("visites", "v"),
      devises: de("devises", "v"),
      devisesSignes: de("devises", "w"),
      arrhes: de("arrhes", "v"),
    },
  };
}

/* ───────────────────────── Exploitation ───────────────────────── */

const CONFIRMES = "statut in ('commande','planifie','termine')";

const lireDemenagements = (i: Intervalle) =>
  q1<{ n: number; volume: number; moyen: number | null; termines: number }>(
    `select count(*)::int as n, coalesce(sum(volume), 0)::float8 as volume, avg(nullif(volume, 0))::float8 as moyen,
       count(*) filter (where statut = 'termine')::int as termines
     from dossiers where ${CONFIRMES} and date_chargement >= $1::date and date_chargement < $2::date`,
    [i.debut, i.fin],
  ).then((x) => x ?? { n: 0, volume: 0, moyen: null, termines: 0 });

/** Les lettres de voiture d'une période (datées du chargement, à défaut de la livraison), et celles qui sont sous-traitées. */
const LETTRES = `select l.prix_sous_traitance::float8 as prix, coalesce(l.date_chargement, l.date_livraison) as j,
    (l.prix_sous_traitance is not null or s.categorie in ('sous_traitant','partenaire')) as st
  from lettres_voiture l left join sous_traitants s on s.id = l.sous_traitant_id`;

const lireSousTraitance = (i: Intervalle) =>
  q1<{ total: number; sous_traitees: number; cout: number; sans_prix: number }>(
    `select count(*)::int as total, count(*) filter (where st)::int as sous_traitees,
       coalesce(sum(prix) filter (where st), 0)::float8 as cout, count(*) filter (where st and prix is null)::int as sans_prix
     from (${LETTRES}) x
     where j >= $1::date and j < $2::date`,
    [i.debut, i.fin],
  ).then((x) => x ?? { total: 0, sous_traitees: 0, cout: 0, sans_prix: 0 });

export async function statsExploitation(p: Periode) {
  const { mois, debut: s0, fin: s1 } = douzeMois();
  const P = [p.debut, p.fin];
  // Les déménagements se datent aussi dans l'avenir (le planning) : la période d'avant, entière.
  const cmp = comparaisonDe(p, "entiere");
  const [dem, types, serie, serieSt, aPlanifier, equipes, st, prestataires, conteneurs, gm, litiges, demAvant, stAvant] = await Promise.all([
    lireDemenagements(p),
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
    q<{ mois: string; n: number; cout: number }>(
      `select to_char(j, 'YYYY-MM') as mois, count(*) filter (where st)::int as n, coalesce(sum(prix) filter (where st), 0)::float8 as cout
       from (${LETTRES}) x where j >= $1::date and j < $2::date group by 1`,
      [s0, s1],
    ),
    // Les signés sans date de chargement, parmi tous les signés pas encore planifiés.
    q1<{ n: number; signes: number }>("select count(*) filter (where date_chargement is null)::int as n, count(*)::int as signes from dossiers where statut = 'commande'"),
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
    lireSousTraitance(p),
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
    lireDemenagements(cmp.precedente),
    lireSousTraitance(cmp.precedente),
  ]);
  return {
    dem,
    types,
    mois,
    serie,
    mensuel: {
      n: parMois(mois, serie.map((x) => ({ mois: x.mois, v: x.n }))),
      volume: parMois(mois, serie.map((x) => ({ mois: x.mois, v: x.volume }))),
      sousTraitees: parMois(mois, serieSt.map((x) => ({ mois: x.mois, v: x.n }))),
      cout: parMois(mois, serieSt.map((x) => ({ mois: x.mois, v: x.cout }))),
    },
    aPlanifier: aPlanifier?.n ?? 0,
    signes: aPlanifier?.signes ?? 0,
    equipes,
    sousTraitance: st,
    prestataires,
    conteneurs,
    gm: gm!,
    litiges: litiges!,
    comparaison: { libelle: cmp.libelle, precis: cmp.precis, dem: demAvant, sousTraitance: stAvant },
  };
}
