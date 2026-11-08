import "server-only";
import { q } from "@/crm/lib/db";
import { libelleParcours, parcoursDeLaDemande, SANS_PRIX } from "@/lib/parcours";
import type { RequestStatus } from "@/lib/types";
import type { DemandeVue } from "./etapes";
import { prestigesDe } from "./prestige";
import { araigneeDe, rangCentile, type Araignee } from "./araignee";

/*
 * Les demandes du site, telles que Demandes les montre (Kanban, Top
 * demandes) et telles que l'araignée de la page d'une demande les compare :
 * une requête, par le pool du CRM, en nommant le schéma `public` — la
 * demande, son dernier rappel, son dernier devis du site, son dossier.
 */

const iso = (d: unknown) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));

const REQUETE = `select r.id, r.created_at, r.source::text as source, r.status::text as status, r.client_nom, r.client_email, r.client_tel,
    r.completion_token is not null as jeton,
    r.depart_adresse, r.depart_code_postal, r.depart_ville, r.arrivee_adresse, r.arrivee_code_postal, r.arrivee_ville,
    r.volume_m3::float8 as volume, r.estimation_prix::float8 as estimation, r.date_souhaitee, r.flexibilite, r.score_potentiel, r.score_difficulte,
    r.raw_payload->'details'->>'express' as express, r.raw_payload->'espace'->>'nom' as espace_nom,
    r.raw_payload->'details'->>'parcours' as parcours, r.raw_payload->'details'->>'transfert' as transfert,
    r.raw_payload->>'mutation_pro' as mutation, r.raw_payload->>'societe' as societe,
    (select coalesce(e.payload->>'statut', 'a_rappeler') from public.request_events e
       where e.request_id = r.id and e.type = 'rappel' order by e.created_at desc limit 1) as rappel,
    (select v.status::text from public.devis v where v.request_id = r.id order by v.created_at desc limit 1) as devis_site,
    x.id as dossier_id, x.ref as dossier_ref, x.statut as dossier_statut, x.archive_le is not null as dossier_archive,
    x.commercial_id as dossier_commercial_id, x.commercial as dossier_commercial, x.initiales as dossier_initiales
  from public.requests r
  left join lateral (select d.id, d.ref, d.statut, d.archive_le, d.commercial_id, u.nom as commercial, u.initiales
      from dossiers d left join utilisateurs u on u.id = d.commercial_id where d.request_id = r.id order by d.id limit 1) x on true`;

/*
 * Les demandes lues : toutes celles qui attendent une décision (la colonne
 * « Demandes » du Parcours et les colonnes ouvertes du Kanban se comptent sur
 * cette même lecture, etapes.ts du Kanban, aDecider), et, pour le reste —
 * acceptées, perdues, archivées —, les plus récentes. Avant le 08/11/2026,
 * le Parcours lisait ses demandes à part (200 au plus) et Demandes les
 * siennes (300 au plus, toutes confondues) : au-delà, les deux tableaux ne
 * comptaient plus la même chose.
 */
const RECENTES = 300;
const PLAFOND = 1000;
const OUVERTE = "x.id is null and r.status::text not in ('lost', 'archived')";

function versDemande(r: Record<string, unknown>): DemandeVue {
  const parcours = parcoursDeLaDemande(r as Parameters<typeof parcoursDeLaDemande>[0]);
  const volume = r.volume as number | null;
  const depart = (r.depart_ville as string | null) ?? null;
  const arrivee = (r.arrivee_ville as string | null) ?? null;
  return {
    id: String(r.id),
    recueLe: iso(r.created_at)!,
    source: r.source === "email" ? "email" : "form",
    statut: r.status as RequestStatus,
    client: (r.client_nom as string | null)?.trim() || (r.client_email as string | null) || "Sans nom",
    email: (r.client_email as string | null) ?? null,
    telephone: (r.client_tel as string | null) ?? null,
    depart,
    departCp: (r.depart_code_postal as string | null) ?? null,
    departAdresse: (r.depart_adresse as string | null) ?? null,
    arrivee,
    arriveeCp: (r.arrivee_code_postal as string | null) ?? null,
    arriveeAdresse: (r.arrivee_adresse as string | null) ?? null,
    volume,
    estimation: SANS_PRIX.has(parcours) ? null : ((r.estimation as number | null) ?? null),
    // Une date sans heure, lue à minuit UTC par le pool du CRM : le jour seul.
    dateSouhaitee: r.date_souhaitee ? iso(r.date_souhaitee)!.slice(0, 10) : null,
    flexibilite: (r.flexibilite as string | null) ?? null,
    potentiel: (r.score_potentiel as number | null) ?? null,
    difficulte: (r.score_difficulte as number | null) ?? null,
    parcours,
    parcoursLabel: libelleParcours(r as Parameters<typeof libelleParcours>[0]),
    societe: (r.societe as string | null) || (r.espace_nom as string | null) || null,
    jeton: !!r.jeton,
    // Comme la liste des demandes (dashboard/status.ts, isIncomplete).
    incomplete: !!r.jeton || (!SANS_PRIX.has(parcours) && volume == null) || !depart || !arrivee,
    rappel: (r.rappel as string | null) ?? null,
    devisSite: (r.devis_site as string | null) ?? null,
    dossier:
      r.dossier_id != null
        ? {
            id: Number(r.dossier_id),
            ref: String(r.dossier_ref),
            statut: String(r.dossier_statut),
            archive: !!r.dossier_archive,
            commercialId: (r.dossier_commercial_id as number | null) ?? null,
            commercial: (r.dossier_commercial as string | null) ?? null,
            initiales: (r.dossier_initiales as string | null) ?? null,
          }
        : null,
  };
}

/** Les demandes du site, les plus récentes d'abord : toutes celles à décider, et les 300 dernières des autres. */
export async function lireDemandes(): Promise<DemandeVue[]> {
  const rows = await q(
    `${REQUETE} where (${OUVERTE}) or r.id in (select id from public.requests order by created_at desc limit ${RECENTES})
      order by r.created_at desc limit ${PLAFOND}`,
  );
  return rows.map(versDemande);
}

/**
 * L'araignée de chaque demande. Le volume et le montant se rangent parmi
 * toutes les demandes lues ; le prestige vient de la commune (prestige.ts).
 */
export async function araignees(demandes: DemandeVue[], toutes: DemandeVue[] = demandes): Promise<Map<string, Araignee>> {
  const rangs = {
    volume: rangCentile(toutes.map((d) => d.volume).filter((v): v is number => v != null && v > 0)),
    montant: rangCentile(toutes.map((d) => d.estimation).filter((v): v is number => v != null && v > 0)),
  };
  const prestiges = await prestigesDe(demandes);
  return new Map(demandes.map((d) => [d.id, araigneeDe({ ...d, client: d.client }, rangs, prestiges.get(d.id) ?? null)]));
}

/** L'araignée d'une demande (carte Évaluation de sa page), rangée parmi les autres. */
export async function araigneeDeLaDemande(id: string): Promise<Araignee | null> {
  const toutes = await lireDemandes();
  const d = toutes.find((x) => x.id === id) ?? (await q(`${REQUETE} where r.id = $1`, [id])).map(versDemande)[0];
  if (!d) return null;
  return (await araignees([d], toutes)).get(d.id) ?? null;
}
