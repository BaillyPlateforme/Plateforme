import { aDecider, ETAPES_DEMANDE, type CleEtapeDemande } from "@/crm/kanban/etapes";
import type { Parcours } from "@/lib/parcours";
import type { RequestStatus } from "@/lib/types";

/*
 * Les étapes détaillées d'une demande du site : le Kanban de Demandes, un
 * zoom sur le début du parcours (demande de David, 08/11/2026). Chaque
 * colonne se déduit de ce que la base sait déjà de la demande — rien n'est
 * ajouté en base :
 *
 *   statut enregistré      public.requests.status (new, analyzing, qualified ;
 *                          quoted et won, anciens gestes, se lisent « Qualifiée ») ;
 *   incomplète             un lien de complétion en attente, ou le volume ou
 *                          une ville qui manque (comme la liste des demandes) ;
 *   rappel demandé         le dernier rappel de la demande (request_events,
 *                          type « rappel ») est « à rappeler » ou « en cours » ;
 *   devis du site          le dernier devis de la demande (public.devis) :
 *                          envoyé, accepté ;
 *   dossier                un dossier du CRM porte la demande (dossiers.request_id).
 *
 * Une demande n'est que dans une colonne : la première règle qui la décrit
 * l'emporte, dans cet ordre — dossier, archivée, perdue, incomplète, devis
 * du site accepté, rappel demandé, devis du site envoyé, en analyse,
 * nouvelle, qualifiée. Les colonnes, elles, suivent l'ordre du parcours.
 *
 * Module pur : le serveur le remplit (donnees.ts), le tableau s'en sert
 * pendant le glisser, et l'action serveur le rejoue.
 */

/** Les colonnes, leur nom, leur sens et leur couleur : la définition commune à tous les tableaux (src/crm/kanban/etapes.ts). */
export type CleEtape = CleEtapeDemande;
export const ETAPES = ETAPES_DEMANDE;
export const NOM_ETAPE = Object.fromEntries(ETAPES.map((e) => [e.cle, e.label])) as Record<CleEtape, string>;

/** Une demande, telle que Demandes la montre (Kanban, Top demandes). */
export type DemandeVue = {
  id: string;
  recueLe: string;
  source: "form" | "email";
  statut: RequestStatus;
  client: string;
  email: string | null;
  telephone: string | null;
  depart: string | null;
  departCp: string | null;
  departAdresse: string | null;
  arrivee: string | null;
  arriveeCp: string | null;
  arriveeAdresse: string | null;
  volume: number | null;
  /** L'estimation du site : seulement pour un parcours qui a un prix. */
  estimation: number | null;
  /** AAAA-MM-JJ. */
  dateSouhaitee: string | null;
  /** La souplesse sur la date (« Ce mois-ci »…), telle que le client l'a donnée. */
  flexibilite: string | null;
  potentiel: number | null;
  difficulte: number | null;
  parcours: Parcours;
  parcoursLabel: string;
  societe: string | null;
  /** Un lien de complétion attend le client. */
  jeton: boolean;
  /** Il manque le volume (quand le parcours en a un) ou une ville, ou un lien de complétion attend. */
  incomplete: boolean;
  /** Le statut du dernier rappel demandé (a_rappeler, en_cours, rappele, injoignable, clos), ou rien. */
  rappel: string | null;
  /** Le statut du dernier devis du site (brouillon, envoye, accepte, refuse, expire), ou rien. */
  devisSite: string | null;
  /** Le dossier né de la demande acceptée, son étape et son commercial. */
  dossier: DossierDeLaDemande | null;
};

export type DossierDeLaDemande = {
  id: number;
  ref: string;
  statut: string;
  /** Archivé : il a quitté le Parcours (l'archivage le garde). */
  archive?: boolean;
  commercialId?: number | null;
  commercial?: string | null;
  initiales?: string | null;
};

const RAPPEL_OUVERT = ["a_rappeler", "en_cours"];

/** La colonne d'une demande : la première règle qui la décrit (voir l'en-tête). */
export function etapeDe(d: Pick<DemandeVue, "statut" | "incomplete" | "rappel" | "devisSite" | "dossier">): CleEtape {
  if (d.dossier) return "dossier";
  if (d.statut === "archived") return "archivee";
  if (d.statut === "lost") return "perdue";
  if (d.incomplete) return "incomplete";
  if (d.devisSite === "accepte") return "accepte";
  if (d.rappel && RAPPEL_OUVERT.includes(d.rappel)) return "rappel";
  if (d.devisSite === "envoye") return "devis";
  if (d.statut === "analyzing") return "analyse";
  if (d.statut === "new") return "nouvelle";
  return "qualifiee";
}

/** Les colonnes qu'un dépôt peut viser, et le statut enregistré qu'il pose. */
const STATUT_DE: Partial<Record<CleEtape, RequestStatus>> = { nouvelle: "new", analyse: "analyzing", qualifiee: "qualified", perdue: "lost", archivee: "archived" };

export type Verdict = { ok: true; statut: RequestStatus } | { ok: false; raison: string };

/**
 * Ce que fait le dépôt d'une carte dans une colonne. Seules les colonnes qui
 * répondent à un statut enregistré (nouvelle, en analyse, qualifiée, perdue,
 * archivée) le changent, et seulement si la carte y arrive vraiment : une
 * demande incomplète, rappelée ou au devis envoyé reste où ses faits la
 * mettent. On ne dépose jamais dans « Dossier » : c'est « Accepter ».
 * Rien quand la carte reste dans sa colonne.
 */
export function verdict(d: DemandeVue, cible: CleEtape): Verdict | null {
  const depuis = etapeDe(d);
  if (cible === depuis) return null;
  if (d.dossier) return { ok: false, raison: "Une demande acceptée suit son dossier : elle ne change plus d'étape ici." };
  if (cible === "dossier") return { ok: false, raison: "Pour en faire un dossier : « Accepter », sur la carte." };
  const statut = STATUT_DE[cible];
  if (!statut) return { ok: false, raison: `« ${NOM_ETAPE[cible]} » se déduit de la demande : on n'y dépose pas une carte.` };
  const apres = etapeDe({ ...d, statut });
  if (apres === cible) return { ok: true, statut };
  if (apres === "incomplete") return { ok: false, raison: "Il manque encore des informations : la demande reste « Incomplète » tant qu'elle n'est pas complétée." };
  if (apres === "rappel") return { ok: false, raison: "Le client attend un rappel : il se traite dans À rappeler." };
  return { ok: false, raison: `Le devis du site est ${d.devisSite === "accepte" ? "accepté" : "envoyé"} : l'étape suit le devis (onglet Devis de la demande).` };
}

/** Une demande encore ouverte : ni acceptée (dossier), ni perdue, ni archivée — la règle des deux ponts (aDecider). */
export const estOuverte = (d: Pick<DemandeVue, "statut" | "dossier">) => aDecider(d);
