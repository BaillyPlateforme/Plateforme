import "server-only";
import { cache } from "react";
import { q, q1, type Row } from "@/crm/lib/db";
import type { Categorie } from "./categories";

/*
 * Les lectures de l'annuaire des sous-traitants et partenaires
 * (crm.sous_traitants, crm.sous_traitant_contacts) : la liste filtrée, une
 * fiche avec ses contacts, ses lettres de voiture et ses litiges, et les noms
 * proposés dans les champs « prestataire », « compagnie », « transitaire »…
 */

export type Partenaire = {
  id: number;
  nom: string;
  categorie: Categorie;
  siret: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  email: string | null;
  site: string | null;
  zones: string[];
  notes: string | null;
  actif: boolean;
  demo: boolean;
};

export type Contact = { id: number; nom: string; fonction: string | null; telephone: string | null; email: string | null; principal: boolean };

const COLONNES = "s.id,s.nom,s.categorie,s.siret,s.adresse,s.code_postal,s.ville,s.pays,s.telephone,s.email,s.site,s.zones,s.notes,s.actif,s.demo";

export async function annuaire(f: { q?: string; categorie?: string; zone?: string; inactifs?: boolean } = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (!f.inactifs) w.push("s.actif");
  if (f.categorie) w.push(`s.categorie = $${p.push(f.categorie)}`);
  if (f.zone) w.push(`exists (select 1 from unnest(s.zones) z where lower(z) = lower($${p.push(f.zone)}))`);
  if (f.q) {
    const i = p.push(`%${f.q}%`);
    w.push(`(s.nom ilike $${i} or s.ville ilike $${i} or s.notes ilike $${i} or array_to_string(s.zones, ' ') ilike $${i}
      or exists (select 1 from sous_traitant_contacts c where c.sous_traitant_id = s.id and (c.nom ilike $${i} or c.email ilike $${i})))`);
  }
  return q<Partenaire & { contacts: number; contact: string | null; lettres: number; litiges: number; derniere: string | null; cout: number }>(
    `select ${COLONNES},
       (select count(*)::int from sous_traitant_contacts c where c.sous_traitant_id = s.id) as contacts,
       (select c.nom from sous_traitant_contacts c where c.sous_traitant_id = s.id order by c.principal desc, c.id limit 1) as contact,
       (select count(*)::int from lettres_voiture l where l.sous_traitant_id = s.id) as lettres,
       (select count(*)::int from litiges x where x.sous_traitant_id = s.id and x.statut <> 'clos') as litiges,
       (select max(coalesce(l.date_chargement, l.date_livraison))::text from lettres_voiture l where l.sous_traitant_id = s.id) as derniere,
       (select coalesce(sum(l.prix_sous_traitance), 0)::float8 from lettres_voiture l where l.sous_traitant_id = s.id) as cout
     from sous_traitants s ${w.length ? `where ${w.join(" and ")}` : ""}
     order by s.actif desc, lower(s.nom)`,
    p,
  );
}

/** Les familles et les zones présentes, pour les filtres. */
export async function filtresAnnuaire() {
  const [cats, zones] = await Promise.all([
    q<{ categorie: Categorie; n: number }>("select categorie, count(*)::int as n from sous_traitants where actif group by 1"),
    q<{ zone: string; n: number }>("select z as zone, count(*)::int as n from sous_traitants, unnest(zones) z where actif group by 1 order by 2 desc, 1 limit 12"),
  ]);
  return { categories: new Map(cats.map((c) => [c.categorie, c.n])), zones };
}

export async function partenaire(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const s = await q1<Partenaire>(`select ${COLONNES} from sous_traitants s where s.id = $1`, [id]);
  if (!s) return null;
  const [contacts, lettres, litiges] = await Promise.all([
    q<Contact>("select id,nom,fonction,telephone,email,principal from sous_traitant_contacts where sous_traitant_id=$1 order by principal desc, id", [id]),
    q<Row>(
      `select l.id,l.numero,l.trajet,l.date_chargement,l.date_livraison,l.statut,l.prix_sous_traitance::float8 as prix,d.id as did,d.ref,c.nom,c.prenom,c.societe
         from lettres_voiture l join dossiers d on d.id=l.dossier_id join clients c on c.id=d.client_id
        where l.sous_traitant_id=$1 order by coalesce(l.date_chargement, l.date_livraison) desc nulls last, l.id desc limit 60`,
      [id],
    ),
    q<Row>(
      `select x.id,x.objet,x.statut,x.montant::float8 as montant,x.ouvert_le,d.id as did,d.ref
         from litiges x join dossiers d on d.id=x.dossier_id where x.sous_traitant_id=$1 order by x.ouvert_le desc, x.id desc`,
      [id],
    ),
  ]);
  return { ...s, contacts, lettres, litiges };
}

/** Les noms de l'annuaire (actifs), pour les listes de choix ; filtrés par familles au besoin. */
export async function nomsAnnuaire(categories?: Categorie[]) {
  return q<{ id: number; nom: string; categorie: Categorie; ville: string | null }>(
    `select id, nom, categorie, ville from sous_traitants where actif ${categories?.length ? "and categorie = any($1)" : ""} order by lower(nom)`,
    categories?.length ? [categories] : [],
  );
}

/** Les sociétés qui exécutent une lettre de voiture (sous-traitants, agences, partenaires) : lues une fois par requête. */
export const nomsExecutants = cache(() => nomsAnnuaire(["sous_traitant", "agence", "partenaire", "autre"]));

/** Les lettres de voiture, avec leur prestataire relié à l'annuaire ou en texte libre (liste des lettres). */
export async function lettresDeVoiture(f: { q?: string; statut?: string; sousTraitees?: boolean } = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (f.statut) w.push(`l.statut = $${p.push(f.statut)}`);
  if (f.sousTraitees) w.push("(l.prix_sous_traitance is not null or s.categorie in ('sous_traitant','partenaire'))");
  if (f.q) {
    const i = p.push(`%${f.q}%`);
    w.push(`(l.numero ilike $${i} or l.trajet ilike $${i} or l.prestataire ilike $${i} or d.ref ilike $${i} or c.nom ilike $${i} or c.prenom ilike $${i} or c.societe ilike $${i})`);
  }
  return q<Row>(
    `select l.id,l.numero,l.trajet,l.date_chargement,l.date_livraison,l.prestataire,l.sous_traitant_id,l.equipe,l.immatriculation,
       l.prix_sous_traitance::float8 as prix,l.montant::float8 as montant,l.statut,d.id as did,d.ref,c.nom,c.prenom,c.societe,
       s.nom as st_nom, s.categorie as st_categorie
     from lettres_voiture l join dossiers d on d.id=l.dossier_id join clients c on c.id=d.client_id
     left join sous_traitants s on s.id=l.sous_traitant_id
     ${w.length ? `where ${w.join(" and ")}` : ""}
     order by coalesce(l.date_chargement, l.date_livraison) desc nulls first, l.id desc limit 300`,
    p,
  );
}
