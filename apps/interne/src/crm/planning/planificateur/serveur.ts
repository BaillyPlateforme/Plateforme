import "server-only";
import type { Db } from "@/crm/lib/db";
import { parleDeVisio, type TypeRdv } from "../types-rdv";

/*
 * La règle des visites telle que le serveur la tient, partagée par tout ce
 * qui pose ou déplace un rendez-vous de visite : le planificateur (planifier,
 * modifier) et le glisser-déposer de la grille. Les mêmes mots que la
 * réservation par le client (ec_poser_visite_crm) :
 *
 * - le planning du commercial est verrouillé pendant qu'on pose (le même
 *   verrou que la réservation par le client) ;
 * - une visite ne se pose ni sur un autre rendez-vous du commercial, ni sur un
 *   créneau qu'il propose encore à un autre client ;
 * - sauf une visio pendant une règle perso « visios uniquement ».
 *
 * Une tâche ou une règle perso se place librement ; une journée entière
 * informe et ne bloque rien : l'appelant ne demande la règle que pour une
 * visite à l'heure.
 */

/** Le verrou du planning d'un commercial, jusqu'à la fin de la transaction. */
export const verrouillerPlanning = (db: Db, commercialId: number) => db.query("select pg_advisory_xact_lock(hashtext('bailly.crm.planning'), $1)", [commercialId]);

/**
 * Le créneau est-il pris pour une visite de ce commercial ? Rend la phrase à
 * dire, ou null s'il est libre. `saufRdv` : le rendez-vous que l'on déplace
 * (il ne se gêne pas lui-même) ; les créneaux proposés au client du dossier
 * ne gênent pas sa propre visite.
 */
export async function creneauPris(
  db: Db,
  o: { commercial: { id: number; nom: string }; type: TypeRdv; debut: Date; duree: number; dossierId: number | null; saufRdv?: number | null },
): Promise<string | null> {
  const fin = new Date(o.debut.getTime() + o.duree * 60_000);
  const occupe = await db.query<{ genre: string; titre: string | null; lieu: string | null; type: string | null }>(
    `select 'rdv' as genre, r.titre, r.lieu, r.type from rendez_vous r
      where r.commercial_id = $1 and not r.journee and r.debut < $3 and r.debut + make_interval(mins => r.duree_min) > $2
        and r.id <> coalesce($5::int, -1)
     union all
     select 'propose', null, null, null from creneaux_visite c join propositions_visite p on p.id = c.proposition_id
      where p.commercial_id = $1 and p.statut = 'ouverte' and c.statut = 'propose' and p.dossier_id <> coalesce($4::int, -1)
        and c.debut < $3 and c.debut + make_interval(mins => p.duree_min) > $2`,
    [o.commercial.id, o.debut.toISOString(), fin.toISOString(), o.dossierId, o.saufRdv ?? null],
  );
  // Une règle perso « visios uniquement » laisse passer une visio.
  const conflit = occupe.find((x) => !(o.type === "visio" && x.type === "perso" && parleDeVisio(`${x.titre} ${x.lieu ?? ""}`)));
  if (!conflit) return null;
  return conflit.genre === "propose"
    ? `${o.commercial.nom} propose déjà ce créneau à un autre client : choisissez-en un autre.`
    : `${o.commercial.nom} n'est pas libre à cette heure (« ${conflit.titre} ») : choisissez un autre créneau.`;
}

/**
 * Une visite déplacée à un horaire à venir est replanifiée : elle n'est plus
 * faite tant qu'elle ne l'est pas (retours de Céline, 16/11/2026 : le
 * parcours disait « Visite technique · 13 nov. », faite, d'une visite
 * déplacée au 17).
 *   - « terminé » est retiré ;
 *   - un compte-rendu déjà signé pour ce rendez-vous (une visite faite plus
 *     tôt sur la tablette) en est détaché : il reste au dossier, signé et
 *     intact (ses documents ne bougent pas), comme une visite sans
 *     rendez-vous, et ne fait plus passer la nouvelle visite pour faite. Une
 *     saisie encore en cours reste rattachée : elle continuera au nouvel
 *     horaire.
 * Déplacée dans le passé (on corrige l'heure d'une visite faite), rien ne
 * change. Rend ce qui a été défait, pour le fil du dossier ; null sinon.
 */
export async function replanifierVisite(db: Db, rdvId: number, debut: Date, maintenant = new Date()): Promise<{ termine: boolean; comptesRendus: { id: number; signe_le: Date }[] } | null> {
  if (debut.getTime() <= maintenant.getTime()) return null;
  const [avant] = await db.query<{ termine: boolean }>("select termine from rendez_vous where id = $1", [rdvId]);
  if (avant?.termine) await db.query("update rendez_vous set termine = false where id = $1", [rdvId]);
  const comptesRendus = await db.query<{ id: number; signe_le: Date }>(
    "update visites set rendez_vous_id = null where rendez_vous_id = $1 and statut = 'signee' returning id, signe_le",
    [rdvId],
  );
  return avant?.termine || comptesRendus.length ? { termine: !!avant?.termine, comptesRendus } : null;
}

/** La ligne du fil du dossier d'une visite replanifiée (replanifierVisite). */
export function phraseReplanifiee(r: { termine: boolean; comptesRendus: { signe_le: Date }[] }) {
  const cr = r.comptesRendus.map((c) => new Date(c.signe_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }));
  const suite = cr.length ? ` : le compte-rendu signé le ${cr.join(", le ")} reste au dossier, détaché de cette visite` : "";
  return `Visite remise à « planifiée » (déplacée à un horaire à venir)${suite}`;
}

/**
 * L'étage, l'ascenseur et l'accès saisis pour une visite sur place : ceux de
 * l'étape du trajet, qu'ils complètent ou corrigent. Une étape sans adresse
 * prend celle de la visite ; une adresse déjà saisie reste celle du dossier.
 * Rend « du départ », « de l'arrivée » ou « de l'étape » quand l'étape a
 * changé (pour la ligne d'activité), null sinon.
 */
export async function reporterAcces(
  db: Db,
  o: { etapeId: number; dossierId: number; etage: string | null; ascenseur: boolean; acces: string | null; lieu: string | null },
): Promise<string | null> {
  const [e] = await db.query<{ genre: string; adresse: string | null; etage: string | null; ascenseur: boolean; acces: string | null }>(
    "select genre, adresse, etage, ascenseur, acces from etapes_trajet where id = $1 and dossier_id = $2 for update",
    [o.etapeId, o.dossierId],
  );
  if (!e) return null;
  const adresse = e.adresse?.trim() ? e.adresse : o.lieu;
  if (o.etage === e.etage && o.ascenseur === e.ascenseur && o.acces === e.acces && adresse === e.adresse) return null;
  await db.query("update etapes_trajet set etage = $3, ascenseur = $4, acces = $5, adresse = $6 where id = $1 and dossier_id = $2", [
    o.etapeId, o.dossierId, o.etage, o.ascenseur, o.acces, adresse,
  ]);
  return e.genre === "depart" ? "du départ" : e.genre === "arrivee" ? "de l'arrivée" : "de l'étape";
}
