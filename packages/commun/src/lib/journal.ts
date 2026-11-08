import "server-only";
import { baseCrm, type Lire } from "@/lib/base-crm";
import { getUserAffichage } from "@/lib/supabase/auth";

/*
 * Le journal des gestes (crm.journal, voir apps/interne/src/crm/feed/schema.ts) :
 * ce qui se fait et ne laissait aucune trace — une suppression, un réglage, un
 * geste hors dossier. Lu par le Feed (/feed) avec les autres historiques.
 *
 * Trois écritures :
 * - ecrireJournal(geste, acteur, lire?) : la ligne, par le lecteur donné (le
 *   pool du CRM côté interne) ou par la petite connexion des modules partagés ;
 * - journaliserEquipe(geste) : un geste de l'équipe dans une action de
 *   l'espace équipe (packages/commun), signé du compte connecté ;
 * - côté CRM, journaliser(geste) dans apps/interne/src/crm/lib/journal.ts,
 *   signé de l'utilisateur du CRM.
 *
 * Le journal ne doit jamais faire échouer le geste : une ligne qui ne
 * s'écrit pas (base absente, table pas encore créée) est signalée dans les
 * journaux du serveur, et l'action continue.
 */

export type TypeActeur = "staff" | "client" | "auto";

export interface Acteur {
  type: TypeActeur;
  /** crm.utilisateurs.id, quand on le connaît ; sinon retrouvé par l'adresse. */
  id?: number | null;
  nom?: string | null;
  email?: string | null;
}

export interface Geste {
  /** Un code stable : « objet.verbe » (devis.supprime, modele.supprime, demande.statut…). */
  action: string;
  /** La phrase, telle qu'elle s'affiche dans le Feed : « Devis DV-2026-0012 supprimé ». */
  libelle: string;
  objet?: { type: string; id?: string | number | null } | null;
  dossierId?: number | null;
  requestId?: string | null;
  /** Ce qui a été supprimé ou changé (numéro, nom, montant…) : jamais le texte d'un message. */
  details?: Record<string, unknown> | null;
  /**
   * Le libellé de la ligne que l'action vient d'écrire au fil du dossier
   * (crm.activite) pour le même geste : la ligne du journal s'y relie, et le
   * Feed n'en montre qu'une.
   */
  activite?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * Une seule requête : l'auteur est complété par son adresse (crm.utilisateurs,
 * puis l'équipe de public.team_members), et la ligne du fil du dossier écrite
 * à l'instant pour le même geste, s'il y en a une, est reliée.
 */
const INSERER = `
insert into crm.journal (acteur_type, acteur_id, acteur_nom, acteur_email, action, objet_type, objet_id, dossier_id, request_id, libelle, details, activite_id)
select $1::text, coalesce($2::int, u.id), coalesce(nullif(btrim($3::text), ''), u.nom, t.nom, $4::text), $4::text,
       $5::text, $6::text, $7::text, $8::int, $9::uuid, $10::text, $11::jsonb,
       case when $12::text is not null and $8::int is not null then (
         select a.id from crm.activite a
          where a.dossier_id = $8::int and a.libelle = $12::text and a.cree_le > now() - interval '2 minutes'
            and not exists (select 1 from crm.journal j where j.activite_id = a.id)
          order by a.id desc limit 1) end
  from (select 1) as x
  left join crm.utilisateurs u on $4::text is not null and lower(u.email) = lower($4::text)
  left join lateral (select m.nom from public.team_members m where $4::text is not null and lower(m.email) = lower($4::text) and m.nom is not null limit 1) t on true`;

/** Les détails, sans les valeurs vides : une ligne lisible, et rien d'encombrant. */
function nettoyer(d: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d ?? {})) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out;
}

export async function ecrireJournal(g: Geste, acteur: Acteur, lire?: Lire | null): Promise<void> {
  const l = lire ?? baseCrm();
  if (!l) return;
  const requestId = g.requestId && UUID.test(g.requestId) ? g.requestId : null;
  try {
    await l(INSERER, [
      acteur.type,
      acteur.id ?? null,
      acteur.nom ?? null,
      acteur.email?.trim().toLowerCase() || null,
      g.action,
      g.objet?.type ?? null,
      g.objet?.id == null ? null : String(g.objet.id),
      g.dossierId ?? null,
      requestId,
      g.libelle.slice(0, 500),
      JSON.stringify(nettoyer(g.details)),
      g.activite ?? null,
    ]);
  } catch (e) {
    console.error(`Journal des gestes : « ${g.action} » non inscrit`, e instanceof Error ? e.message : e);
  }
}

/**
 * Un geste de l'équipe dans une action de l'espace équipe : son auteur est le
 * compte connecté (lu dans le cookie de session, sans aller-retour — l'action
 * a déjà vérifié qu'il est de l'équipe).
 */
export async function journaliserEquipe(g: Geste): Promise<void> {
  const u = await getUserAffichage().catch(() => null);
  await ecrireJournal(g, { type: "staff", email: u?.email ?? null });
}
