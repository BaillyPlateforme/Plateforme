import "server-only";
import { q } from "@/crm/lib/db";
import { araignees, lireDemandes } from "@/crm/demandes/donnees";
import { estOuverte, etapeDe } from "@/crm/demandes/etapes";
import { cleCommune } from "@/crm/demandes/prestige";
import { couleur, ETAPE_DEMANDE } from "@/crm/kanban/etapes";
import type { Araignee } from "@/crm/demandes/araignee";
import type { DemandeVue } from "@/crm/demandes/etapes";
import { libelleParcours, parcoursDeLaDemande, SANS_PRIX } from "@/lib/parcours";
import { aujourdhuiParis, comparaisonDe, creneauxDe, douzeMois, plusJours, type Intervalle, type Periode } from "./periodes";

/*
 * À la une (Accueil) : le pilotage des demandes du site, d'un coup d'œil.
 * Tout se lit dans la base, en lecture seule — rien n'est estimé :
 *
 * - les demandes : public.requests, datées par leur réception (created_at,
 *   jour de Paris) ;
 * - « qualifiée » : statut qualified, quoted ou won (les gestes anciens),
 *   ou portée par un dossier du CRM ; c'est la règle des statistiques des
 *   demandes, étendue aux demandes devenues dossiers pour que l'entonnoir
 *   ne perde personne ;
 * - à ouvrir : statut « new » (la pastille du menu Demandes) ;
 * - à rappeler : les rappels ouverts (request_events, type « rappel »,
 *   statut à rappeler ou en cours), comme la vue À rappeler ;
 * - l'entonnoir : les demandes reçues sur la période, puis parmi elles les
 *   qualifiées, celles qui ont un dossier (dossiers.request_id), dont le
 *   dossier a reçu un devis envoyé (crm.devis : envoyé, signé ou refusé), et
 *   dont un devis est signé — une seule cohorte ;
 * - les estimations : l'estimation du site, pour les seuls parcours qui ont
 *   un prix (pas la mutation ni l'entreprise) ;
 * - le potentiel : la note de la qualification (score_potentiel, sur 100) ;
 * - les communes : la ville de départ ; le prix médian au m² vient de
 *   crm.dvf_communes, par la commune déjà reconnue dans
 *   crm.communes_demandes (aucun géocodage ici) ;
 * - le Top 5 : les demandes ouvertes rangées comme dans Top demandes
 *   (potentiel, puis estimation, puis la plus récente), avec leur araignée.
 */

const QUALIFIEES = ["qualified", "quoted", "won"];
/** Le seuil de « Fort potentiel » de Demandes : 70/100. */
export const SEUIL_FORT = 70;
/** Les tranches de potentiel : 0–19, 20–39, 40–59, 60–79, 80–100. */
export const TRANCHES = ["0–19", "20–39", "40–59", "60–79", "80–100"];

type LigneDemande = {
  id: string;
  jour: string;
  source: "form" | "email";
  statut: string;
  estimation: number | null;
  potentiel: number | null;
  depart: string | null;
  parcours: string | null;
  transfert: string | null;
  mutation: string | null;
  espace_nom: string | null;
  express: string | null;
  dossier: boolean;
  devis: boolean;
  signe: boolean;
};

const qualifiee = (d: LigneDemande) => QUALIFIEES.includes(d.statut) || d.dossier;
const dans = (d: { jour: string }, i: Intervalle) => d.jour >= i.debut && d.jour < i.fin;
const sansPrix = (d: LigneDemande) => SANS_PRIX.has(parcoursDeLaDemande(d));
const estimationsDe = (ds: LigneDemande[]) => ds.reduce((a, d) => a + (sansPrix(d) ? 0 : (d.estimation ?? 0)), 0);
const partQualifiee = (ds: LigneDemande[]) => (ds.length ? ds.filter(qualifiee).length / ds.length : null);

/** Une demande du Top 5 : la demande, son araignée, son étape (nom et couleur du Kanban). */
export type TopDemande = { demande: DemandeVue; araignee: Araignee; etape: { label: string; couleur: string } };
export type Rappel = { id: string; requestId: string; statut: string; priorite: number | null; montant: number | null; le: string; client: string; trajet: string | null };

export async function alaUne(p: Periode) {
  const cmp = comparaisonDe(p, "a-date");
  const { mois, debut: s0 } = douzeMois();
  const aujourdhui = aujourdhuiParis();
  const depuis = [p.debut, cmp.precedente.debut, s0, plusJours(aujourdhui, -6)].sort()[0];

  const [lignes, aOuvrir, rappels, toutes] = await Promise.all([
    q<LigneDemande>(
      `select r.id, ((r.created_at at time zone 'Europe/Paris')::date)::text as jour, r.source::text as source, r.status::text as statut,
         r.estimation_prix::float8 as estimation, r.score_potentiel as potentiel, nullif(btrim(r.depart_ville), '') as depart,
         r.raw_payload->'details'->>'parcours' as parcours, r.raw_payload->'details'->>'transfert' as transfert,
         r.raw_payload->>'mutation_pro' as mutation, r.raw_payload->'espace'->>'nom' as espace_nom, r.raw_payload->'details'->>'express' as express,
         x.id is not null as dossier, coalesce(x.devis, false) as devis, coalesce(x.signe, false) as signe
       from public.requests r
       left join lateral (
         select d.id,
           exists (select 1 from devis v where v.dossier_id = d.id and v.statut in ('envoye','signe','refuse')) as devis,
           exists (select 1 from devis v where v.dossier_id = d.id and v.statut = 'signe') as signe
         from dossiers d where d.request_id = r.id order by d.id limit 1) x on true
       where (r.created_at at time zone 'Europe/Paris')::date >= $1::date`,
      [depuis],
    ),
    q<{ n: number; plus_ancienne: string | null }>(
      `select count(*)::int as n, min(created_at)::text as plus_ancienne from public.requests where status = 'new'`,
    ),
    q<Rappel>(
      `select e.id, e.request_id as "requestId", coalesce(e.payload->>'statut', 'a_rappeler') as statut,
         nullif(e.payload->>'priorite', '')::int as priorite, nullif(e.payload->>'montant_ttc', '')::float8 as montant, e.created_at::text as le,
         coalesce(nullif(btrim(r.client_nom), ''), r.client_email, 'Sans nom') as client,
         case when r.depart_ville is not null or r.arrivee_ville is not null then concat_ws(' → ', r.depart_ville, r.arrivee_ville) end as trajet
       from public.request_events e join public.requests r on r.id = e.request_id
       where e.type = 'rappel' and coalesce(e.payload->>'statut', 'a_rappeler') in ('a_rappeler', 'en_cours')
       order by nullif(e.payload->>'priorite', '')::int desc nulls last, e.created_at`,
    ),
    lireDemandes().catch(() => [] as DemandeVue[]),
  ]);

  const periode = lignes.filter((d) => dans(d, p));
  const courante = lignes.filter((d) => dans(d, cmp.courante));
  const precedente = lignes.filter((d) => dans(d, cmp.precedente));

  // Le flux : reçues et qualifiées, créneau par créneau.
  const creneaux = creneauxDe(p).map((c) => {
    const ds = periode.filter((d) => dans(d, c));
    return { ...c, recues: ds.length, qualifiees: ds.filter(qualifiee).length };
  });

  // Les parcours (les trois portes) et les sources.
  const parcours = new Map<string, number>();
  for (const d of periode) {
    const l = libelleParcours(d);
    parcours.set(l, (parcours.get(l) ?? 0) + 1);
  }
  const ORDRE = ["Particulier · express", "Particulier · complet", "Entreprise", "Entreprise · petit transfert", "Entreprise · projet important", "Mutation"];
  const segments = [...parcours.entries()]
    .map(([libelle, n]) => ({ libelle, n }))
    .sort((a, b) => (ORDRE.indexOf(a.libelle) + 1 || 99) - (ORDRE.indexOf(b.libelle) + 1 || 99));

  // Le potentiel, par tranche de 20 ; les demandes pas encore évaluées à part.
  const tranches = TRANCHES.map(() => 0);
  for (const d of periode) if (d.potentiel != null) tranches[Math.min(4, Math.floor(Math.max(0, d.potentiel) / 20))]++;

  // Les communes de départ les plus demandées, et leur prix au m² (DVF) quand la commune est déjà reconnue.
  const villes = new Map<string, { n: number; noms: Map<string, number> }>();
  for (const d of periode) {
    if (!d.depart) continue;
    const cle = cleCommune(null, d.depart).slice(1);
    const v = villes.get(cle) ?? { n: 0, noms: new Map() };
    v.n++;
    v.noms.set(d.depart, (v.noms.get(d.depart) ?? 0) + 1);
    villes.set(cle, v);
  }
  const chaudes = [...villes.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  const dvf = chaudes.length
    ? await q<{ ville: string; ville_seule: boolean; prix: number | null; prestige: number | null }>(
        `select split_part(c.cle, '|', 2) as ville, split_part(c.cle, '|', 1) = '' as ville_seule, d.prix_m2_median as prix, d.prestige
         from communes_demandes c join dvf_communes d on d.code_insee = c.code_insee
         where split_part(c.cle, '|', 2) = any($1::text[])
         order by 2 desc`,
        [chaudes.map(([cle]) => cle)],
      )
    : [];
  const communes = chaudes.map(([cle, v]) => {
    const nom = [...v.noms.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const x = dvf.find((r) => r.ville === cle);
    return { cle, nom, n: v.n, prix: x?.prix ?? null, prestige: x?.prestige ?? null };
  });

  // Le Top 5 du moment, comme Top demandes (ouvertes, potentiel, estimation, la plus récente).
  const ouvertes = toutes.filter(estOuverte);
  const top = [...ouvertes]
    .sort((a, b) => (b.potentiel ?? -1) - (a.potentiel ?? -1) || (b.estimation ?? -1) - (a.estimation ?? -1) || b.recueLe.localeCompare(a.recueLe))
    .slice(0, 5);
  const radars = top.length ? await araignees(top, toutes) : new Map<string, Araignee>();

  const recuesParMois = mois.map((m) => lignes.filter((d) => d.jour.startsWith(m)).length);
  const qualifieesParMois = mois.map((m) => lignes.filter((d) => d.jour.startsWith(m) && qualifiee(d)).length);
  const estimationsParMois = mois.map((m) => estimationsDe(lignes.filter((d) => d.jour.startsWith(m))));

  return {
    comparaison: { libelle: cmp.libelle, precis: cmp.precis },
    mois,
    recues: {
      n: periode.length,
      courant: courante.length,
      avant: precedente.length,
      aujourdhui: lignes.filter((d) => d.jour === aujourdhui).length,
      septJours: lignes.filter((d) => d.jour >= plusJours(aujourdhui, -6) && d.jour <= aujourdhui).length,
      // La dernière reçue (lireDemandes rend les plus récentes d'abord).
      derniere: toutes[0]?.recueLe ?? null,
      parMois: recuesParMois,
    },
    qualification: {
      part: partQualifiee(periode),
      courant: partQualifiee(courante),
      avant: partQualifiee(precedente),
      parMois: mois.map((_, i) => (recuesParMois[i] ? qualifieesParMois[i] / recuesParMois[i] : 0)),
    },
    estimations: {
      total: estimationsDe(periode),
      courant: estimationsDe(courante),
      avant: estimationsDe(precedente),
      parMois: estimationsParMois,
    },
    aOuvrir: { n: aOuvrir[0]?.n ?? 0, plusAncienne: aOuvrir[0]?.plus_ancienne ?? null },
    rappels,
    fortPotentiel: ouvertes.filter((d) => (d.potentiel ?? 0) >= SEUIL_FORT).length,
    ouvertes: ouvertes.length,
    creneaux,
    entonnoir: [
      { cle: "recues", libelle: "Reçues", n: periode.length },
      { cle: "qualifiees", libelle: "Qualifiées", n: periode.filter(qualifiee).length },
      { cle: "dossier", libelle: "Dossier ouvert", n: periode.filter((d) => d.dossier).length },
      { cle: "devis", libelle: "Devis envoyé", n: periode.filter((d) => d.devis).length },
      { cle: "signe", libelle: "Signé", n: periode.filter((d) => d.signe).length },
    ],
    segments,
    espacesPro: periode.filter((d) => d.espace_nom).length,
    sources: { formulaire: periode.filter((d) => d.source === "form").length, email: periode.filter((d) => d.source === "email").length },
    potentiel: { tranches, sansNote: periode.filter((d) => d.potentiel == null).length },
    communes,
    top: top.map((d): TopDemande => {
      const e = ETAPE_DEMANDE[etapeDe(d)];
      return { demande: d, araignee: radars.get(d.id)!, etape: { label: e.label, couleur: couleur(e.teinte) } };
    }),
  };
}
