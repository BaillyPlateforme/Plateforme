import "server-only";
import { alerterEquipe } from "@/lib/alertes-equipe";
import { manqueAvantEspace, ouvrirEspaceDepuisCrm, type DossierCrmPourEspace } from "@/lib/espace-client/crm";
import { q1, type Row } from "./db";
import { nomClient } from "./format";

/*
 * Le CRM et l'espace client : un dossier, deux faces (migration 0012).
 *
 * Après chaque changement d'un dossier, le CRM le projette vers son espace
 * client, s'il en a un : le client y retrouve aussitôt ses devis, ses
 * factures, ses dates. La projection est une fonction de la base, appelée
 * par le pool du CRM ; sans espace lié, elle ne fait rien.
 *
 * Un client, un espace (David, novembre 2026) : avant de projeter, un
 * dossier qui n'est pas encore dans l'espace que son client a déjà (même
 * adresse e-mail) le rejoint, dès que ce qu'il faut est renseigné
 * (rattacherAEspaceExistant). C'est le même point de passage pour la
 * création, la fiche, la période, le volume, le commercial, le trajet.
 *
 * Elle ne bloque jamais le CRM : si elle échoue (base injoignable, migration
 * 0012 pas encore appliquée), l'action du CRM a eu lieu, et l'erreur se lit
 * dans le journal du serveur. La prochaine action la rattrapera.
 */
export async function projeterEspace(dossierId: number | null | undefined) {
  if (!dossierId) return;
  try {
    await rattacherAEspaceExistant(dossierId);
  } catch (e) {
    console.error(`BaillyCRM : rattachement du dossier ${dossierId} à l'espace de son client impossible`, e instanceof Error ? e.message : e);
  }
  try {
    await q1("select public.ec_projeter_dossier_crm($1)", [dossierId]);
  } catch (e) {
    console.error(`BaillyCRM : projection du dossier ${dossierId} vers l'espace client impossible`, e instanceof Error ? e.message : e);
  }
  // Les factures et les règlements, réécrits selon le modèle de la facturation (src/crm/facturation/schema.ts).
  try {
    await q1("select crm.projeter_factures_espace($1)", [dossierId]);
  } catch (e) {
    console.error(`BaillyCRM : projection des factures du dossier ${dossierId} vers l'espace client impossible`, e instanceof Error ? e.message : e);
  }
  // La visite technique (migration 0015) : créneaux proposés, visites, comptes-rendus signés.
  try {
    await q1("select public.ec_projeter_visites_crm($1)", [dossierId]);
  } catch (e) {
    console.error(`BaillyCRM : projection des visites du dossier ${dossierId} vers l'espace client impossible`, e instanceof Error ? e.message : e);
  }
  // La situation du dossier (migration 0021) : repli, véhicules, départements d'outre-mer — d'où les pièces
  // conditionnelles des CIMOB/DICOM. Avant la migration, la fonction manque : l'espace demande ces pièces
  // « si vous êtes concerné », et rien d'autre ne change.
  try {
    await q1("select public.ec_projeter_situation_crm($1)", [dossierId]);
  } catch (e) {
    console.error(`BaillyCRM : projection de la situation du dossier ${dossierId} vers l'espace client impossible`, e instanceof Error ? e.message : e);
  }
}

export type IssueSignature = "signe" | "deja_signe" | "autre_signe" | "ferme" | "inconnu";

/**
 * La signature d'un devis : la même règle que l'espace client (un seul devis
 * signé par dossier), tenue par la base. `origine` dit d'où elle vient, pour
 * le fil d'activité : « lien » (la page /signature) ou « equipe ».
 */
export async function signerDevisUnique(
  devisId: number,
  origine: "lien" | "equipe",
  options: { utilisateurId?: number | null; ip?: string | null; userAgent?: string | null } = {},
): Promise<IssueSignature> {
  const r = await q1<{ issue: IssueSignature }>("select public.ec_signer_devis_crm($1, $2, $3, $4, $5) as issue", [
    devisId, origine, options.utilisateurId ?? null, options.ip ?? null, options.userAgent ?? null,
  ]);
  if (r?.issue === "signe") await alerterDevisSigne(devisId, origine);
  return r?.issue ?? "inconnu";
}

/** L'alerte de l'équipe « Devis signé », à ses abonnés (Relances › Alertes de l'équipe). */
async function alerterDevisSigne(devisId: number, origine: "lien" | "equipe") {
  const v = await q1<{ numero: string; dossier_id: number; ref: string; nom: string | null; prenom: string | null; societe: string | null; commercial: string | null }>(
    `select v.numero, v.dossier_id, d.ref, c.nom, c.prenom, c.societe, u.email as commercial
       from devis v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id left join utilisateurs u on u.id = d.commercial_id where v.id = $1`,
    [devisId],
  ).catch(() => undefined);
  if (!v) return;
  await alerterEquipe("devis_signe", {
    evenement: `crm-devis-${devisId}`, reference: v.ref, conseillers: [v.commercial],
    vars: { client: nomClient(v), reference: v.ref, numero: v.numero, origine: origine === "lien" ? "par le lien de signature" : "par l'équipe" },
    lien: { chemin: `/dossiers/${v.dossier_id}`, libelle: "Ouvrir le dossier" },
  });
}

/* ───────────── Un client, un espace ───────────── */

/** Les colonnes d'un dossier qui disent s'il peut entrer dans un espace (prealablesEspace). */
const SQL_POUR_ESPACE = `
  select d.id, d.statut, d.archive_le, lower(btrim(coalesce(c.email, ''))) as email, c.type, d.mois_ca, d.date_chargement,
    d.volume::float8 as volume, d.commercial_id, d.type_demenagement,
    (select e.adresse from etapes_trajet e where e.dossier_id = d.id and e.genre = 'depart' and btrim(coalesce(e.adresse, '')) <> '' order by e.ordre, e.id limit 1) as depart,
    (select e.adresse from etapes_trajet e where e.dossier_id = d.id and e.genre = 'arrivee' and btrim(coalesce(e.adresse, '')) <> '' order by e.ordre desc, e.id desc limit 1) as arrivee
  from dossiers d join clients c on c.id = d.client_id`;

const pourEspace = (d: Row): DossierCrmPourEspace => ({
  email: d.email, depart: d.depart, arrivee: d.arrivee, date_chargement: d.date_chargement, mois_ca: d.mois_ca,
  volume: Number(d.volume) || 0, commercial_id: d.commercial_id ?? null, type: d.type, type_demenagement: d.type_demenagement,
});

/** Un dossier terminé, perdu ou archivé ne rejoint pas l'espace de lui-même : seulement par « Ajouter à son espace ». */
const enCours = (d: Row) => !d.archive_le && !["termine", "perdu"].includes(d.statut);

/**
 * La règle du rattachement automatique : un dossier du CRM rejoint l'espace
 * client que son client a déjà — un espace (ec_clients) à la même adresse
 * e-mail, qui réunit au moins un dossier — dès que :
 *   - il n'est pas encore dans un espace ;
 *   - il est en cours (ni terminé, ni perdu, ni archivé) ;
 *   - ce qu'il faut est renseigné : e-mail, trajet, période, volume,
 *     commercial, et le pays d'un déménagement international (lu dans
 *     l'adresse d'arrivée).
 * Appelée avant chaque projection (projeterEspace), elle est idempotente :
 * la fonction SQL d'ouverture verrouille le dossier et rend « déjà fait » au
 * second appel ; l'avis « nouveau dossier » a sa clé d'idempotence. Aucun
 * nouveau lien d'accès ne part. Rend ce qui s'est passé, ou null quand la
 * règle ne s'applique pas (pas d'espace pour ce client, ou déjà dedans).
 */
export async function rattacherAEspaceExistant(dossierId: number): Promise<{ ajoute: true } | { ajoute: false; manque: string[] } | null> {
  const d = await q1<Row>(
    `${SQL_POUR_ESPACE}
      where d.id = $1
        and not exists (select 1 from public.ec_dossiers x where x.crm_dossier_id = d.id)
        and exists (select 1 from public.ec_clients ec join public.ec_dossiers x on x.client_id = ec.id where ec.email = lower(btrim(c.email)))`,
    [dossierId],
  );
  if (!d) return null;
  if (!enCours(d)) return { ajoute: false, manque: [] };
  const { manque, pays } = manqueAvantEspace(pourEspace(d));
  if (manque.length) return { ajoute: false, manque };
  const r = await ouvrirEspaceDepuisCrm(dossierId, { pays });
  if (!r.ok) {
    console.error(`BaillyCRM : le dossier ${dossierId} n'a pas rejoint l'espace de son client`, r.erreur);
    return { ajoute: false, manque: [r.erreur] };
  }
  return { ajoute: true };
}

/** L'espace client du client d'un dossier, vu du dossier : celui où il est, sinon celui de son adresse e-mail. */
export interface EspaceDuDossier {
  /** Le client de l'espace (ec_clients). */
  clientId: string;
  email: string;
  /** Le dossier y est-il déjà ? */
  dedans: boolean;
  /** Les références des dossiers de l'espace, dans l'ordre où ils y sont entrés. */
  references: string[];
  /** Pas encore dedans : ce qui manque pour qu'il le rejoigne de lui-même. */
  manque: string[];
  /** Pas encore dedans : le dossier est terminé, perdu ou archivé ; il ne s'ajoute qu'à la main. */
  horsCours: boolean;
}

/** Null quand le client n'a pas d'espace (ou un espace vide). Jamais bloquant : illisible, null aussi. */
export async function espaceDuDossier(dossierId: number): Promise<EspaceDuDossier | null> {
  const r = await q1<{ id: string; email: string; dedans: boolean; refs: string[] }>(
    `with lien as (select x.client_id from public.ec_dossiers x where x.crm_dossier_id = $1 limit 1),
          par_email as (select ec.id from dossiers d join clients c on c.id = d.client_id join public.ec_clients ec on ec.email = lower(btrim(c.email)) where d.id = $1)
     select ec.id::text as id, ec.email, exists (select 1 from lien) as dedans,
       coalesce(array_agg(x.reference order by x.created_at, x.reference) filter (where x.id is not null), '{}') as refs
       from public.ec_clients ec left join public.ec_dossiers x on x.client_id = ec.id
      where ec.id = coalesce((select client_id from lien), (select id from par_email))
      group by ec.id, ec.email`,
    [dossierId],
  ).catch((e) => {
    console.error(`BaillyCRM : lecture de l'espace du client du dossier ${dossierId} impossible`, e instanceof Error ? e.message : e);
    return undefined;
  });
  if (!r || !r.refs.length) return null;
  let manque: string[] = [];
  let horsCours = false;
  if (!r.dedans) {
    const d = await q1<Row>(`${SQL_POUR_ESPACE} where d.id = $1`, [dossierId]).catch(() => undefined);
    if (d) {
      manque = manqueAvantEspace(pourEspace(d)).manque;
      horsCours = !enCours(d);
    }
  }
  return { clientId: r.id, email: r.email, dedans: r.dedans, references: r.refs, manque, horsCours };
}
