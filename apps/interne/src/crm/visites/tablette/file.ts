import { estSpeciale, libelleSpeciale } from "@/lib/visite/destinations";
import { m3, type Operation } from "@/lib/visite/regles";
import { appliquerOp, enfiler, type EtatSaisie } from "./etat";

/*
 * La file des opérations de la tablette, quand le réseau manque (retours de
 * Céline, 16/11/2026 : « il faut que l'on puisse travailler en hors connexion
 * pour la visite technique chez le client »). Fonctions pures : le crochet
 * useEnregistrement les assemble, les tests les vérifient une à une.
 *
 * - L'ordre : la file part par lots, du plus ancien geste au plus récent ; un
 *   lot qui n'a pas abouti repart en tête, avant les gestes faits entre-temps.
 * - Sans doublon : chaque opération désigne son objet par une clé tirée sur
 *   la tablette, le serveur l'applique en « insérer ou remplacer » ; un lot
 *   reçu deux fois (réponse perdue, renvoi au retour du réseau) ne fait rien
 *   de plus qu'une fois. En attente, la dernière valeur d'un objet remplace
 *   la précédente, à sa place (etat.ts, enfiler).
 * - Les conflits : voir `issueEnvoi`.
 */

/** Les clés du stockage de la tablette (localStorage) pour une visite : la file, la vue gardée, ce qui n'a pas pu entrer. */
export const cleFile = (visiteId: number) => `bailly-visite-${visiteId}-file`;
export const cleInstantane = (visiteId: number) => `bailly-visite-${visiteId}-instantane`;
export const cleNonEnregistrees = (visiteId: number) => `bailly-visite-${visiteId}-non-enregistrees`;

/** Un lot au plus de cette taille : le serveur en accepte 200, une longue saisie hors connexion en compte davantage. */
export const TAILLE_LOT = 100;

/** Le prochain lot à envoyer, et ce qui reste. Après un lot refusé comme illisible, les opérations partent une à une. */
export function prochainLot(file: Operation[], unParUn = false): [Operation[], Operation[]] {
  const n = Math.min(file.length, unParUn ? 1 : TAILLE_LOT);
  return [file.slice(0, n), file.slice(n)];
}

/** Un lot qui n'a pas abouti repart en tête de file ; un geste fait entre-temps sur le même objet l'emporte, à sa place. */
export function remettreEnTete(lot: Operation[], attente: Operation[]): Operation[] {
  let file = lot;
  for (const op of attente) file = enfiler(file, op);
  return file;
}

/**
 * Ce que la tablette fait de la réponse du serveur :
 * - ok : le lot est enregistré, on passe au suivant ;
 * - fige (409, 404) : le compte-rendu a été signé ailleurs, ou la visite
 *   abandonnée. Rien ne force la porte (le déclencheur crm.visite_figee le
 *   refuserait) : les modifications restent sur la tablette, montrées au
 *   commercial, qui les transmet au bureau. Elles ne sont jamais effacées
 *   sans qu'il le demande ;
 * - session (401) : la file attend la reconnexion, puis repart ;
 * - illisible (400) : une opération que le serveur refuse ; le lot repart
 *   opération par opération pour isoler la fautive, mise de côté et
 *   montrée, sans bloquer les autres ;
 * - reseau (pas de réponse) et serveur (5xx) : on garde tout, on réessaie.
 *
 * Un même objet modifié au bureau et sur la tablette : la dernière arrivée au
 * serveur l'emporte, donc celle de la tablette quand elle retrouve le réseau
 * (le commercial est sur place). Un objet supprimé au bureau puis modifié sur
 * la tablette revient. Un objet d'une pièce supprimée entre-temps ne revient
 * pas (le serveur l'ignore).
 */
export type Issue = "ok" | "fige" | "session" | "illisible" | "reseau" | "serveur";

export function issueEnvoi(statut: number | null): Issue {
  if (statut == null || statut === 0) return "reseau";
  if (statut >= 200 && statut < 300) return "ok";
  if (statut === 409 || statut === 404) return "fige";
  if (statut === 401 || statut === 403) return "session";
  if (statut === 400 || statut === 413 || statut === 422) return "illisible";
  return "serveur";
}

/** Une opération en une ligne, pour le commercial : ce qui n'a pas pu être enregistré. */
export function decrireOperation(op: Operation, etat: Pick<EtatSaisie, "pieces" | "objets" | "etapes">): string {
  const piece = (cle: string) => etat.pieces.find((p) => p.cle === cle)?.nom ?? "pièce";
  switch (op.t) {
    case "piece":
      return `Pièce « ${op.nom} »${op.remarque ? ` : ${op.remarque}` : ""}`;
    case "piece-":
      return `Pièce retirée : ${piece(op.cle)}`;
    case "objet":
      return `${piece(op.piece)} : ${op.quantite > 1 ? `${op.quantite} × ` : ""}${op.libelle} (${m3(op.quantite * op.volume)})${estSpeciale(op.speciale) ? ` → ${libelleSpeciale(op.speciale)}` : ""}`;
    case "objet-": {
      const o = etat.objets.find((x) => x.cle === op.cle);
      return `Objet retiré${o ? ` : ${o.libelle}` : ""}`;
    }
    case "visite":
      return [
        op.remarques !== undefined ? `Remarques : ${op.remarques ?? "(vides)"}` : null,
        op.formule !== undefined ? `Formule : ${op.formule ?? "aucune"}` : null,
        op.options !== undefined ? `Prestations proposées : ${op.options.filter((o) => o.proposee).map((o) => o.libelle).join(", ") || "aucune"}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "etape": {
      const i = etat.etapes.findIndex((e) => e.id === op.id);
      return `Accès de l'adresse ${i >= 0 ? i + 1 : ""}${etat.etapes[i]?.adresse ? ` (${etat.etapes[i].adresse})` : ""}`.trim();
    }
  }
}

// --- L'instantané : la dernière vue de la saisie, gardée sur la tablette -----------------------------

/**
 * Ce que la tablette garde d'une visite ouverte : l'état tel qu'il est à
 * l'écran (les gestes en attente compris), l'heure du dernier enregistrement
 * confirmé par le serveur, et qui tenait la tablette.
 */
export interface Instantane<E = unknown> {
  v: 1;
  etat: EtatSaisie;
  /** L'heure du serveur (visites.maj_le) au dernier lot confirmé, ou à l'ouverture. */
  majLe: string | null;
  /** L'heure de la tablette à la dernière écriture. */
  le: number;
  utilisateur: number | null;
  /** De quoi rouvrir la visite sans réseau (en-tête, destinations…). */
  entete?: E;
}

/** Une visite gardée plus longtemps que cela sans être rouverte, et sans rien en attente, est oubliée. */
export const DUREE_INSTANTANE_MS = 3 * 24 * 3600_000;

/**
 * L'état de départ de la saisie, à l'ouverture de la page.
 *
 * - D'ordinaire, la page vient du serveur, à jour : les gestes restés en file
 *   sur la tablette sont rejoués par-dessus.
 * - Si la page est plus ancienne que ce que la tablette savait déjà (page
 *   servie hors connexion, ou restaurée), la vue gardée sur la tablette
 *   l'emporte : elle contient déjà les gestes envoyés depuis, et ceux en file.
 *
 * Rend aussi l'origine, pour le dire à l'écran.
 */
export function etatDeDepart(
  serveur: EtatSaisie,
  majServeur: string | null,
  inst: Pick<Instantane, "etat" | "majLe"> | null,
  restes: Operation[],
): { etat: EtatSaisie; origine: "serveur" | "tablette" } {
  const plusRecente = !!inst && !!inst.majLe && (!majServeur || Date.parse(inst.majLe) > Date.parse(majServeur));
  if (plusRecente) return { etat: inst!.etat, origine: "tablette" };
  return { etat: restes.reduce(appliquerOp, serveur), origine: "serveur" };
}
