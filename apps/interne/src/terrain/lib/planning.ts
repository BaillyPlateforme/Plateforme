import "server-only";
import { q, q1 } from "@/crm/lib/db";
import type { Porteur } from "./acces";

/*
 * Les chantiers vus du terrain, lus dans le planning d'exploitation du CRM :
 * les lettres de voiture (chargement, livraison, équipe, camion, instructions
 * aux déménageurs) et les opérations rattachées à un dossier (groupage…). Les
 * opérations sans dossier (congés, dépôts) n'y figurent pas : on n'y joint
 * pas de photo.
 *
 * « Aujourd'hui » est le jour à Paris, calculé par la base : le serveur peut
 * tourner en UTC, et un chantier de 7 h ne doit pas glisser à la veille.
 *
 * Un déménageur n'ouvre que les dossiers au planning d'hier à demain (une
 * livraison de plusieurs jours compte pour chacun de ses jours) : de quoi
 * finir l'envoi des photos d'un chantier tardif, sans lui ouvrir tout le CRM.
 * L'équipe du bureau ouvre n'importe quel dossier.
 */

export type Genre = "chargement" | "livraison" | "chargement_livraison" | "groupage" | "manuelle";

export type Chantier = {
  cle: string;
  dossierId: number;
  ref: string;
  client: string;
  genre: Genre;
  /** Le jour au planning, AAAA-MM-JJ. */
  jour: string;
  /** 0 aujourd'hui, 1 demain. */
  decalage: number;
  /** L'équipe telle qu'écrite au planning : « Équipe 1 · Samir, Joao, Bilel ». */
  equipe: string | null;
  /** Sa partie avant le point médian : « Équipe 1 ». */
  equipeCourte: string | null;
  trajet: string | null;
  immatriculation: string | null;
  instructions: string | null;
  adresse: string | null;
  etage: string | null;
  ascenseur: boolean | null;
  acces: string | null;
  photos: number;
};

const AUJ = "(now() at time zone 'Europe/Paris')::date";

/** Les lignes du planning entre deux décalages de jours (0 = aujourd'hui), pour un dossier ou pour tous. */
async function lignes(de: number, a: number, dossierId?: number) {
  const p: unknown[] = [de, a];
  const filtre = dossierId ? `and x.dossier_id = $${p.push(dossierId)}` : "";
  return q<Chantier>(
    `with j as (select ${AUJ} as auj),
    x as (
      select 'l' || l.id || 'c' as cle, l.dossier_id,
        case when l.date_livraison = l.date_chargement then 'chargement_livraison' else 'chargement' end as genre,
        l.date_chargement as jour, coalesce(l.equipe, l.prestataire) as equipe, l.trajet, l.immatriculation, l.instructions
        from lettres_voiture l, j where l.date_chargement between j.auj + $1::int and j.auj + $2::int
      union all
      select 'l' || l.id || 'l', l.dossier_id, 'livraison', l.date_livraison, coalesce(l.equipe, l.prestataire), l.trajet, l.immatriculation, l.instructions
        from lettres_voiture l, j where l.date_livraison between j.auj + $1::int and j.auj + $2::int and l.date_livraison is distinct from l.date_chargement
      union all
      select 'o' || o.id, o.dossier_id, o.genre, o.jour, o.equipe, nullif(concat_ws(' · ', o.titre, nullif(o.detail, '')), ''), null, null
        from operations o, j where o.dossier_id is not null and o.jour between j.auj + $1::int and j.auj + $2::int
    )
    select x.cle, x.dossier_id as "dossierId", d.ref, coalesce(c.societe, concat_ws(' ', c.prenom, c.nom)) as client, x.genre,
      x.jour::text as jour, (x.jour - j.auj)::int as decalage, x.equipe, nullif(split_part(x.equipe, ' · ', 1), '') as "equipeCourte",
      x.trajet, x.immatriculation, nullif(btrim(x.instructions), '') as instructions,
      e.adresse, e.etage, e.ascenseur, e.acces,
      (select count(*)::int from photos_chantier ph where ph.dossier_id = x.dossier_id) as photos
    from x join dossiers d on d.id = x.dossier_id join clients c on c.id = d.client_id cross join j
    left join lateral (
      select adresse, etage, ascenseur, acces from etapes_trajet
      where dossier_id = x.dossier_id and genre = case when x.genre = 'livraison' then 'arrivee' else 'depart' end
      order by case when x.genre = 'livraison' then -ordre else ordre end, id limit 1
    ) e on true
    where true ${filtre}
    order by x.jour, x.equipe nulls last, 4`,
    p,
  );
}

/** Les chantiers d'aujourd'hui et de demain. */
export const chantiersDuJour = () => lignes(0, 1);

/** Le jour à Paris, AAAA-MM-JJ : pour l'en-tête et le rangement des photos. */
export async function jourParis() {
  const r = await q1<{ j: string }>(`select ${AUJ}::text as j`);
  return r!.j;
}

/** Un déménageur peut-il ouvrir ce dossier ? Seulement s'il est au planning d'hier à demain. */
async function auPlanning(dossierId: number) {
  const r = await q1<{ ok: boolean }>(
    `with j as (select ${AUJ} as auj)
     select exists (
       select 1 from lettres_voiture l, j where l.dossier_id = $1
         and l.date_chargement <= j.auj + 1 and coalesce(l.date_livraison, l.date_chargement) >= j.auj - 1
     ) or exists (
       select 1 from operations o, j where o.dossier_id = $1 and o.jour between j.auj - 1 and j.auj + 1
     ) as ok`,
    [dossierId],
  );
  return !!r?.ok;
}

export async function peutOuvrir(p: Porteur, dossierId: number) {
  if (!Number.isSafeInteger(dossierId) || dossierId <= 0) return false;
  if (p.genre === "bureau") return !!(await q1("select 1 from dossiers where id = $1", [dossierId]));
  return auPlanning(dossierId);
}

/** L'équipe au planning de ce dossier aujourd'hui (sa forme courte), pour ranger une photo d'un porteur sans équipe. */
export async function equipeAuPlanning(dossierId: number) {
  const r = (await lignes(-1, 1, dossierId)).sort((a, b) => Math.abs(a.decalage) - Math.abs(b.decalage))[0];
  return r?.equipeCourte ?? null;
}

export type Etape = { id: number; genre: string; adresse: string | null; etage: string | null; ascenseur: boolean; acces: string | null };

/** Ce que l'outil montre d'un dossier : le client, le volume, les étapes, ses lignes au planning d'hier à demain. */
export async function dossierTerrain(dossierId: number) {
  const d = await q1<{ id: number; ref: string; client: string; volume: number; statut: string }>(
    `select d.id, d.ref, coalesce(c.societe, concat_ws(' ', c.prenom, c.nom)) as client, d.volume::float8 as volume, d.statut
     from dossiers d join clients c on c.id = d.client_id where d.id = $1`,
    [dossierId],
  );
  if (!d) return null;
  const [etapes, planning] = await Promise.all([
    q<Etape>("select id, genre, adresse, etage, ascenseur, acces from etapes_trajet where dossier_id = $1 order by ordre, id", [dossierId]),
    lignes(-1, 1, dossierId),
  ]);
  return { ...d, etapes, planning };
}
