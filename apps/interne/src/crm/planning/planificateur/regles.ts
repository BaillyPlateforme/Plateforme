import type { CreneauPlanning, EvenementPlanning } from "../donnees";
import { heure } from "../grille";
import { estJourneeVisio, parleDeVisio, type TypeRdv } from "../types-rdv";

/*
 * Les règles du planificateur de visite, sans effet de bord : le titre et la
 * durée proposés d'office, et ce que le créneau choisi rencontre dans la
 * semaine du commercial. Le serveur tient la même règle à l'enregistrement
 * (actions.ts) : une visite ne se pose ni sur un autre rendez-vous du
 * commercial, ni sur un créneau qu'il propose encore à un autre client ;
 * une tâche ou une règle perso se place librement, avec un avertissement.
 *
 * Deux règles de la réunion du 23/09 s'y ajoutent :
 * - une règle perso qui parle de visio (« Semaine des enfants · Visios
 *   uniquement ») laisse passer une visio, pas une visite sur place ;
 * - une « journée visio » (journée entière posée en visio) avertit quand on
 *   y place une visite sur place, et propose de passer en visio.
 */

export type Alerte = { ton: "ko" | "attention" | "info"; texte: string; passerEnVisio?: boolean };

/** « Mme Dumont », « M. Roussel », la société, sinon le prénom et le nom : comme les titres du planning. */
export function appelClient(c: { civilite?: string | null; prenom?: string | null; nom?: string | null; societe?: string | null }) {
  if (c.societe?.trim()) return c.societe.trim();
  if (c.civilite === "Madame" && c.nom) return `Mme ${c.nom}`;
  if (c.civilite === "Monsieur" && c.nom) return `M. ${c.nom}`;
  return [c.prenom, c.nom].filter(Boolean).join(" ");
}

/**
 * Le titre proposé pour une visite : le client, « Mme Dumont », comme les autres visites du planning (et
 * celles que le client réserve dans son espace) — la couleur et l'icône du bloc disent déjà « sur place »
 * ou « visio », et dans une colonne étroite le nom reste lisible. Rien d'office pour une tâche ou une règle.
 */
export function titreParDefaut(type: TypeRdv, appel: string | null) {
  return appel && (type === "phys" || type === "visio") ? appel : "";
}

/** La durée proposée, en minutes : 1 h 30 sur place, 1 h en visio ou pour une tâche, comme au planning de démonstration. */
export const dureeParDefaut = (type: TypeRdv) => (type === "phys" ? 90 : 60);

const chevauche = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && a1 > b0;

/**
 * Ce que rencontre un créneau dans la semaine du commercial : chevauchements,
 * créneaux proposés à d'autres clients, journée visio, règle « visios
 * uniquement ». `bloquant` : une visite ne peut pas s'y poser.
 */
export function verifierCreneau(o: {
  type: TypeRdv;
  jour: string;
  debutMin: number;
  duree: number;
  journee: boolean;
  evenements: EvenementPlanning[];
  creneaux: CreneauPlanning[];
  dossierId: number | null;
  commercial: string;
  /** L'instant du choix (ms) et l'instant du créneau : un créneau passé ne se choisit pas. */
  maintenant: number;
  debut: number;
}): { bloquant: boolean; alertes: Alerte[] } {
  const alertes: Alerte[] = [];
  const visite = o.type === "phys" || o.type === "visio";
  const prenom = o.commercial.split(" ")[0] || o.commercial;

  // Une journée entière se pose à midi : passée seulement le lendemain.
  const passe = o.journee ? o.debut + 12 * 3_600_000 < o.maintenant : o.debut < o.maintenant;
  if (passe) alertes.push({ ton: "ko", texte: o.journee ? "Cette journée est passée." : "Ce créneau est déjà passé." });
  if (o.journee) return { bloquant: passe, alertes };

  const fin = o.debutMin + o.duree;
  for (const e of o.evenements) {
    if (e.jour !== o.jour || e.journee || e.duree <= 0 || !chevauche(o.debutMin, fin, e.debutMin, e.debutMin + e.duree)) continue;
    const plage = `${heure(e.debutMin)}–${heure(e.debutMin + e.duree)}`;
    if (e.type === "perso" && parleDeVisio(`${e.titre} ${e.lieu ?? ""}`)) {
      if (o.type === "visio") alertes.push({ ton: "info", texte: `Pendant « ${e.titre} » (${plage}) : ${prenom} ne fait que des visios, celle-ci y a sa place.` });
      else if (o.type === "phys") alertes.push({ ton: "ko", texte: `« ${e.titre} » (${plage}) : ${prenom} ne fait que des visios sur ce créneau.`, passerEnVisio: true });
      else alertes.push({ ton: "attention", texte: `Chevauche « ${e.titre} » (${plage}).` });
      continue;
    }
    alertes.push({ ton: visite ? "ko" : "attention", texte: `Chevauche « ${e.titre} » (${plage}).` });
  }
  for (const c of o.creneaux) {
    if (c.jour !== o.jour || !chevauche(o.debutMin, fin, c.debutMin, c.debutMin + c.duree)) continue;
    if (o.dossierId && c.dossierId === o.dossierId) {
      alertes.push({ ton: "info", texte: "Ce créneau fait partie de ceux proposés à ce client." });
      continue;
    }
    alertes.push({
      ton: visite ? "ko" : "attention",
      texte: `Créneau proposé à ${c.client} (${heure(c.debutMin)}) : il lui reste réservé tant qu'il n'a pas choisi.`,
    });
  }
  const journeeVisio = o.evenements.find((e) => e.jour === o.jour && estJourneeVisio(e));
  if (journeeVisio && o.type === "phys") {
    alertes.push({ ton: "attention", texte: `Journée visio de ${prenom} (« ${journeeVisio.titre} ») : une visite sur place ce jour-là ?`, passerEnVisio: true });
  }
  return { bloquant: passe || (visite && alertes.some((a) => a.ton === "ko")), alertes };
}
