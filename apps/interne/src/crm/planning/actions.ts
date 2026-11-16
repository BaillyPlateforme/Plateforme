"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1, transaction, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { projeterEspace } from "@/crm/lib/espace";
import { envoyerSms } from "@/crm/actions2";
import { oublierEtatRdv, type EtatRdv } from "@/crm/rdv/sms";
import { estVisite } from "@/crm/visites/cycle";
import { instantParis, momentVisite } from "@/lib/visite/regles";
import { raisonConfirmationOubliee } from "./planificateur/regles";
import { creneauPris, phraseReplanifiee, replanifierVisite, verrouillerPlanning } from "./planificateur/serveur";

/*
 * Les rendez-vous du planning commercial : les déplacer au glisser-déposer,
 * classer une visite effectuée ou sans suite, et la fenêtre de visite (les
 * adresses du dossier, comme dans Créagidem). Les modifier et les annuler se
 * fait dans le planificateur (/planning/<id>, planificateur/actions.ts).
 *
 * Une visite (sur place ou en visio) suit la règle des créneaux proposés et
 * de la réservation par le client (ec_poser_visite_crm) : elle ne se pose pas
 * sur un autre rendez-vous du commercial, ni sur un créneau qu'il propose
 * encore à un autre client (planificateur/serveur.ts). Une tâche ou une règle
 * perso se place librement, comme à la création. Une journée entière informe
 * et ne bloque rien.
 *
 * Après chaque changement d'une visite rattachée à un dossier, l'espace
 * client suit (projection), et le rappel de la veille suit le nouvel horaire
 * de lui-même (sa clé porte l'heure de la visite). Déplacée, une visite perd
 * l'état de sa confirmation par le client (rdv/sms.ts, oublierEtatRdv).
 */

const s = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const n = (f: FormData, k: string) => {
  const v = s(f, k);
  return v == null ? null : Number(v.replace(",", "."));
};

function rafraichir(dossierId?: number | null) {
  revalidatePath("/(interne)", "layout");
  revalidatePath("/(tablette)", "layout");
  if (dossierId) revalidatePath(`/dossiers/${dossierId}`);
}

async function noter(dossierId: number | null, utilisateurId: number, libelle: string) {
  if (!dossierId) return;
  await q("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [dossierId, utilisateurId, libelle]);
  await q("update dossiers set maj_le = now() where id = $1", [dossierId]);
}

export type IssueDeplacement =
  | { ok: true; visite: boolean; telephone: boolean; /** L'état de confirmation oublié (il portait sur l'ancien horaire). */ oublie?: EtatRdv | null }
  | { ok: false; erreur: string };

/**
 * Le glisser-déposer de la grille (et « Déplacer » de sa fenêtre) : un nouveau jour (AAAA-MM-JJ) et une
 * nouvelle heure de Paris (HH:MM). La règle des visites est celle du planificateur (planificateur/serveur.ts),
 * sous le même verrou ; déplacée, la visite perd l'état de sa confirmation, comme dans le planificateur.
 */
export async function deplacerRdv(id: number, jour: string, hhmm: string): Promise<IssueDeplacement> {
  const u = await currentUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^\d{2}:\d{2}$/.test(hhmm)) return { ok: false, erreur: "Heure illisible." };
  const { issue, dossierId } = await transaction<{ issue: IssueDeplacement; dossierId?: number | null }>(async (db) => {
    const ko = (erreur: string) => ({ issue: { ok: false as const, erreur } });
    const [r] = await db.query<Row>(
      `select r.id, r.type, r.titre, r.journee, r.commercial_id, u.nom as commercial, r.dossier_id, r.duree_min, r.debut, c.telephone
         from rendez_vous r join utilisateurs u on u.id = r.commercial_id left join dossiers d on d.id = r.dossier_id left join clients c on c.id = d.client_id
        where r.id = $1 for update of r`,
      [id],
    );
    if (!r) return ko("Rendez-vous introuvable.");
    const debut = instantParis(jour, r.journee ? "12:00" : hhmm);
    if (+debut === +new Date(r.debut)) return { issue: { ok: true, visite: false, telephone: false } };
    await verrouillerPlanning(db, r.commercial_id);
    if (estVisite(r.type) && !r.journee && r.duree_min > 0) {
      const pris = await creneauPris(db, { commercial: { id: r.commercial_id, nom: r.commercial }, type: r.type, debut, duree: r.duree_min, dossierId: r.dossier_id, saufRdv: id });
      if (pris) return ko(pris);
    }
    await db.query("update rendez_vous set debut = $2 where id = $1", [id, debut.toISOString()]);
    const oublie = await oublierEtatRdv(id, db);
    const visite = estVisite(r.type) && !r.journee && !!r.dossier_id;
    // Déplacée à un horaire à venir, une visite marquée faite redevient planifiée (planificateur/serveur.ts).
    const replanifiee = visite ? await replanifierVisite(db, id, debut) : null;
    if (r.dossier_id) {
      const noterDb = (libelle: string) => db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [r.dossier_id, u.id, libelle]);
      if (visite) await noterDb(`${r.type === "visio" ? "Visio" : "Visite"} déplacée au ${momentVisite(debut, true)}`);
      if (replanifiee) await noterDb(phraseReplanifiee(replanifiee));
      if (oublie) await noterDb(`Confirmation de la visite remise à zéro : ${raisonConfirmationOubliee(oublie.etat)}`);
      await db.query("update dossiers set maj_le = now() where id = $1", [r.dossier_id]);
    }
    return {
      issue: { ok: true, visite, telephone: visite && !!String(r.telephone ?? "").replace(/\D/g, ""), oublie: oublie?.etat ?? null },
      dossierId: r.dossier_id as number | null,
    };
  });
  if (issue.ok) {
    await projeterEspace(dossierId ?? null);
    rafraichir(dossierId);
  }
  return issue;
}

/** Le SMS de confirmation d'un rendez-vous déplacé : le même que celui de la fiche du dossier. */
export async function confirmerParSms(id: number) {
  await currentUser();
  const r = await q1<{ dossier_id: number | null }>("select dossier_id from rendez_vous where id = $1", [id]);
  if (r?.dossier_id) await envoyerSms(r.dossier_id, id);
  rafraichir(r?.dossier_id);
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
