import "server-only";
import { q } from "@/crm/lib/db";
import { reglageNombre } from "@/crm/exploitation/commun";

/*
 * L'archivage des dossiers clos (Créagidem : module Archivage) : les dossiers
 * archivés, consultables à part et restaurables, et ceux qu'on propose
 * d'archiver — les dossiers perdus, et les dossiers terminés depuis le délai
 * réglé (crm.reglages_exploitation, archivage_delai_jours). Tant que ce
 * délai n'est pas réglé, tous les dossiers terminés sont proposés.
 *
 * Un dossier terminé l'est depuis la fin de son déménagement (livraison, à
 * défaut chargement), sinon depuis sa dernière modification.
 */

const COLONNES = `d.id, d.ref, d.statut, d.volume::float8 as volume, d.archive_le, u.nom as archive_par,
  coalesce(c.societe, concat_ws(' ', c.prenom, c.nom)) as client, cm.nom as commercial,
  coalesce(d.date_livraison, d.date_chargement)::text as demenagement,
  (current_date - coalesce(d.date_livraison, d.date_chargement, d.maj_le::date))::int as depuis,
  (select montant::float8 from devis where dossier_id=d.id and statut='signe' order by signe_le desc nulls last limit 1) as montant,
  (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
  (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee`;
const DE = "from dossiers d join clients c on c.id=d.client_id left join utilisateurs u on u.id=d.archive_par left join utilisateurs cm on cm.id=d.commercial_id";

export type DossierClos = {
  id: number; ref: string; statut: string; volume: number; archive_le: string | null; archive_par: string | null; client: string; commercial: string | null;
  demenagement: string | null; depuis: number; montant: number | null; depart: string | null; arrivee: string | null;
};

function recherche(texte: string | undefined, p: unknown[]) {
  if (!texte) return "";
  const i = p.push(`%${texte}%`);
  return ` and (d.ref ilike $${i} or c.nom ilike $${i} or c.prenom ilike $${i} or c.societe ilike $${i} or c.email ilike $${i})`;
}

export async function dossiersArchives(texte?: string) {
  const p: unknown[] = [];
  return q<DossierClos>(`select ${COLONNES} ${DE} where d.archive_le is not null${recherche(texte, p)} order by d.archive_le desc, d.id desc limit 300`, p);
}

export async function aArchiver(texte?: string) {
  const delai = await reglageNombre("archivage_delai_jours");
  const p: unknown[] = [];
  const termine = delai ? `(d.statut='termine' and current_date - coalesce(d.date_livraison, d.date_chargement, d.maj_le::date) >= $${p.push(Math.round(delai))})` : "d.statut='termine'";
  const lignes = await q<DossierClos>(
    `select ${COLONNES} ${DE} where d.archive_le is null and (d.statut='perdu' or ${termine})${recherche(texte, p)}
     order by depuis desc, d.id limit 300`,
    p,
  );
  return { lignes, delai };
}

export async function compteursArchivage() {
  const delai = await reglageNombre("archivage_delai_jours");
  const [r] = await q<{ archives: number; proposes: number }>(
    `select count(*) filter (where archive_le is not null)::int as archives,
       count(*) filter (where archive_le is null and (statut='perdu' or (statut='termine' and ($1::int is null or current_date - coalesce(date_livraison, date_chargement, maj_le::date) >= $1::int))))::int as proposes
     from dossiers`,
    [delai ? Math.round(delai) : null],
  );
  return r;
}
