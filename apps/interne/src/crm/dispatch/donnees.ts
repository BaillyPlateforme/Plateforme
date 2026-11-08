import "server-only";
import { q, q1, type Db, type Row } from "@/crm/lib/db";
import type { Colonne, ConteneurCrm, DossierOption, Evenement, Ligne, Parametres, Plan, Proposition } from "./types";

/*
 * Les lectures du dispatch des conteneurs. Comme le reste du CRM, elles ne
 * voient que le schéma `crm` (voir src/crm/lib/db.ts).
 */

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const jour = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const nombre = (v: unknown) => (v == null ? null : Number(v));

export const idValide = (id: number) => Number.isSafeInteger(id) && id > 0;

const LIGNES = `select l.id, l.colonne_id, l.rang, l.client, l.ville, l.pays, l.volume::float8 as volume, l.remarques, l.telephone, l.dossier_id, d.ref as dossier_ref
  from dispatch_lignes l left join dossiers d on d.id = l.dossier_id where l.plan_id = $1 order by l.colonne_id nulls first, l.rang, l.id`;

const COLONNES = `select c.*, c.capacite::float8 as capacite, u.nom as verrouillee_par_nom, t.numero as tc_numero, t.statut as tc_statut, t.destination as tc_destination
  from dispatch_colonnes c left join utilisateurs u on u.id = c.verrouillee_par left join conteneurs t on t.id = c.conteneur_id
  where c.plan_id = $1 order by c.ordre, c.id`;

export const versLigne = (r: Row): Ligne => ({
  id: r.id,
  colonneId: r.colonne_id ?? null,
  rang: Number(r.rang),
  client: r.client,
  ville: r.ville ?? null,
  pays: r.pays ?? null,
  volume: Number(r.volume),
  remarques: r.remarques ?? null,
  telephone: r.telephone ?? null,
  dossierId: r.dossier_id ?? null,
  dossierRef: r.dossier_ref ?? null,
});

export const versColonne = (r: Row): Colonne => ({
  id: r.id,
  genre: r.genre,
  libelle: r.libelle,
  taille: r.taille ?? null,
  capacite: nombre(r.capacite),
  zone: r.zone ?? null,
  jour: jour(r.jour),
  conteneurId: r.conteneur_id ?? null,
  conteneur: r.tc_numero ? { numero: r.tc_numero, statut: r.tc_statut, destination: r.tc_destination } : null,
  ordre: Number(r.ordre),
  verrouilleeLe: iso(r.verrouillee_le),
  verrouilleePar: r.verrouillee_par_nom ?? null,
});

const versProposition = (r: Row): Proposition => ({
  id: r.id,
  methode: r.methode,
  modele: r.modele ?? null,
  repli: r.repli ?? null,
  dureeMs: r.duree_ms ?? null,
  statut: r.statut,
  creeLe: iso(r.cree_le)!,
  parametres: r.parametres as Parametres,
  ...(r.contenu as Pick<Proposition, "resume" | "colonnes" | "nonAffectees" | "alertes">),
});

/** Les lignes et les colonnes d'un plan, lues par une connexion donnée (dans une transaction, au besoin). */
export async function lignesEtColonnes(db: Db, planId: number) {
  const [lignes, colonnes] = await Promise.all([db.query(LIGNES, [planId]), db.query(COLONNES, [planId])]);
  return { lignes: lignes.map(versLigne), colonnes: colonnes.map(versColonne) };
}

export async function plan(id: number): Promise<Plan | null> {
  if (!idValide(id)) return null;
  const p = await q1("select *, capacite_20::float8 as c20, capacite_40::float8 as c40 from dispatch_plans where id = $1", [id]);
  if (!p) return null;
  const [lignes, colonnes, historique, proposition] = await Promise.all([
    q(LIGNES, [id]),
    q(COLONNES, [id]),
    q(
      `select h.id, h.action, h.libelle, h.cree_le, h.ligne_id, h.colonne_id, u.nom, u.initiales
       from dispatch_historique h left join utilisateurs u on u.id = h.utilisateur_id where h.plan_id = $1 order by h.cree_le desc, h.id desc limit 400`,
      [id],
    ),
    q1("select * from dispatch_propositions where plan_id = $1 and statut = 'proposee' order by id desc limit 1", [id]),
  ]);
  return {
    id: p.id,
    nom: p.nom,
    sens: p.sens,
    port: p.port ?? null,
    dateReference: jour(p.date_reference),
    notes: p.notes ?? null,
    capacite20: p.c20,
    capacite40: p.c40,
    demo: p.demo,
    creeLe: iso(p.cree_le)!,
    majLe: iso(p.maj_le)!,
    lignes: lignes.map(versLigne),
    colonnes: colonnes.map(versColonne),
    historique: historique.map(
      (h): Evenement => ({
        id: h.id,
        action: h.action,
        libelle: h.libelle,
        quand: iso(h.cree_le)!,
        qui: h.nom ?? null,
        initiales: h.initiales ?? null,
        ligneId: h.ligne_id ?? null,
        colonneId: h.colonne_id ?? null,
      }),
    ),
    proposition: proposition ? versProposition(proposition) : null,
  };
}

/** Le nombre de plans de dispatch, pour la pilule « Dispatch » des conteneurs. */
export async function nombrePlans() {
  return (await q1<{ n: number }>("select count(*)::int as n from dispatch_plans"))?.n ?? 0;
}

/** Les plans, du plus récemment modifié au plus ancien, avec leurs chiffres et le remplissage de chaque colonne. */
export async function plans() {
  const rows = await q(`
    select p.id, p.nom, p.sens, p.port, p.date_reference, p.demo, p.maj_le,
      (select count(*) from dispatch_lignes l where l.plan_id = p.id)::int as nb,
      (select count(*) from dispatch_lignes l where l.plan_id = p.id and l.colonne_id is null)::int as a_repartir,
      (select coalesce(sum(volume), 0) from dispatch_lignes l where l.plan_id = p.id)::float8 as volume,
      (select count(*) from dispatch_colonnes c where c.plan_id = p.id and c.verrouillee_le is not null)::int as verrouillees,
      coalesce((select json_agg(json_build_object('libelle', c.libelle, 'genre', c.genre, 'capacite', c.capacite::float8, 'verrouillee', c.verrouillee_le is not null,
        'volume', (select coalesce(sum(volume), 0) from dispatch_lignes l where l.colonne_id = c.id)::float8) order by c.ordre, c.id)
        from dispatch_colonnes c where c.plan_id = p.id), '[]') as colonnes
    from dispatch_plans p order by p.maj_le desc, p.id desc`);
  return rows.map((r) => ({
    id: r.id as number,
    nom: r.nom as string,
    sens: r.sens as "export" | "import",
    port: (r.port as string) ?? null,
    dateReference: jour(r.date_reference),
    demo: r.demo as boolean,
    majLe: iso(r.maj_le)!,
    nb: r.nb as number,
    aRepartir: r.a_repartir as number,
    volume: r.volume as number,
    verrouillees: r.verrouillees as number,
    colonnes: r.colonnes as { libelle: string; genre: string; capacite: number | null; verrouillee: boolean; volume: number }[],
  }));
}

/** Les conteneurs du module Conteneurs, qu'une colonne peut représenter. */
export async function conteneursCrm(): Promise<ConteneurCrm[]> {
  const rows = await q("select id, numero, destination, taille, capacite::float8 as capacite, statut, depart_prevu from conteneurs order by depart_prevu nulls last, id");
  return rows.map((r) => ({ id: r.id, numero: r.numero, destination: r.destination, taille: r.taille, capacite: r.capacite, statut: r.statut, departPrevu: jour(r.depart_prevu) }));
}

/** Les dossiers auxquels un client du plan peut être rattaché (référence BD-…). */
export async function dossiersRattachables(): Promise<DossierOption[]> {
  const rows = await q(`select d.id, d.ref, coalesce(c.societe, nullif(trim(coalesce(c.prenom, '') || ' ' || c.nom), '')) as nom,
      (select adresse from etapes_trajet e where e.dossier_id = d.id and e.genre = 'arrivee' order by ordre desc limit 1) as arrivee
    from dossiers d join clients c on c.id = d.client_id where d.statut <> 'perdu' order by d.id desc limit 500`);
  return rows.map((r) => ({ id: r.id, ref: r.ref, nom: r.nom ?? "", arrivee: r.arrivee ?? null }));
}

/** Les colonnes de dispatch qui représentent un conteneur du module Conteneurs (pour sa fiche). */
export async function dispatchDuConteneur(conteneurId: number) {
  if (!idValide(conteneurId)) return [];
  return q(
    `select c.id, c.libelle, c.capacite::float8 as capacite, c.verrouillee_le, p.id as plan_id, p.nom as plan,
      (select count(*) from dispatch_lignes l where l.colonne_id = c.id)::int as nb,
      (select coalesce(sum(volume), 0) from dispatch_lignes l where l.colonne_id = c.id)::float8 as volume
     from dispatch_colonnes c join dispatch_plans p on p.id = c.plan_id where c.conteneur_id = $1 order by p.maj_le desc`,
    [conteneurId],
  );
}
