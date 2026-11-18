import "server-only";
import { CLES_NON_TRANSPORTEES } from "@/lib/visite/destinations";

/*
 * Le volume du dossier (dossiers.volume), celui du devis, de la fiche et de
 * l'espace client : le volume TRANSPORTÉ de l'inventaire (synthèse de Dragan
 * Plavsic, 18/11/2026). Ce qui est laissé sur place ou pris en charge par le
 * client n'y entre pas ; le débarras et ce qui reste « à confirmer », si (voir
 * lib/visite/destinations.ts). Sans destination hors adresse, c'est la somme
 * de tout l'inventaire, comme avant.
 *
 * Un seul calcul, pour les deux endroits qui le tiennent à jour : la tablette
 * (operations.ts) et la fiche du dossier (crm/actions.ts).
 */

const exclues = CLES_NON_TRANSPORTEES.map((c) => `'${c}'`).join(", ");

/** L'expression SQL du volume transporté d'un dossier ; `parametre` désigne l'identifiant du dossier dans la requête. */
export const volumeTransporteSql = (parametre = "$1") =>
  `coalesce((select sum(quantite * volume) from inventaire where dossier_id = ${parametre} and coalesce(destination_speciale, '') not in (${exclues})), 0)`;
