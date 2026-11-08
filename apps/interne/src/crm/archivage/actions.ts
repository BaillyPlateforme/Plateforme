"use server";
import { q } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { ecrireReglage, ident, journal, nombre, rafraichir } from "@/crm/exploitation/commun";
import { refuse, reussi, type Resultat } from "@/crm/exploitation/ui/resultat";

/*
 * Archiver un dossier clos (terminé ou perdu) le range à part : il quitte le
 * Parcours (colonnes et liste) — une recherche du Parcours le signale — et
 * reste consultable dans « Archivage ». Restaurer le remet en place, tel quel.
 * Seuls les dossiers terminés ou perdus s'archivent.
 */

async function archiverIds(ids: number[]) {
  const u = await currentUser();
  const faits = await q<{ id: number }>(
    "update dossiers set archive_le=now(), archive_par=$2 where id = any($1::int[]) and archive_le is null and statut in ('termine','perdu') returning id",
    [ids, u.id],
  );
  for (const f of faits) await journal(f.id, u.id, "Dossier archivé");
  rafraichir("/archives", "/parcours");
  return faits.length;
}

export async function archiver(id: number): Promise<Resultat> {
  const n = await archiverIds([id]);
  return n ? reussi("Dossier archivé.") : refuse("Ce dossier ne peut pas être archivé (il n'est ni terminé ni perdu, ou l'est déjà).");
}

/** Archiver d'un coup les dossiers cochés de la liste « À archiver ». */
export async function archiverSelection(f: FormData): Promise<Resultat> {
  const ids = f.getAll("dossier").map(ident).filter((x): x is number => !!x);
  if (!ids.length) return refuse("Cochez au moins un dossier.");
  const n = await archiverIds(ids);
  return reussi(`${n} dossier${n > 1 ? "s" : ""} archivé${n > 1 ? "s" : ""}.`);
}

export async function restaurer(id: number): Promise<Resultat> {
  const u = await currentUser();
  const r = await q<{ id: number }>("update dossiers set archive_le=null, archive_par=null, maj_le=now() where id=$1 and archive_le is not null returning id", [id]);
  if (!r.length) return refuse("Ce dossier n'est pas archivé.");
  await journal(id, u.id, "Dossier restauré depuis l'archivage");
  rafraichir("/archives", "/parcours");
  return reussi("Dossier restauré : il est de retour dans la liste des dossiers.");
}

/** Le délai (jours) après lequel un dossier terminé est proposé à l'archivage ; vide = tous les terminés. */
export async function reglerDelaiArchivage(f: FormData): Promise<Resultat> {
  const u = await currentUser();
  const v = nombre(f, "delai");
  if (v != null && (Number.isNaN(v) || v < 0 || v > 3650 || !Number.isInteger(v))) return refuse("Le délai est un nombre entier de jours (0 à 3650), ou vide.");
  await ecrireReglage("archivage_delai_jours", v == null ? null : String(v), u.nom);
  rafraichir("/archives");
  return reussi(v == null ? "Délai effacé : tous les dossiers terminés sont proposés." : `Les dossiers terminés depuis ${v} jour${v > 1 ? "s" : ""} sont proposés.`);
}
