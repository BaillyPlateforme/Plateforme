"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1, transaction, type Db } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { projeterEspace } from "@/crm/lib/espace";
import { confirmerRdvPris, envoyerConfirmationRdv, oublierEtatRdv, type EtatAffiche } from "@/crm/rdv/sms";
import { duree as dureeFr, instantParis, jourVisite, momentVisite } from "@/lib/visite/regles";
import { estTypeRdv, TYPES_RDV, type TypeRdv } from "../types-rdv";
import { lundiDuJour } from "../grille";
import { semainePlanif, type SemainePlanif } from "./donnees";
import { proximite, type Proximite } from "./proximite";
import { raisonConfirmationOubliee } from "./regles";
import { creneauPris, phraseReplanifiee, replanifierVisite, reporterAcces, verrouillerPlanning } from "./serveur";

/*
 * Les actions du planificateur de visite (/planning/nouveau et /planning/<id>).
 *
 * planifierRdv pose le rendez-vous, sous le verrou du planning du commercial
 * (le même que la réservation par le client, ec_poser_visite_crm) : une
 * visite ne se pose ni sur un autre rendez-vous du commercial, ni sur un
 * créneau qu'il propose encore à un autre client — sauf une visio pendant une
 * règle perso « visios uniquement » (serveur.ts). Pour un dossier, elle retire
 * la proposition de créneaux restée ouverte (comme une réservation directe),
 * reporte l'étage et l'accès saisis sur l'étape du trajet, inscrit l'activité
 * et projette l'espace client. La confirmation part par SMS dès la visite
 * prise (retours de Céline, 16/11/2026 ; visio comprise) ; la fiche du
 * dossier, au retour, en montre l'état.
 *
 * modifierRdv enregistre le même formulaire pour un rendez-vous existant, sous
 * la même règle. Déplacé, le rendez-vous perd l'état de sa confirmation (elle
 * portait sur l'ancien horaire, voir rdv/sms.ts) ; le SMS du nouvel horaire ne
 * part que si la case « Prévenir le client par SMS » est cochée. Déplacée à
 * un horaire à venir, une visite marquée faite redevient planifiée
 * (serveur.ts, replanifierVisite).
 *
 * annulerRdv retire le rendez-vous du planning : c'est la suppression, avec sa
 * trace au fil du dossier et au journal. « Sans suite » est autre chose — le
 * cycle d'une visite qui n'a rien donné, qui reste au planning, barrée.
 */

export type IssuePlanif = { erreur: string } | null;

const s = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const n = (f: FormData, k: string) => {
  const v = s(f, k);
  return v == null || !/^\d+$/.test(v) ? null : Number(v);
};
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

function rafraichir(dossierId?: number | null) {
  revalidatePath("/(interne)", "layout");
  revalidatePath("/(tablette)", "layout");
  if (dossierId) revalidatePath(`/dossiers/${dossierId}`);
}

/**
 * La semaine d'un commercial, lue quand on change de semaine, de commercial, de type ou de durée.
 * `saufRdv` : le rendez-vous que l'on modifie, qui ne se gêne pas lui-même dans les créneaux libres.
 */
export async function chargerSemaine(commercialId: number, lundi: string, dossierId: number | null, type: string, duree: number, saufRdv: number | null = null): Promise<SemainePlanif | null> {
  await currentUser();
  if (!Number.isSafeInteger(commercialId) || !JOUR.test(lundi) || !estTypeRdv(type)) return null;
  const d = Number.isSafeInteger(dossierId) && (dossierId ?? 0) > 0 ? dossierId : null;
  const min = Math.min(720, Math.max(15, Math.round(Number(duree) || 60)));
  const sauf = Number.isSafeInteger(saufRdv) && (saufRdv ?? 0) > 0 ? saufRdv : null;
  return semainePlanif(commercialId, lundiDuJour(lundi), d, type, min, sauf);
}

/**
 * La géographie d'une visite sur place que l'on planifie (proximite.ts) : la
 * distance et le temps moyen depuis chaque rendez-vous situé de la semaine
 * montrée, et les créneaux les plus cohérents. Lue à part de la semaine :
 * elle suit l'adresse saisie, et un service d'adresses lent ne retarde pas la
 * grille.
 */
export async function chargerProximite(
  commercialId: number,
  lundi: string,
  adresse: string,
  dossierId: number | null,
  duree: number,
  saufRdv: number | null = null,
): Promise<Proximite | null> {
  await currentUser();
  if (!Number.isSafeInteger(commercialId) || !JOUR.test(lundi)) return null;
  const a = String(adresse ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (a.length < 3) return null;
  const d = Number.isSafeInteger(dossierId) && (dossierId ?? 0) > 0 ? dossierId : null;
  const sauf = Number.isSafeInteger(saufRdv) && (saufRdv ?? 0) > 0 ? saufRdv : null;
  const min = Math.min(720, Math.max(15, Math.round(Number(duree) || 60)));
  try {
    return await proximite({ commercialId, lundi: lundiDuJour(lundi), adresse: a, dossierId: d, duree: min, saufRdv: sauf });
  } catch (e) {
    console.error("Planificateur : proximité indisponible", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function planifierRdv(_avant: IssuePlanif, f: FormData): Promise<IssuePlanif> {
  const u = await currentUser();
  const type: TypeRdv = estTypeRdv(s(f, "type")) ? (s(f, "type") as TypeRdv) : "phys";
  const visite = type === "phys" || type === "visio";
  const dossierId = n(f, "dossier_id");
  const journee = !dossierId && f.get("journee") === "on";
  const jour = s(f, "date");
  const hm = journee ? "12:00" : s(f, "heure");
  if (!jour || !JOUR.test(jour) || !hm || !HEURE.test(hm)) return { erreur: "Choisissez le jour et l'heure dans la semaine du commercial." };
  const duree = journee ? 0 : Math.round(Number(s(f, "duree_min") ?? 60));
  if (!journee && !(duree >= 15 && duree <= 720)) return { erreur: "Durée de 15 minutes à 12 heures." };
  const commercialId = n(f, "commercial_id");
  const commercial = commercialId ? await q1<{ id: number; nom: string }>("select id, nom from utilisateurs where id = $1", [commercialId]) : undefined;
  if (!commercial) return { erreur: "Choisissez le commercial." };
  const dossier = dossierId ? await q1<{ id: number }>("select id from dossiers where id = $1", [dossierId]) : undefined;
  if (dossierId && !dossier) return { erreur: "Ce dossier n'existe plus." };
  const titre = s(f, "titre");
  if (!titre) return { erreur: "Donnez un titre au rendez-vous." };
  const debut = instantParis(jour, hm);
  if (debut.getTime() < Date.now() - (journee ? 12 * 3_600_000 : 0)) return { erreur: "Ce créneau est déjà passé." };
  // Le lieu : l'adresse de la visite sur place, le lien de la visio s'il y en a un, ou ce que dit la tâche.
  const lieu = type === "visio" ? (s(f, "lien_visio") ?? "Visio") : s(f, "lieu");
  const notes = s(f, "notes");
  const depuisId = dossierId ? n(f, "depuis_id") : null;

  const issue = await transaction<{ erreur: string } | { rdv: number }>(async (db) => {
    if (dossierId) await db.query("select 1 from dossiers where id = $1 for update", [dossierId]);
    // Le même verrou que la réservation par le client : le planning du commercial ne bouge pas pendant qu'on pose.
    await verrouillerPlanning(db, commercial.id);
    if (visite && !journee) {
      const pris = await creneauPris(db, { commercial, type, debut, duree, dossierId });
      if (pris) return { erreur: pris };
    }
    const [rdv] = await db.query<{ id: number }>(
      "insert into rendez_vous (commercial_id, dossier_id, type, titre, lieu, debut, duree_min, notes, journee) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id",
      [commercial.id, dossierId, type, titre, lieu, debut.toISOString(), duree, notes, journee],
    );
    if (!dossierId) return { rdv: rdv.id };

    const noter = (libelle: string) => db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [dossierId, u.id, libelle]);
    const source = depuisId
      ? (await db.query<{ type: string; debut: Date }>("select type, debut from rendez_vous where id = $1 and dossier_id = $2", [depuisId, dossierId]))[0]
      : undefined;
    const quand = journee ? jourVisite(debut, true) : momentVisite(debut, true);
    const quoi = type === "phys" ? "Visite sur place planifiée" : type === "visio" ? "Visio planifiée" : `${TYPES_RDV[type].long} « ${titre} » planifiée`;
    const reprise = source ? ` · nouvelle visite à partir de ${source.type === "visio" ? "la visio" : "la visite"} du ${jourVisite(source.debut)}` : "";
    await noter(`${quoi} : ${quand} avec ${commercial.nom}${reprise}`);

    if (visite) {
      await db.query("update dossiers set statut = 'visite' where id = $1 and statut = 'prospect'", [dossierId]);
      // Réservé directement : la proposition de créneaux ouverte du dossier n'a plus d'objet (comme ec_poser_visite_crm).
      await db.query(
        `update creneaux_visite c set statut = 'libere' from propositions_visite p
          where p.id = c.proposition_id and p.dossier_id = $1 and p.statut = 'ouverte' and c.statut = 'propose'`,
        [dossierId],
      );
      const retirees = await db.query("update propositions_visite set statut = 'retiree', close_le = now() where dossier_id = $1 and statut = 'ouverte' returning id", [dossierId]);
      if (retirees.length) await noter("Proposition de créneaux retirée : la visite est planifiée directement");
    }

    // L'étage et l'accès saisis pour une visite sur place : ceux de l'étape du trajet, qu'ils complètent ou corrigent.
    const etapeId = type === "phys" ? n(f, "etape_id") : null;
    if (etapeId) {
      const genre = await reporterAcces(db, { etapeId, dossierId, etage: s(f, "etage"), ascenseur: f.get("ascenseur") === "on", acces: s(f, "acces"), lieu });
      if (genre) await noter(`Étage et accès ${genre} mis à jour en planifiant la visite`);
    }
    await db.query("update dossiers set maj_le = now() where id = $1", [dossierId]);
    return { rdv: rdv.id };
  });

  if ("erreur" in issue) return { erreur: issue.erreur };
  // La confirmation par SMS, dès le rendez-vous pris (retours de Céline, 16/11/2026) : visite sur place ou visio.
  if (visite && !journee && dossierId) await confirmerRdvPris(dossierId, issue.rdv, u.id);
  await projeterEspace(dossierId);
  rafraichir(dossierId);
  if (dossierId) redirect(`/dossiers/${dossierId}?planifie=${issue.rdv}#demenagements-visites`);
  redirect(`/planning?semaine=${lundiDuJour(jour)}&com=${commercial.id}&ok=cree`);
}

// --- Modifier un rendez-vous ---------------------------------------------------------------------------

type AvantRdv = {
  id: number; type: string; titre: string; lieu: string | null; notes: string | null; debut: Date; duree_min: number; journee: boolean;
  commercial_id: number; commercial: string; dossier_id: number | null;
};

const LIRE_RDV = `select r.id, r.type, r.titre, r.lieu, r.notes, r.debut, r.duree_min, r.journee, r.commercial_id, u.nom as commercial, r.dossier_id
                    from rendez_vous r join utilisateurs u on u.id = r.commercial_id where r.id = $1`;

/**
 * « Visite », « Visio », « Tâche « Livrer 40 cartons » » : le sujet des lignes du fil (tous féminins). Hors
 * d'un dossier (le journal), une visite dit aussi son titre : « Visite « M. Bastide » ».
 */
function quoiRdv(r: { type: string; titre: string }, avecTitre = false) {
  if (r.type === "phys" || r.type === "visio") return `${r.type === "visio" ? "Visio" : "Visite"}${avecTitre ? ` « ${r.titre} »` : ""}`;
  return `${r.type === "perso" ? "Règle" : "Tâche"} « ${r.titre} »`;
}

const estLien = (v: string | null | undefined) => !!v && /^https?:\/\//i.test(v);

/** Ce qui a changé, dans l'ordre où on le lit : « déplacée au …, confiée à Laure Mercier, passée en visio ». */
function changementsRdv(
  avant: AvantRdv,
  apres: { type: TypeRdv; titre: string; lieu: string | null; notes: string | null; debut: Date; duree: number; journee: boolean; commercial: { id: number; nom: string } },
) {
  const out: string[] = [];
  if (+apres.debut !== +new Date(avant.debut)) out.push(apres.journee ? `déplacée au ${jourVisite(apres.debut, true)}` : `déplacée au ${momentVisite(apres.debut, true)}`);
  if (apres.journee !== avant.journee) out.push(apres.journee ? "sur la journée entière" : "à l'heure");
  if (apres.commercial.id !== avant.commercial_id) out.push(`confiée à ${apres.commercial.nom}`);
  if (apres.type !== avant.type) {
    out.push(apres.type === "visio" ? "passée en visio" : apres.type === "phys" ? "passée sur place" : apres.type === "tache" ? "changée en tâche" : "changée en règle perso");
  }
  if (!apres.journee && apres.duree !== avant.duree_min) out.push(`durée ${dureeFr(apres.duree)}`);
  if ((apres.lieu ?? "") !== (avant.lieu ?? "")) {
    if (apres.type === "phys" && apres.lieu) out.push(`adresse : ${apres.lieu}`);
    else if (apres.type === "visio" && (estLien(apres.lieu) || estLien(avant.lieu))) out.push(estLien(apres.lieu) ? "lien de la visio mis à jour" : "lien de la visio retiré");
    else if (apres.type !== "phys" && apres.type !== "visio") out.push(apres.lieu ? `lieu : ${apres.lieu}` : "lieu retiré");
  }
  if (apres.titre !== avant.titre) out.push(`titre « ${apres.titre} »`);
  if ((apres.notes ?? "") !== (avant.notes ?? "")) out.push("observations mises à jour");
  return out;
}

/**
 * Le planificateur en modification (/planning/<id>) : le même formulaire que
 * planifierRdv, pour un rendez-vous existant (rdv_id). Le dossier ne change
 * pas. La règle des visites n'est relue que si le créneau, la durée, la
 * personne ou le type changent : modifier les observations d'une visite déjà
 * posée ne la remet pas en cause.
 */
export async function modifierRdv(_avant: IssuePlanif, f: FormData): Promise<IssuePlanif> {
  const u = await currentUser();
  const id = n(f, "rdv_id");
  const avant = id ? await q1<AvantRdv>(LIRE_RDV, [id]) : undefined;
  if (!id || !avant || !estTypeRdv(avant.type)) return { erreur: "Ce rendez-vous n'existe plus : il a peut-être été annulé entre-temps." };
  const type: TypeRdv = estTypeRdv(s(f, "type")) ? (s(f, "type") as TypeRdv) : avant.type;
  const visite = type === "phys" || type === "visio";
  const dossierId = avant.dossier_id;
  // Une journée entière reste réservée aux rendez-vous sans dossier, comme à la création.
  const journee = !dossierId && f.get("journee") === "on";
  const jour = s(f, "date");
  const hm = journee ? "12:00" : s(f, "heure");
  if (!jour || !JOUR.test(jour) || !hm || !HEURE.test(hm)) return { erreur: "Choisissez le jour et l'heure dans la semaine du commercial." };
  const duree = journee ? 0 : Math.round(Number(s(f, "duree_min") ?? avant.duree_min));
  if (!journee && !(duree >= 15 && duree <= 720)) return { erreur: "Durée de 15 minutes à 12 heures." };
  const commercialId = n(f, "commercial_id");
  const commercial = commercialId ? await q1<{ id: number; nom: string }>("select id, nom from utilisateurs where id = $1", [commercialId]) : undefined;
  if (!commercial) return { erreur: "Choisissez le commercial." };
  const titre = s(f, "titre");
  if (!titre) return { erreur: "Donnez un titre au rendez-vous." };
  const debut = instantParis(jour, hm);
  const deplace = +debut !== +new Date(avant.debut);
  // Un rendez-vous passé se modifie (ses observations…), mais on ne le déplace pas dans le passé.
  if (deplace && debut.getTime() < Date.now() - (journee ? 12 * 3_600_000 : 0)) return { erreur: "Ce créneau est déjà passé." };
  // Une visio garde le texte de son lieu s'il n'était pas un lien (« Teams »…) ; un lien effacé redevient « Visio ».
  const lieu =
    type === "visio" ? (s(f, "lien_visio") ?? (avant.type === "visio" && avant.lieu && !estLien(avant.lieu) ? avant.lieu : "Visio")) : s(f, "lieu");
  const notes = s(f, "notes");
  const creneauChange = deplace || duree !== avant.duree_min || commercial.id !== avant.commercial_id || type !== avant.type || journee !== avant.journee;
  const libelles = changementsRdv(avant, { type, titre, lieu, notes, debut, duree, journee, commercial });

  const issue = await transaction<{ erreur: string } | { oublie: EtatAffiche | null; activite: string | null }>(async (db) => {
    if (dossierId) await db.query("select 1 from dossiers where id = $1 for update", [dossierId]);
    await verrouillerPlanning(db, commercial.id);
    const [r] = await db.query<{ id: number }>("select id from rendez_vous where id = $1 for update", [id]);
    if (!r) return { erreur: "Ce rendez-vous n'existe plus : il a peut-être été annulé entre-temps." };
    if (visite && !journee && creneauChange) {
      const pris = await creneauPris(db, { commercial, type, debut, duree, dossierId, saufRdv: id });
      if (pris) return { erreur: pris };
    }
    await db.query(
      "update rendez_vous set type = $2, titre = $3, lieu = $4, debut = $5, duree_min = $6, commercial_id = $7, notes = $8, journee = $9 where id = $1",
      [id, type, titre, lieu, debut.toISOString(), duree, commercial.id, notes, journee],
    );
    // Déplacé : la confirmation du client (et sa réponse 1 ou 2) portait sur l'ancien horaire.
    const oublie = deplace ? await oublierEtatRdv(id, db) : null;
    if (!dossierId) return { oublie, activite: null };
    // Déplacée à un horaire à venir, une visite marquée faite redevient planifiée (serveur.ts).
    const replanifiee = deplace && visite && !journee ? await replanifierVisite(db, id, debut) : null;

    const noter = (libelle: string) => db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [dossierId, u.id, libelle]);
    const activite = libelles.length ? `${quoiRdv(avant)} ${libelles.join(", ")}` : null;
    if (activite) await noter(activite);
    if (replanifiee) await noter(phraseReplanifiee(replanifiee));
    if (oublie) await noter(`Confirmation de la visite remise à zéro : ${raisonConfirmationOubliee(oublie.etat)}`);
    const etapeId = type === "phys" ? n(f, "etape_id") : null;
    if (etapeId) {
      const genre = await reporterAcces(db, { etapeId, dossierId, etage: s(f, "etage"), ascenseur: f.get("ascenseur") === "on", acces: s(f, "acces"), lieu });
      if (genre) await noter(`Étage et accès ${genre} mis à jour en modifiant la visite`);
    }
    if (visite) await db.query("update dossiers set statut = 'visite' where id = $1 and statut = 'prospect'", [dossierId]);
    await db.query("update dossiers set maj_le = now() where id = $1", [dossierId]);
    return { oublie, activite };
  });
  if ("erreur" in issue) return { erreur: issue.erreur };

  // Le SMS du nouvel horaire : sur demande seulement (case « Prévenir le client par SMS »), pour une visite déplacée.
  if (deplace && visite && !journee && dossierId && f.get("sms") === "on") {
    const sms = await envoyerConfirmationRdv(dossierId, id);
    if (sms) await q("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [dossierId, u.id, `SMS de confirmation ${sms.libelle} : « ${sms.texte} »`]);
  }
  if (libelles.length) {
    await journaliser({
      action: "rdv.modifie",
      libelle: issue.activite ?? `${quoiRdv(avant, true)} ${libelles.join(", ")}`,
      objet: { type: "rdv", id },
      dossierId,
      details: {
        avant: { debut: new Date(avant.debut).toISOString(), duree: avant.duree_min, type: avant.type, commercial: avant.commercial },
        apres: { debut: debut.toISOString(), duree, type, commercial: commercial.nom },
        confirmation_oubliee: issue.oublie?.libelle,
      },
      activite: issue.activite,
    });
  }
  await projeterEspace(dossierId);
  rafraichir(dossierId);
  // Retour d'où l'on vient : la fiche du dossier (la visite modifiée en tête de l'onglet Visites), ou le planning.
  if (dossierId && s(f, "retour") !== "planning") redirect(`/dossiers/${dossierId}?planifie=${id}&modifie=1#demenagements-visites`);
  redirect(`/planning?semaine=${lundiDuJour(jour)}&com=${commercial.id}&ok=modifie`);
}

// --- Annuler un rendez-vous ----------------------------------------------------------------------------

/**
 * « Annuler la visite » : le rendez-vous quitte le planning — le créneau se
 * libère, la visite disparaît de l'espace du client, le rappel de la veille
 * n'a plus lieu. C'est la suppression (supprimerRendezVous), avec sa trace :
 * une ligne au fil du dossier, une au journal. Aucun message ne part.
 *
 * Une visite faite, ou commencée sur la tablette, ne s'annule plus : elle se
 * classe sans suite (son compte-rendu, son inventaire restent).
 */
export async function annulerRdv(id: number, retour: string | null): Promise<IssuePlanif> {
  const u = await currentUser();
  if (!Number.isSafeInteger(id) || id <= 0) return { erreur: "Rendez-vous introuvable." };
  const issue = await transaction<{ erreur: string } | { r: AvantRdv; activite: string | null }>(async (db: Db) => {
    const [r] = await db.query<AvantRdv & { termine: boolean; tablette: boolean }>(
      `select r.id, r.type, r.titre, r.lieu, r.notes, r.debut, r.duree_min, r.journee, r.commercial_id, u.nom as commercial, r.dossier_id, r.termine,
              exists (select 1 from visites v where v.rendez_vous_id = r.id and v.statut in ('en_cours', 'signee')) as tablette
         from rendez_vous r join utilisateurs u on u.id = r.commercial_id where r.id = $1 for update of r`,
      [id],
    );
    if (!r) return { erreur: "Ce rendez-vous n'existe plus : il a peut-être déjà été annulé." };
    const visite = (r.type === "phys" || r.type === "visio") && !r.journee;
    if (visite && r.tablette) return { erreur: "La visite a commencé sur la tablette : elle ne s'annule plus. Classez-la sans suite si elle n'a rien donné." };
    if (visite && r.termine) return { erreur: "La visite est faite : elle ne s'annule plus. Classez-la sans suite si elle n'a rien donné." };
    await verrouillerPlanning(db, r.commercial_id);
    await oublierEtatRdv(id, db);
    await db.query("delete from rendez_vous where id = $1", [id]);
    if (!r.dossier_id) return { r, activite: null };
    const activite = visite
      ? `${r.type === "visio" ? "Visio" : "Visite sur place"} du ${momentVisite(r.debut, true)} avec ${r.commercial} annulée`
      : `${quoiRdv(r)} du ${jourVisite(r.debut, true)} annulée`;
    await db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [r.dossier_id, u.id, activite]);
    await db.query("update dossiers set maj_le = now() where id = $1", [r.dossier_id]);
    return { r, activite };
  });
  if ("erreur" in issue) return { erreur: issue.erreur };
  const { r, activite } = issue;
  const le = new Date(r.debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
  await journaliser({
    action: "rdv.supprime",
    libelle: activite ?? `Rendez-vous « ${r.titre} » du ${le} annulé`,
    objet: { type: "rdv", id },
    dossierId: r.dossier_id,
    details: { titre: r.titre, type: r.type, debut: new Date(r.debut).toISOString(), journee: r.journee, commercial: r.commercial },
    activite,
  });
  await projeterEspace(r.dossier_id);
  rafraichir(r.dossier_id);
  if (r.dossier_id && retour !== "planning") redirect(`/dossiers/${r.dossier_id}?visite=annulee#demenagements-visites`);
  redirect(`/planning?semaine=${lundiDuJour(new Date(r.debut).toISOString().slice(0, 10))}&com=${r.commercial_id}&ok=annule`);
}
