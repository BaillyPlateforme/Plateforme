import "server-only";
import { q, q1, type Row } from "@/crm/lib/db";
import { prochaineEcheance, PERIODICITES, estPeriodicite } from "./regles";

/*
 * Les lectures du garde-meuble : les contrats (crm.garde_meuble), leurs
 * caisses une par une (crm.garde_meuble_caisses) et leurs photos, leurs
 * factures (crm.factures.garde_meuble_id). Un contrat peut être relié à un
 * dossier, ou n'avoir qu'un nom de client (reprise de l'existant).
 */

export type Contrat = {
  id: number;
  dossier_id: number | null;
  ref: string | null;
  client: string;
  nb_caisses: number;
  numeros: string | null;
  loyer: number;
  periodicite: string;
  debut: Date;
  derniere_facture: Date | null;
  echeance_saisie: Date | null;
  fin: Date | null;
  assurance: boolean;
  actif: boolean;
  notes: string | null;
  caisses: number;
  photos: number;
};

export type ContratCalcule = Contrat & { echeance: string; retard: number; montant: number; afacturer: boolean };

const COLONNES = `g.id,g.dossier_id,d.ref,g.client,g.nb_caisses,g.numeros,g.loyer_mensuel::float8 as loyer,g.periodicite,g.debut,g.derniere_facture,
  g.echeance as echeance_saisie,g.fin,g.assurance,g.actif,g.notes,
  (select count(*)::int from garde_meuble_caisses k where k.contrat_id=g.id and k.sortie_le is null) as caisses,
  (select count(*)::int from garde_meuble_photos p join garde_meuble_caisses k on k.id=p.caisse_id where k.contrat_id=g.id) as photos`;

/** Le jour à Paris, AAAA-MM-JJ. */
const aujourdhui = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

/** L'échéance, le retard (jours, négatif = à venir), le montant d'une période et « à facturer ». */
export function calculer<T extends Contrat>(c: T): T & { echeance: string; retard: number; montant: number; afacturer: boolean } {
  const echeance = prochaineEcheance({ debut: c.debut, derniere_facture: c.derniere_facture, echeance: c.echeance_saisie, periodicite: c.periodicite });
  const retard = Math.round((Date.parse(`${aujourdhui()}T00:00:00Z`) - Date.parse(`${echeance}T00:00:00Z`)) / 864e5);
  const mois = estPeriodicite(c.periodicite) ? PERIODICITES[c.periodicite].mois : 1;
  return { ...c, echeance, retard, montant: c.loyer * mois, afacturer: c.actif && retard >= 0 };
}

export async function contrats(f: { vue?: "actifs" | "a_facturer" | "clos" | "tous"; q?: string } = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (f.vue === "clos") w.push("not g.actif");
  else if (f.vue !== "tous") w.push("g.actif");
  if (f.q) {
    const i = p.push(`%${f.q}%`);
    w.push(`(g.client ilike $${i} or g.numeros ilike $${i} or d.ref ilike $${i}
      or exists (select 1 from garde_meuble_caisses k where k.contrat_id=g.id and (k.numero ilike $${i} or k.contenu ilike $${i} or k.emplacement ilike $${i})))`);
  }
  const rows = await q<Contrat>(`select ${COLONNES} from garde_meuble g left join dossiers d on d.id=g.dossier_id ${w.length ? `where ${w.join(" and ")}` : ""} order by lower(g.client), g.id`, p);
  const calcules = rows.map(calculer);
  return f.vue === "a_facturer" ? calcules.filter((c) => c.afacturer) : calcules;
}

/** Les compteurs des filtres de la liste. */
export async function compteurs() {
  const tous = await contrats({ vue: "tous" });
  return {
    actifs: tous.filter((c) => c.actif).length,
    aFacturer: tous.filter((c) => c.afacturer).length,
    clos: tous.filter((c) => !c.actif).length,
    tous: tous.length,
  };
}

export type Caisse = { id: number; numero: string; contenu: string | null; emplacement: string | null; entree_le: Date | null; sortie_le: Date | null; photos: { id: number }[] };

export async function contrat(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const c = await q1<Contrat>(`select ${COLONNES} from garde_meuble g left join dossiers d on d.id=g.dossier_id where g.id=$1`, [id]);
  if (!c) return null;
  const [caisses, factures, dossier] = await Promise.all([
    q<Caisse>(
      `select k.id,k.numero,k.contenu,k.emplacement,k.entree_le,k.sortie_le,
         coalesce((select json_agg(json_build_object('id', p.id) order by p.id) from garde_meuble_photos p where p.caisse_id=k.id), '[]') as photos
       from garde_meuble_caisses k where k.contrat_id=$1 order by k.sortie_le nulls first, k.ordre, k.id`,
      [id],
    ),
    q<Row>("select id,numero,objet,montant::float8 as montant,statut,emise_le,dossier_id from factures where garde_meuble_id=$1 order by emise_le desc, id desc", [id]),
    c.dossier_id
      ? q1<Row>("select d.id,d.ref,c.nom,c.prenom,c.societe,c.telephone,c.email from dossiers d join clients c on c.id=d.client_id where d.id=$1", [c.dossier_id])
      : Promise.resolve(undefined),
  ]);
  return { ...calculer(c), caisseListe: caisses, factures, dossier: dossier ?? null };
}

/** Les contrats d'un dossier (pour la section Garde-meubles de la fiche dossier). */
export async function contratsDuDossier(dossierId: number) {
  if (!Number.isSafeInteger(dossierId) || dossierId <= 0) return [];
  const rows = await q<Contrat>(`select ${COLONNES} from garde_meuble g left join dossiers d on d.id=g.dossier_id where g.dossier_id=$1 order by g.actif desc, g.debut desc`, [dossierId]);
  return rows.map(calculer);
}

/** Les dossiers proposés pour rattacher un contrat : les plus récents, et celui demandé. */
export async function dossiersRattachables(dossierId?: number | null) {
  return q<{ id: number; ref: string; client: string; statut: string; garde_meuble: boolean }>(
    `select d.id, d.ref, coalesce(c.societe, concat_ws(' ', c.prenom, c.nom)) as client, d.statut,
       exists (select 1 from etapes_trajet e where e.dossier_id=d.id and e.genre='garde_meuble') as garde_meuble
     from dossiers d join clients c on c.id=d.client_id
     where d.archive_le is null or d.id = $1
     order by (d.id = $1) desc, exists (select 1 from etapes_trajet e where e.dossier_id=d.id and e.genre='garde_meuble') desc, d.maj_le desc
     limit 150`,
    [dossierId ?? 0],
  );
}

/** La photo d'une caisse, pour la route qui la sert. */
export const photoCaisse = (id: number) =>
  q1<{ id: number; chemin: string; type: string; contrat_id: number; numero: string }>(
    "select p.id,p.chemin,p.type,k.contrat_id,k.numero from garde_meuble_photos p join garde_meuble_caisses k on k.id=p.caisse_id where p.id=$1",
    [id],
  );
