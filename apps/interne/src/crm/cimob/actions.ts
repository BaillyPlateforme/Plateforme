"use server";
import { revalidatePath } from "next/cache";
import { q, q1, transaction } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { projeterEspace } from "@/crm/lib/espace";
import { delaiLisible, fenetres, lireLimite, rendre, reserver, reserverDuJour } from "@/lib/limites";
import { clePour, entreeEstimation, lireRepli, lireVehicules, lireVolume, type EstimationVehicule } from "./commun";
import { ecrireRepli, ecrireVehicules } from "./donnees";
import { estimerParIa } from "./ia";

/*
 * Les actions des dossiers CIMOB/DICOM : l'estimation du volume d'un véhicule
 * par l'IA, et la fenêtre « Repli et véhicules » de la fiche. Comme partout
 * dans le CRM, chacune vérifie d'abord la session de l'équipe.
 */

export type ResultatEstimation = { ok: true; estimation: EstimationVehicule; deja: boolean } | { ok: false; message: string };

/*
 * Les plafonds de l'estimation : par personne, 6 par minute et 40 par jour
 * (calendaire, heure de Paris, tenu en base) ; 300 par jour pour toute
 * l'équipe. Réglables sans toucher au code (VEHICULE_IA_PAR_MINUTE,
 * VEHICULE_IA_PAR_JOUR, VEHICULE_IA_EQUIPE_PAR_JOUR). Une même marque et un
 * même modèle déjà estimés depuis le démarrage du serveur ne coûtent rien.
 */
const memoire = globalThis as typeof globalThis & { __estimationsVehicules?: Map<string, EstimationVehicule> };
const deja = () => (memoire.__estimationsVehicules ??= new Map());

export async function estimerVolumeVehicule(entree: { genre?: unknown; marque?: unknown; modele?: unknown; motorisation?: unknown }): Promise<ResultatEstimation> {
  const u = await currentUser();
  const e = entreeEstimation(entree ?? {});
  if (!e.ok) return { ok: false, message: e.raison };
  const pour = clePour(e.genre, e.marque, e.modele);
  const cle = `${pour}|${e.motorisation ?? ""}`;
  const connue = deja().get(cle);
  if (connue) return { ok: true, estimation: connue, deja: true };

  const minute = `vehicule-ia:${u.id}`;
  const refus = reserver([{ cle: minute, fenetres: fenetres("VEHICULE_IA", { minute: 6, heure: 30, jour: 40 }).slice(0, 1) }]);
  if (refus) return { ok: false, message: `Trop d’estimations d’affilée. Réessayez ${delaiLisible(refus.dans)}, ou saisissez le volume à la main.` };
  const parJour = await reserverDuJour(`vehicule-ia:u${u.id}`, 1, lireLimite("VEHICULE_IA_PAR_JOUR", 40));
  if (parJour) {
    rendre(minute);
    return { ok: false, message: "Vous avez atteint le nombre d’estimations du jour. Saisissez le volume à la main." };
  }
  const equipe = await reserverDuJour("vehicule-ia:equipe", 1, lireLimite("VEHICULE_IA_EQUIPE_PAR_JOUR", 300));
  if (equipe) {
    rendre(minute);
    return { ok: false, message: "L’équipe a atteint le nombre d’estimations du jour. Saisissez le volume à la main." };
  }

  const r = await estimerParIa(e);
  if (!r.ok) return { ok: false, message: `Estimation impossible : ${r.raison}. Saisissez le volume à la main.` };
  const estimation: EstimationVehicule = {
    longueur: r.longueur, largeur: r.largeur, hauteur: r.hauteur, volume: r.volume, reconnu: r.reconnu, modele_ia: r.modele_ia,
    le: new Date().toISOString(), pour,
  };
  if (deja().size >= 500) deja().clear();
  deja().set(cle, estimation);
  return { ok: true, estimation, deja: false };
}

/**
 * La fenêtre « Repli et véhicules » de la fiche : les droits du dossier, le
 * repli, et les véhicules (« Oui / Non », puis la liste). Tout est relu et
 * borné ici (cimob/commun.ts).
 */
export async function majCimob(dossierId: number, f: FormData) {
  const u = await currentUser();
  if (!(await q1("select 1 from dossiers where id = $1", [dossierId]))) return;
  const repli = lireRepli(f.get("repli"));
  const avecVehicules = f.get("vehicule") === "on";
  const vehicules = avecVehicules ? lireVehicules(f.get("vehicules")) : [];
  await transaction(async (db) => {
    await db.query("select 1 from dossiers where id = $1 for update", [dossierId]);
    if (f.has("volume_droits")) await db.query("update dossiers set volume_droits = $2 where id = $1", [dossierId, lireVolume(f.get("volume_droits"))]);
    await db.query("update dossiers set vehicule = $2, maj_le = now() where id = $1", [dossierId, avecVehicules]);
    await ecrireRepli(db, dossierId, repli);
    // « Non » : la liste est vidée. Une ligne enregistrée ne survit pas à un « Non » enregistré.
    await ecrireVehicules(db, dossierId, vehicules);
  });
  const resume = [`repli : ${repli.repli ? "oui" : "non"}`, avecVehicules ? `${vehicules.length} véhicule${vehicules.length > 1 ? "s" : ""}` : "pas de véhicule"].join(", ");
  await q("insert into activite(dossier_id, utilisateur_id, libelle) values ($1,$2,$3)", [dossierId, u.id, `Repli et véhicules mis à jour (${resume})`]);
  await projeterEspace(dossierId);
  revalidatePath("/(interne)", "layout");
  revalidatePath(`/dossiers/${dossierId}`);
}
