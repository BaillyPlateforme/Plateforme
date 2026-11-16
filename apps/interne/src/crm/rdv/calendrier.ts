import { jourParis, lendemain } from "@/lib/visite/regles";

/*
 * Le calendrier des SMS d'un rendez-vous de visite (retours de Céline,
 * 16/11/2026) : « Confirmation du RDV par SMS dès le RDV pris. Système de
 * relance 48 h avant RDV puis 24 h », et « Confirmation par SMS aussi des
 * visio – même règle que les SMS classiques ».
 *
 * - La confirmation part à la prise du rendez-vous (planificateur, réservation
 *   depuis la fiche du dossier).
 * - Les rappels partent par la tâche de la veille, qui passe une fois par
 *   jour en fin d'après-midi (16 h UTC : 17 h à Paris l'hiver, 18 h l'été).
 *   « 48 h avant » est donc son passage de l'avant-veille (J−2), « 24 h
 *   avant » celui de la veille (J−1), en jours de Paris : une visite de 10 h
 *   reçoit ses rappels environ 41 h et 17 h avant (une heure de moins l'été).
 * - Un rappel ne part pas le jour où la confirmation est partie : le client
 *   vient de recevoir la date et l'heure. Pris la veille, le rendez-vous n'a
 *   que sa confirmation ; pris l'avant-veille, sa confirmation et le rappel
 *   de la veille.
 *
 * Chaque SMS a sa carte dans « Courriers et SMS » (une pour la visite sur
 * place, une pour la visio) et sa clé d'idempotence : une fois par
 * rendez-vous, par horaire et par moment. Fonctions pures.
 */

export type MomentRappel = "j2" | "j1";
export type MomentSms = "confirmation" | MomentRappel;

/** Le rappel que la tâche du jour `jour` (AAAA-MM-JJ, à Paris) envoie pour une visite qui commence à `debut`, ou null. */
export function momentDuRappel(debut: Date | string, jour: string): MomentRappel | null {
  const j = jourParis(debut);
  if (j === lendemain(jour, 2)) return "j2";
  if (j === lendemain(jour, 1)) return "j1";
  return null;
}

/** Les jours (à Paris) où partent les rappels d'une visite : l'avant-veille (J−2) et la veille (J−1). */
export function joursDesRappels(debut: Date | string): Record<MomentRappel, string> {
  const j = jourParis(debut);
  return { j2: lendemain(j, -2), j1: lendemain(j, -1) };
}

/** Les cartes des SMS de rendez-vous, dans « Courriers et SMS » (messages/catalogue.ts). */
export const CARTES_SMS_RDV = {
  phys: { confirmation: "rdv_confirmation", j2: "rdv_rappel_j2", j1: "rdv_rappel_veille" },
  visio: { confirmation: "rdv_confirmation_visio", j2: "rdv_rappel_j2_visio", j1: "rdv_rappel_veille_visio" },
} as const;

export type CarteSmsRdv = (typeof CARTES_SMS_RDV)[keyof typeof CARTES_SMS_RDV][MomentSms];

/** La carte d'un SMS de rendez-vous : la visio a les siennes ; tout autre rendez-vous prend celles de la visite sur place. */
export const carteSms = (type: string, moment: MomentSms): CarteSmsRdv => CARTES_SMS_RDV[type === "visio" ? "visio" : "phys"][moment];

/**
 * La clé d'idempotence d'un SMS de rendez-vous : une par rendez-vous, par
 * horaire et par moment. Celles de la confirmation et du rappel de la veille
 * restent celles d'avant le 16/11/2026 : un SMS déjà parti ne repart pas.
 */
export function cleSmsRdv(rdvId: number, moment: MomentSms, debut: Date | string) {
  const iso = new Date(debut).toISOString();
  return `crm:rdv:${rdvId}:${moment === "confirmation" ? "confirmation" : moment === "j1" ? "rappel" : "rappel-j2"}:${iso}`;
}

/**
 * Le rappel a-t-il lieu d'être, le jour `jour` ? Non si la confirmation de
 * l'horaire est partie ce jour-là (crm.rdv_sms : elle est oubliée quand le
 * rendez-vous change d'horaire, rdv/sms.ts).
 */
export function rappelUtile(confirmation: { le: Date | string | null; statut: string | null } | null | undefined, jour: string) {
  return !(confirmation?.le && confirmation.statut === "envoye" && jourParis(confirmation.le) === jour);
}

/**
 * Les rappels prévus d'un rendez-vous, en clair (visites/rappels.ts,
 * rappelPrevu) : « SMS à J−2 et J−1, e-mail la veille ». `j2` nul : le
 * rappel de l'avant-veille est déjà passé.
 */
export function texteRappels(r: { canaux: ("sms" | "email")[]; j2: string | null }) {
  const parts: string[] = [];
  if (r.canaux.includes("sms")) parts.push(r.j2 ? "SMS à J−2 et J−1" : "SMS la veille");
  if (r.canaux.includes("email")) parts.push("e-mail la veille");
  return parts.join(", ");
}

/** « Rappel J−2 », « Rappel de la veille » : le moment, pour le fil du dossier. */
export const LIBELLES_RAPPEL: Record<MomentRappel, string> = { j2: "Rappel J−2", j1: "Rappel de la veille" };
