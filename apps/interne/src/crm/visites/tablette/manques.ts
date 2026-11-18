import { choixDe, type Destination } from "@/lib/visite/destinations";
import { GENRE_ETAPE, type EtapeAcces } from "@/lib/visite/regles";
import type { EtatSaisie } from "./etat";

/*
 * Les informations manquantes, montrées avant le compte-rendu (synthèse de
 * Dragan Plavsic, 18/11/2026 : « identifier les informations manquantes avant
 * la transmission du dossier à l'exploitation »). Une PROPOSITION, à valider
 * avec Céline et Dragan : ce sont des rappels, jamais un blocage — le
 * commercial complète, ou continue.
 *
 * - Adresses et accès : une étape sans adresse, une adresse sans aucun accès
 *   renseigné, sinon sans étage ou sans stationnement ; aucune livraison ni
 *   garde-meuble au trajet.
 * - Inventaire : aucune pièce ; une pièce sans objet, sans photo ; une ligne
 *   à volume nul (« à mesurer »), sauf une protection, hors cubage.
 * - Destinations : une ligne « À confirmer », une ligne sans destination.
 * - Options : la formule envisagée non choisie.
 *
 * Fonction pure.
 */

export type VueManque = { genre: "piece"; cle: string } | { genre: "acces" } | { genre: "destinations" } | { genre: "options" } | { genre: "nouvelle-piece" };
export interface Manque {
  texte: string;
  vue: VueManque;
}
export interface GroupeManques {
  titre: string;
  manques: Manque[];
}

const RDC = /^(rdc|0|rez)/i;

/** Rien n'est renseigné des accès de cette adresse. */
const accesVides = (e: EtapeAcces) =>
  !e.etage?.trim() && !e.escalier && e.portage_m == null && !e.stationnement && !e.poids_lourd && !e.monte_meuble && !e.monte_charge && !e.transbordement && !e.acces?.trim() && !e.ascenseur;

export function informationsManquantes(etat: EtatSaisie, destinations: Destination[], photos: (piece: string) => number): GroupeManques[] {
  const acces: Manque[] = [];
  const versAcces: VueManque = { genre: "acces" };
  if (destinations.length === 0) acces.push({ texte: "Aucune livraison ni garde-meuble au trajet : à renseigner dans la fiche du CRM", vue: versAcces });
  for (const e of etat.etapes) {
    const genre = GENRE_ETAPE[e.genre] ?? "Étape";
    if (!e.adresse?.trim()) {
      acces.push({ texte: `${genre} : adresse à préciser dans la fiche du CRM`, vue: versAcces });
      continue;
    }
    const nom = `${genre} (${e.adresse.trim()})`;
    if (accesVides(e)) acces.push({ texte: `${nom} : accès non renseignés`, vue: versAcces });
    else {
      if (!e.etage?.trim()) acces.push({ texte: `${nom} : étage non renseigné`, vue: versAcces });
      else if (!RDC.test(e.etage.trim()) && !e.ascenseur && !e.escalier) acces.push({ texte: `${nom} : escalier non renseigné`, vue: versAcces });
      if (!e.stationnement) acces.push({ texte: `${nom} : stationnement non renseigné`, vue: versAcces });
    }
  }

  const inventaire: Manque[] = [];
  const dest: Manque[] = [];
  if (etat.pieces.length === 0) inventaire.push({ texte: "Aucune pièce relevée", vue: { genre: "nouvelle-piece" } });
  for (const p of etat.pieces) {
    const vue: VueManque = { genre: "piece", cle: p.cle };
    const objets = etat.objets.filter((o) => o.piece === p.cle);
    if (objets.length === 0) inventaire.push({ texte: `« ${p.nom} » : aucun objet`, vue });
    if (photos(p.cle) === 0) inventaire.push({ texte: `« ${p.nom} » : aucune photo`, vue });
    for (const o of objets) {
      const qui = `« ${p.nom} » : ${o.quantite > 1 ? `${o.quantite} × ` : ""}${o.libelle}`;
      if (!o.horsCubage && !(o.volume > 0)) inventaire.push({ texte: `${qui} — volume à saisir`, vue });
      if (o.speciale === "a_confirmer") dest.push({ texte: `${qui} — destination à confirmer`, vue });
      else if (choixDe(o, destinations) == null && !o.destinationLibre?.trim()) dest.push({ texte: `${qui} — sans destination`, vue });
    }
  }

  const options: Manque[] = etat.formule ? [] : [{ texte: "Formule envisagée non choisie", vue: { genre: "options" } }];

  return [
    { titre: "Adresses et accès", manques: acces },
    { titre: "Inventaire", manques: inventaire },
    { titre: "Destinations", manques: dest },
    { titre: "Options", manques: options },
  ].filter((g) => g.manques.length > 0);
}
