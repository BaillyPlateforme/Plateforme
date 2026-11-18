import "server-only";
import { q, q1, type Db } from "@/crm/lib/db";
import type { Repli, Vehicule } from "./commun";

/*
 * Les lectures et écritures des dossiers CIMOB/DICOM (cimob/schema.ts) : le
 * repli et les véhicules d'un dossier. Les écritures prennent la connexion
 * d'une transaction : la création d'un dossier (creerDossier) et la fenêtre de
 * la fiche les font dans la leur.
 */

export interface CimobDossier {
  repli: (Repli & { maj_le: string | null }) | null;
  vehicules: (Vehicule & { id: number })[];
}

/** Le repli et les véhicules d'un dossier. */
export async function cimobDuDossier(dossierId: number): Promise<CimobDossier> {
  const [repli, vehicules] = await Promise.all([
    q1<Repli & { maj_le: string | null }>(
      `select repli, volume_droits::float8 as volume_droits, periode, destination, lieu, adresse, code_postal, ville, pays, etage, ascenseur,
              ascenseur_taille, departement_om, maj_le from replis where dossier_id = $1`,
      [dossierId],
    ),
    q<Vehicule & { id: number }>(
      "select id, genre, motorisation, marque, modele, description, volume::float8 as volume, estimation from vehicules where dossier_id = $1 order by ordre, id",
      [dossierId],
    ),
  ]);
  return { repli: repli ?? null, vehicules };
}

/** Le repli d'un dossier, remplacé (une ligne au plus par dossier). */
export async function ecrireRepli(db: Db, dossierId: number, r: Repli) {
  await db.query(
    `insert into replis(dossier_id, repli, volume_droits, periode, destination, lieu, adresse, code_postal, ville, pays, etage, ascenseur, ascenseur_taille, departement_om, maj_le)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     on conflict (dossier_id) do update set repli=excluded.repli, volume_droits=excluded.volume_droits, periode=excluded.periode, destination=excluded.destination,
       lieu=excluded.lieu, adresse=excluded.adresse, code_postal=excluded.code_postal, ville=excluded.ville, pays=excluded.pays, etage=excluded.etage,
       ascenseur=excluded.ascenseur, ascenseur_taille=excluded.ascenseur_taille, departement_om=excluded.departement_om, maj_le=now()`,
    [dossierId, r.repli, r.volume_droits, r.periode, r.destination, r.lieu, r.adresse, r.code_postal, r.ville, r.pays, r.etage, r.ascenseur, r.ascenseur_taille, r.departement_om],
  );
}

/** Les véhicules d'un dossier, remplacés par la liste reçue, dans son ordre. */
export async function ecrireVehicules(db: Db, dossierId: number, liste: Vehicule[]) {
  await db.query("delete from vehicules where dossier_id = $1", [dossierId]);
  for (const [i, v] of liste.entries()) {
    await db.query(
      "insert into vehicules(dossier_id, ordre, genre, motorisation, marque, modele, description, volume, estimation) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [dossierId, i, v.genre, v.motorisation, v.marque, v.modele, v.description, v.volume, v.estimation ? JSON.stringify(v.estimation) : null],
    );
  }
}

/** Duplication à l'identique (src/crm/duplication/dossier.ts) : le repli et les véhicules du dossier d'origine. */
export async function copierCimob(db: Db, source: number, cible: number) {
  const r = await db.query(
    `insert into replis(dossier_id, repli, volume_droits, periode, destination, lieu, adresse, code_postal, ville, pays, etage, ascenseur, ascenseur_taille, departement_om)
     select $2, repli, volume_droits, periode, destination, lieu, adresse, code_postal, ville, pays, etage, ascenseur, ascenseur_taille, departement_om
       from replis where dossier_id = $1
     on conflict (dossier_id) do nothing returning repli`,
    [source, cible],
  );
  const v = await db.query(
    `insert into vehicules(dossier_id, ordre, genre, motorisation, marque, modele, description, volume, estimation)
     select $2, ordre, genre, motorisation, marque, modele, description, volume, estimation from vehicules where dossier_id = $1 order by ordre, id returning id`,
    [source, cible],
  );
  return { repli: r[0]?.repli === true, vehicules: v.length };
}
