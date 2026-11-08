import "server-only";
import { q } from "@/crm/lib/db";

/*
 * La liste globale des litiges (crm.litiges), tous dossiers confondus : le
 * numéro (LT-année-identifiant), l'origine, le libellé, le montant, le
 * statut, le sous-traitant en cause s'il y en a un. Les litiges restent
 * aussi sur la fiche de chaque dossier.
 */

export type Litige = {
  id: number;
  numero: string;
  dossier_id: number;
  ref: string;
  client: string;
  ouvert_le: string;
  clos_le: string | null;
  objet: string;
  origine: string | null;
  description: string | null;
  montant: number | null;
  statut: "ouvert" | "en_cours" | "clos";
  sous_traitant_id: number | null;
  sous_traitant: string | null;
};

export const VUES_LITIGES = { cours: "En cours", ouvert: "Ouverts", en_cours: "Pris en charge", clos: "Clos", tous: "Tous" } as const;
export type VueLitiges = keyof typeof VUES_LITIGES;

export async function litiges(f: { vue?: VueLitiges; q?: string; sousTraitant?: number | null } = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (f.vue === "cours" || !f.vue) w.push("x.statut <> 'clos'");
  else if (f.vue !== "tous") w.push(`x.statut = $${p.push(f.vue)}`);
  if (f.sousTraitant) w.push(`x.sous_traitant_id = $${p.push(f.sousTraitant)}`);
  if (f.q) {
    const i = p.push(`%${f.q}%`);
    w.push(`(x.objet ilike $${i} or x.origine ilike $${i} or x.description ilike $${i} or d.ref ilike $${i} or c.nom ilike $${i} or c.prenom ilike $${i} or c.societe ilike $${i} or s.nom ilike $${i})`);
  }
  return q<Litige>(
    `select x.id, 'LT-' || to_char(x.ouvert_le, 'YYYY') || '-' || lpad(x.id::text, 4, '0') as numero, x.dossier_id, d.ref,
       coalesce(c.societe, concat_ws(' ', c.prenom, c.nom)) as client, x.ouvert_le::text as ouvert_le, x.clos_le::text as clos_le,
       x.objet, x.origine, x.description, x.montant::float8 as montant, x.statut, x.sous_traitant_id, s.nom as sous_traitant
     from litiges x join dossiers d on d.id=x.dossier_id join clients c on c.id=d.client_id left join sous_traitants s on s.id=x.sous_traitant_id
     ${w.length ? `where ${w.join(" and ")}` : ""}
     order by case x.statut when 'ouvert' then 0 when 'en_cours' then 1 else 2 end, x.ouvert_le desc, x.id desc limit 300`,
    p,
  );
}

export async function compteursLitiges() {
  const [r] = await q<Record<VueLitiges, number>>(
    `select count(*) filter (where statut<>'clos')::int as cours, count(*) filter (where statut='ouvert')::int as ouvert,
       count(*) filter (where statut='en_cours')::int as en_cours, count(*) filter (where statut='clos')::int as clos, count(*)::int as tous from litiges`,
  );
  return r;
}

/** Les origines déjà saisies, proposées à la saisie (aucune liste imposée). */
export async function originesConnues() {
  return (await q<{ o: string }>("select distinct btrim(origine) as o from litiges where coalesce(btrim(origine), '') <> '' order by 1 limit 40")).map((r) => r.o);
}

/** Les dossiers où l'on peut ouvrir un litige : signés, planifiés ou terminés. */
export async function dossiersPourLitige() {
  return q<{ id: number; ref: string; client: string }>(
    `select d.id, d.ref, coalesce(c.societe, concat_ws(' ', c.prenom, c.nom)) as client from dossiers d join clients c on c.id=d.client_id
     where d.statut in ('commande','planifie','termine') order by d.maj_le desc limit 300`,
  );
}
