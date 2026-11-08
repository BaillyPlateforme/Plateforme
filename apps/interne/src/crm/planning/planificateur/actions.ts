"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q1, transaction } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { projeterEspace } from "@/crm/lib/espace";
import { instantParis, jourVisite, momentVisite } from "@/lib/visite/regles";
import { estTypeRdv, parleDeVisio, TYPES_RDV, type TypeRdv } from "../types-rdv";
import { lundiDuJour } from "../grille";
import { semainePlanif, type SemainePlanif } from "./donnees";

/*
 * Les actions du planificateur de visite (/planning/nouveau).
 *
 * planifierRdv pose le rendez-vous, sous le verrou du planning du commercial
 * (le même que la réservation par le client, ec_poser_visite_crm) : une
 * visite ne se pose ni sur un autre rendez-vous du commercial, ni sur un
 * créneau qu'il propose encore à un autre client — sauf une visio pendant une
 * règle perso « visios uniquement ». Pour un dossier, elle retire la
 * proposition de créneaux restée ouverte (comme une réservation directe),
 * reporte l'étage et l'accès saisis sur l'étape du trajet, inscrit l'activité
 * et projette l'espace client. Aucun SMS ne part : la fiche du dossier, au
 * retour, propose d'envoyer la confirmation.
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

/** La semaine d'un commercial, lue quand on change de semaine, de commercial, de type ou de durée. */
export async function chargerSemaine(commercialId: number, lundi: string, dossierId: number | null, type: string, duree: number): Promise<SemainePlanif | null> {
  await currentUser();
  if (!Number.isSafeInteger(commercialId) || !JOUR.test(lundi) || !estTypeRdv(type)) return null;
  const d = Number.isSafeInteger(dossierId) && (dossierId ?? 0) > 0 ? dossierId : null;
  const min = Math.min(720, Math.max(15, Math.round(Number(duree) || 60)));
  return semainePlanif(commercialId, lundiDuJour(lundi), d, type, min);
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
  const fin = new Date(debut.getTime() + duree * 60_000);
  // Le lieu : l'adresse de la visite sur place, le lien de la visio s'il y en a un, ou ce que dit la tâche.
  const lieu = type === "visio" ? (s(f, "lien_visio") ?? "Visio") : s(f, "lieu");
  const notes = s(f, "notes");
  const depuisId = dossierId ? n(f, "depuis_id") : null;

  const issue = await transaction<{ erreur: string } | { rdv: number }>(async (db) => {
    if (dossierId) await db.query("select 1 from dossiers where id = $1 for update", [dossierId]);
    // Le même verrou que la réservation par le client : le planning du commercial ne bouge pas pendant qu'on pose.
    await db.query("select pg_advisory_xact_lock(hashtext('bailly.crm.planning'), $1)", [commercial.id]);
    if (visite && !journee) {
      const occupe = await db.query<{ genre: string; titre: string | null; lieu: string | null; type: string | null }>(
        `select 'rdv' as genre, r.titre, r.lieu, r.type from rendez_vous r
          where r.commercial_id = $1 and not r.journee and r.debut < $3 and r.debut + make_interval(mins => r.duree_min) > $2
         union all
         select 'propose', null, null, null from creneaux_visite c join propositions_visite p on p.id = c.proposition_id
          where p.commercial_id = $1 and p.statut = 'ouverte' and c.statut = 'propose' and p.dossier_id <> coalesce($4::int, -1)
            and c.debut < $3 and c.debut + make_interval(mins => p.duree_min) > $2`,
        [commercial.id, debut.toISOString(), fin.toISOString(), dossierId],
      );
      // Une règle perso « visios uniquement » laisse passer une visio.
      const conflit = occupe.find((o) => !(type === "visio" && o.type === "perso" && parleDeVisio(`${o.titre} ${o.lieu ?? ""}`)));
      if (conflit) {
        return {
          erreur:
            conflit.genre === "propose"
              ? `${commercial.nom} propose déjà ce créneau à un autre client : choisissez-en un autre.`
              : `${commercial.nom} n'est pas libre à cette heure (« ${conflit.titre} ») : choisissez un autre créneau.`,
        };
      }
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
      const [e] = await db.query<{ genre: string; adresse: string | null; etage: string | null; ascenseur: boolean; acces: string | null }>(
        "select genre, adresse, etage, ascenseur, acces from etapes_trajet where id = $1 and dossier_id = $2 for update",
        [etapeId, dossierId],
      );
      if (e) {
        const etage = s(f, "etage");
        const ascenseur = f.get("ascenseur") === "on";
        const acces = s(f, "acces");
        // Une étape sans adresse prend celle de la visite ; une adresse déjà saisie reste celle du dossier.
        const adresse = e.adresse?.trim() ? e.adresse : lieu;
        if (etage !== e.etage || ascenseur !== e.ascenseur || acces !== e.acces || adresse !== e.adresse) {
          await db.query("update etapes_trajet set etage = $3, ascenseur = $4, acces = $5, adresse = $6 where id = $1 and dossier_id = $2", [
            etapeId, dossierId, etage, ascenseur, acces, adresse,
          ]);
          const genre = e.genre === "depart" ? "du départ" : e.genre === "arrivee" ? "de l'arrivée" : "de l'étape";
          await noter(`Étage et accès ${genre} mis à jour en planifiant la visite`);
        }
      }
    }
    await db.query("update dossiers set maj_le = now() where id = $1", [dossierId]);
    return { rdv: rdv.id };
  });

  if ("erreur" in issue) return { erreur: issue.erreur };
  await projeterEspace(dossierId);
  rafraichir(dossierId);
  if (dossierId) redirect(`/dossiers/${dossierId}?planifie=${issue.rdv}#demenagements-visites`);
  redirect(`/planning?semaine=${lundiDuJour(jour)}&com=${commercial.id}&ok=cree`);
}
