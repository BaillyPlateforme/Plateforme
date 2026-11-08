"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1, transaction, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { projeterEspace } from "@/crm/lib/espace";
import { envoyerSms } from "@/crm/actions2";
import { conflit, occupation } from "@/crm/visites/creneaux";
import { estVisite } from "@/crm/visites/cycle";
import { instantParis, momentVisite } from "@/lib/visite/regles";

/*
 * Les rendez-vous du planning commercial : les modifier, les déplacer au
 * glisser-déposer, les supprimer, classer une visite sans suite, et la
 * fenêtre de visite (les adresses du dossier, comme dans Créagidem).
 *
 * Une visite (sur place ou en visio) suit la règle des créneaux proposés et
 * de la réservation par le client (ec_poser_visite_crm) : elle ne se pose pas
 * sur un autre rendez-vous du commercial, ni sur un créneau qu'il propose
 * encore à un autre client. Une tâche ou une règle perso se place librement,
 * comme à la création. Une journée entière informe et ne bloque rien.
 *
 * Après chaque changement d'une visite rattachée à un dossier, l'espace
 * client suit (projection), et le rappel de la veille suit le nouvel horaire
 * de lui-même (sa clé porte l'heure de la visite).
 */

const s = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const n = (f: FormData, k: string) => {
  const v = s(f, k);
  return v == null ? null : Number(v.replace(",", "."));
};
const TYPES = ["phys", "visio", "tache", "perso"];

function rafraichir(dossierId?: number | null) {
  revalidatePath("/(interne)", "layout");
  revalidatePath("/(tablette)", "layout");
  if (dossierId) revalidatePath(`/dossiers/${dossierId}`);
}

/** Le créneau est-il libre pour une visite du commercial ? Rend le libellé du conflit, ou null. */
async function chevauchement(r: { id: number; type: string; journee: boolean; commercial_id: number; dossier_id: number | null }, debut: Date, duree: number) {
  if (!estVisite(r.type) || r.journee || duree <= 0) return null;
  const plages = await occupation(r.commercial_id, debut, new Date(debut.getTime() + duree * 60_000), r.dossier_id, undefined, r.id);
  return conflit(plages, debut, duree)?.libelle ?? null;
}

async function noter(dossierId: number | null, utilisateurId: number, libelle: string) {
  if (!dossierId) return;
  await q("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [dossierId, utilisateurId, libelle]);
  await q("update dossiers set maj_le = now() where id = $1", [dossierId]);
}

export type IssueDeplacement = { ok: true; visite: boolean; telephone: boolean } | { ok: false; erreur: string };

/** Le glisser-déposer de la grille : un nouveau jour (AAAA-MM-JJ) et une nouvelle heure de Paris (HH:MM). */
export async function deplacerRdv(id: number, jour: string, hhmm: string): Promise<IssueDeplacement> {
  const u = await currentUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^\d{2}:\d{2}$/.test(hhmm)) return { ok: false, erreur: "Heure illisible." };
  const r = await q1<Row>(
    "select r.id, r.type, r.journee, r.commercial_id, r.dossier_id, r.duree_min, r.debut, c.telephone from rendez_vous r left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id where r.id = $1",
    [id],
  );
  if (!r) return { ok: false, erreur: "Rendez-vous introuvable." };
  const debut = instantParis(jour, r.journee ? "12:00" : hhmm);
  if (+debut === +new Date(r.debut)) return { ok: true, visite: false, telephone: false };
  const c = await chevauchement(r as never, debut, r.duree_min);
  if (c) return { ok: false, erreur: `Le commercial n'est pas libre à cette heure (${c}).` };
  await q("update rendez_vous set debut = $2 where id = $1", [id, debut.toISOString()]);
  const visite = estVisite(r.type) && !r.journee && !!r.dossier_id;
  if (visite) await noter(r.dossier_id, u.id, `Visite déplacée au ${momentVisite(debut, true)}`);
  await projeterEspace(r.dossier_id);
  rafraichir(r.dossier_id);
  return { ok: true, visite, telephone: visite && !!String(r.telephone ?? "").replace(/\D/g, "") };
}

/** Le SMS de confirmation d'un rendez-vous déplacé : le même que celui de la fiche du dossier. */
export async function confirmerParSms(id: number) {
  await currentUser();
  const r = await q1<{ dossier_id: number | null }>("select dossier_id from rendez_vous where id = $1", [id]);
  if (r?.dossier_id) await envoyerSms(r.dossier_id, id);
  rafraichir(r?.dossier_id);
}

/** La page d'un rendez-vous : tout se modifie, la règle des visites tient. */
export async function modifierRdv(id: number, f: FormData) {
  const u = await currentUser();
  const r = await q1<Row>("select id, type, journee, commercial_id, dossier_id, debut, duree_min from rendez_vous where id = $1", [id]);
  if (!r) redirect("/planning");
  const retour = (m: string) => redirect(`/planning/${id}?erreur=${encodeURIComponent(m)}`);
  const type = TYPES.includes(s(f, "type") ?? "") ? s(f, "type")! : r.type;
  const journee = f.get("journee") === "on";
  const jour = s(f, "date");
  const heure = s(f, "heure") ?? "09:00";
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^\d{2}:\d{2}$/.test(heure)) retour("Date ou heure illisible.");
  const duree = journee ? 0 : Math.round(n(f, "duree_min") ?? 60);
  if (!journee && !(duree >= 15 && duree <= 720)) retour("Durée de 15 minutes à 12 heures.");
  const commercial = n(f, "commercial_id") ?? r.commercial_id;
  if (!(await q1("select 1 from utilisateurs where id = $1", [commercial]))) retour("Commercial introuvable.");
  const debut = instantParis(jour!, journee ? "12:00" : heure);
  const c = await chevauchement({ id, type, journee, commercial_id: commercial!, dossier_id: r.dossier_id }, debut, duree);
  if (c) retour(`Le commercial n'est pas libre à cette heure (${c}).`);
  await q(
    "update rendez_vous set type = $2, titre = $3, lieu = $4, debut = $5, duree_min = $6, commercial_id = $7, notes = $8, journee = $9 where id = $1",
    [id, type, s(f, "titre") ?? "Rendez-vous", s(f, "lieu"), debut.toISOString(), duree, commercial, s(f, "notes"), journee],
  );
  const deplace = +debut !== +new Date(r.debut);
  if (estVisite(type) && r.dossier_id) await noter(r.dossier_id, u.id, deplace ? `Visite déplacée au ${momentVisite(debut, true)}` : "Rendez-vous de visite modifié");
  if (deplace && f.get("sms") === "on" && r.dossier_id) await envoyerSms(r.dossier_id, id);
  await projeterEspace(r.dossier_id);
  rafraichir(r.dossier_id);
  redirect(`/planning?semaine=${jour}&ok=modifie`);
}

/** Supprime un rendez-vous (le bouton de sa page, après confirmation). */
export async function supprimerRendezVous(id: number) {
  const u = await currentUser();
  const r = await q1<{ dossier_id: number | null; debut: Date; type: string; journee: boolean }>(
    "delete from rendez_vous where id = $1 returning dossier_id, debut, type, journee",
    [id],
  );
  if (r && estVisite(r.type) && !r.journee) await noter(r.dossier_id, u.id, `Rendez-vous de visite du ${momentVisite(r.debut, true)} supprimé`);
  await projeterEspace(r?.dossier_id);
  rafraichir(r?.dossier_id);
  redirect(`/planning?semaine=${r ? new Date(r.debut).toISOString().slice(0, 10) : ""}&ok=supprime`);
}

/** Le cycle d'une visite : effectuée, ou classée sans suite (et l'inverse). */
export async function changerEtatVisite(id: number, etat: "effectuee" | "sans_suite" | "reprise") {
  const u = await currentUser();
  const r = await q1<{ dossier_id: number | null }>(
    etat === "effectuee"
      ? "update rendez_vous set termine = true where id = $1 returning dossier_id"
      : "update rendez_vous set sans_suite = $2 where id = $1 returning dossier_id",
    etat === "effectuee" ? [id] : [id, etat === "sans_suite"],
  );
  await noter(r?.dossier_id ?? null, u.id, etat === "effectuee" ? "Visite effectuée" : etat === "sans_suite" ? "Visite classée sans suite" : "Visite reprise (plus sans suite)");
  await projeterEspace(r?.dossier_id);
  rafraichir(r?.dossier_id);
}

// --- La fenêtre de visite : les adresses du dossier ----------------------------------------------

const OUI_NON_EVALUER = ["oui", "non", "a_evaluer"];
const STATIONNEMENTS = ["facile", "autorisation", "reserve_client"];

/**
 * Enregistre les adresses et les accès du dossier, étape par étape. Les
 * boutons « Ajouter une étape » (ajouter=1) et « Retirer » (retirer=<id>)
 * passent par ici : ce qui vient d'être saisi est enregistré d'abord.
 */
export async function majFenetreVisite(rdvId: number, dossierId: number, f: FormData) {
  const u = await currentUser();
  const etapes = await q<{ id: number }>("select id from etapes_trajet where dossier_id = $1", [dossierId]);
  const ajouter = f.get("ajouter") === "1";
  const retirer = n(f, "retirer");
  await transaction(async (db) => {
    await db.query("select 1 from dossiers where id = $1 for update", [dossierId]);
    for (const { id } of etapes) {
      const portage = n(f, `portage_${id}`);
      const mm = s(f, `monte_meuble_${id}`);
      const st = s(f, `stationnement_${id}`);
      await db.query(
        `update etapes_trajet set adresse = $3, code_postal = $4, ville = $5, pays = $6, telephone = $7, etage = $8, ascenseur = $9,
                monte_charge = $10, transbordement = $11, portage_m = $12, monte_meuble = $13, stationnement = $14, acces = $15
          where id = $1 and dossier_id = $2`,
        [
          id, dossierId, s(f, `adresse_${id}`), s(f, `code_postal_${id}`), s(f, `ville_${id}`), s(f, `pays_${id}`), s(f, `telephone_${id}`),
          s(f, `etage_${id}`), f.get(`ascenseur_${id}`) === "on", f.get(`monte_charge_${id}`) === "on", f.get(`transbordement_${id}`) === "on",
          portage != null && portage >= 0 && portage <= 1000 ? Math.round(portage) : null,
          mm && OUI_NON_EVALUER.includes(mm) ? mm : null, st && STATIONNEMENTS.includes(st) ? st : null, s(f, `acces_${id}`),
        ],
      );
    }
    if (ajouter) {
      // Une destination de plus, avant l'arrivée.
      const [m] = await db.query<{ ordre: number | null }>("select max(ordre) as ordre from etapes_trajet where dossier_id = $1 and genre <> 'arrivee'", [dossierId]);
      const ordre = (m?.ordre ?? 0) + 1;
      await db.query("update etapes_trajet set ordre = ordre + 1 where dossier_id = $1 and ordre >= $2", [dossierId, ordre]);
      await db.query("insert into etapes_trajet (dossier_id, ordre, genre) values ($1, $2, 'autre')", [dossierId, ordre]);
    }
    // Jamais le départ ni l'arrivée.
    if (retirer) await db.query("delete from etapes_trajet where id = $1 and dossier_id = $2 and genre in ('autre', 'garde_meuble')", [retirer, dossierId]);
  });
  await noter(dossierId, u.id, ajouter ? "Étape ajoutée au trajet (fenêtre de visite)" : retirer ? "Étape retirée du trajet (fenêtre de visite)" : "Adresses et accès mis à jour (fenêtre de visite)");
  await projeterEspace(dossierId);
  rafraichir(dossierId);
  redirect(`/planning/${rdvId}?ok=${ajouter ? "etape" : "adresses"}#fenetre`);
}
