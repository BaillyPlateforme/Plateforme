"use server";
import { q, q1 } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { ident, jour, journal, nombre, rafraichir, texte } from "@/crm/exploitation/commun";
import { refuse, reussi, type Resultat } from "@/crm/exploitation/ui/resultat";

/*
 * Les litiges, depuis leur liste globale : ouvrir un litige sur un dossier,
 * le modifier (libellé, origine, description, montant, statut, sous-traitant
 * en cause, date d'ouverture), le supprimer s'il a été saisi par erreur.
 * Clore un litige date sa clôture ; le rouvrir l'efface. Chaque geste
 * s'inscrit au fil du dossier.
 */
const STATUTS = ["ouvert", "en_cours", "clos"] as const;
const LIBELLES: Record<string, string> = { ouvert: "ouvert", en_cours: "pris en charge", clos: "clos" };

function lire(f: FormData) {
  const statut = texte(f, "statut") ?? "ouvert";
  const montant = nombre(f, "montant");
  const ouvert = jour(f, "ouvert_le");
  if (!texte(f, "objet")) return "Le libellé du litige est obligatoire.";
  if (!STATUTS.includes(statut as (typeof STATUTS)[number])) return "Statut inconnu.";
  if (montant != null && (Number.isNaN(montant) || montant < 0 || montant > 10_000_000)) return "Le montant n'est pas valide.";
  if (ouvert === "invalide") return "La date d'ouverture n'est pas valide.";
  return {
    objet: texte(f, "objet", 240)!,
    origine: texte(f, "origine", 80),
    description: texte(f, "description", 4000),
    montant,
    statut,
    ouvert,
    sousTraitant: ident(f.get("sous_traitant_id")),
  };
}

export async function creerLitige(f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const dossier = ident(f.get("dossier_id"));
  if (!dossier) return refuse("Choisissez le dossier du litige.");
  const c = lire(f);
  if (typeof c === "string") return refuse(c);
  const r = await q1<{ id: number }>(
    `insert into litiges(dossier_id,objet,origine,description,montant,statut,sous_traitant_id,ouvert_le,clos_le,maj_le)
     values($1,$2,$3,$4,$5,$6,$7,coalesce($8::date,current_date),case when $6='clos' then current_date end,now()) returning id`,
    [dossier, c.objet, c.origine, c.description, c.montant, c.statut, c.sousTraitant, c.ouvert],
  );
  await journal(dossier, u.id, `Litige ouvert : ${c.objet}`);
  rafraichir("/litiges", `/dossiers/${dossier}`);
  return reussi("Litige ouvert.", r!.id);
}

export async function majLitige(id: number, f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const c = lire(f);
  if (typeof c === "string") return refuse(c);
  const avant = await q1<{ statut: string; dossier_id: number }>("select statut, dossier_id from litiges where id=$1", [id]);
  if (!avant) return refuse("Ce litige n'existe plus.");
  await q(
    `update litiges set objet=$2, origine=$3, description=$4, montant=$5, statut=$6, sous_traitant_id=$7, ouvert_le=coalesce($8::date, ouvert_le),
       clos_le = case when $6='clos' then coalesce(clos_le, current_date) else null end, maj_le=now() where id=$1`,
    [id, c.objet, c.origine, c.description, c.montant, c.statut, c.sousTraitant, c.ouvert],
  );
  await journal(avant.dossier_id, u.id, avant.statut !== c.statut ? `Litige ${LIBELLES[c.statut]} : ${c.objet}` : `Litige modifié : ${c.objet}`);
  rafraichir("/litiges", `/dossiers/${avant.dossier_id}`);
  return reussi("Litige enregistré.");
}

export async function supprimerLitige(id: number): Promise<Resultat> {
  const u = await currentUser();
  const r = await q1<{ dossier_id: number; objet: string; statut: string; montant: number | null }>("delete from litiges where id=$1 returning dossier_id, objet, statut, montant::float8 as montant", [id]);
  if (r) {
    const libelle = `Litige supprimé : ${r.objet}`;
    await journal(r.dossier_id, u.id, libelle);
    rafraichir("/litiges", `/dossiers/${r.dossier_id}`);
    await journaliser({ action: "litige.supprime", libelle, objet: { type: "litige", id }, dossierId: r.dossier_id, details: { objet: r.objet, statut: r.statut, montant: r.montant }, activite: libelle });
  }
  return reussi("Litige supprimé.");
}
