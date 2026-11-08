import type { NomIcone } from "@/ui/icones";
import type { Araignee } from "./araignee";
import type { CleEtape, DemandeVue } from "./etapes";

/*
 * La liste et le panneau de Demandes (Top demandes, Feed), côté navigateur :
 * ce que le serveur leur passe. Module pur.
 */

/** Un événement d'une demande, dans « Dernières activités » du panneau (lu par le Feed). */
export type Activite = { cle: string; texte: string; jour: string; heure: string | null; acteur: string; icone: NomIcone; ton: string };

/** La dernière chose arrivée à une demande, sur sa ligne du Feed. */
export type Derniere = { texte: string; ilYa: string };

/** Une ligne de la liste : la demande, son araignée, son étape, et (Feed) son jour de réception et sa dernière activité. */
export type LigneDemande = {
  demande: DemandeVue;
  araignee: Araignee;
  etape: CleEtape;
  derniere: Derniere | null;
  /** Le jour de réception, à Paris : « Aujourd'hui », « Hier », « Jeudi 5 novembre » (et la date en toutes lettres sous les deux premiers). */
  jour: { cle: string; libelle: string; sous: string | null } | null;
};

/** L'ordre de la liste : par potentiel (Top demandes) ou par date de réception (Feed). */
export type Tri = "potentiel" | "historique";
