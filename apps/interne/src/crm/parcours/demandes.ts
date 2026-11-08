import "server-only";
import { q } from "@/crm/lib/db";
import { libelleParcours, parcoursDeLaDemande, SANS_PRIX } from "@/lib/parcours";
import type { CarteDemande } from "./demandes-commun";

/*
 * Les demandes du site qui n'ont pas encore leur dossier au CRM : la première
 * colonne du Parcours. Une demande y entre par le bouton « Créer le dossier »
 * de sa fiche (/dashboard/<id>, VersLeCrm), qui pose `dossiers.request_id`.
 *
 * Lues par le pool du CRM, en nommant le schéma `public` (comme la fiche d'un
 * dossier lit `public.ec_dossiers`) : une jointure suffit pour écarter les
 * demandes déjà entrées. Les demandes perdues ou archivées n'y sont pas : la
 * page Demandes les garde.
 */

const iso = (d: unknown) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));

export async function demandesSansDossier(): Promise<CarteDemande[]> {
  const rows = await q(
    `select r.id, r.created_at, r.source::text as source, r.status::text as status, r.client_nom, r.client_email, r.client_tel,
        r.depart_ville, r.arrivee_ville, r.volume_m3::float8 as volume, r.estimation_prix::float8 as estimation, r.date_souhaitee,
        r.raw_payload->'details'->>'express' as express, r.raw_payload->'espace'->>'nom' as espace_nom,
        r.raw_payload->'details'->>'parcours' as parcours, r.raw_payload->'details'->>'transfert' as transfert,
        r.raw_payload->>'mutation_pro' as mutation, r.raw_payload->>'societe' as societe
      from public.requests r
      where r.status::text not in ('lost', 'archived')
        and not exists (select 1 from dossiers d where d.request_id = r.id)
      order by r.created_at desc
      limit 200`,
  );
  return rows.map((r) => {
    const parcours = parcoursDeLaDemande(r);
    return {
      id: r.id,
      recueLe: iso(r.created_at)!,
      source: r.source === "email" ? "email" : "form",
      statut: r.status,
      client: (r.client_nom as string | null)?.trim() || r.client_email || "Sans nom",
      email: r.client_email,
      telephone: r.client_tel,
      depart: r.depart_ville,
      arrivee: r.arrivee_ville,
      volume: r.volume,
      estimation: SANS_PRIX.has(parcours) ? null : r.estimation,
      // Une date sans heure, lue à minuit UTC par le pool du CRM : le jour seul.
      dateSouhaitee: r.date_souhaitee ? iso(r.date_souhaitee)!.slice(0, 10) : null,
      parcours,
      parcoursLabel: libelleParcours(r),
      societe: r.societe || r.espace_nom || null,
    };
  });
}

/** Combien de dossiers archivés répondent à une recherche : le Parcours les écarte, l'archivage les montre. */
export async function archivesTrouves(texte: string): Promise<number> {
  const t = texte.trim();
  if (!t) return 0;
  const p: unknown[] = [`%${t}%`];
  const cond = ["c.nom ilike $1", "c.prenom ilike $1", "c.societe ilike $1", "d.ref ilike $1", "c.email ilike $1"];
  const chiffres = t.replace(/[^0-9]/g, "");
  if (chiffres.length >= 4) {
    p.push(`%${chiffres}%`);
    cond.push("regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g') like $2");
  }
  const r = await q<{ n: number }>(
    `select count(*)::int as n from dossiers d join clients c on c.id = d.client_id where d.archive_le is not null and (${cond.join(" or ")})`,
    p,
  );
  return r[0]?.n ?? 0;
}
