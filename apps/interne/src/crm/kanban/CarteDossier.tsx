"use client";

import { TYPES } from "@/crm/lib/format";
import CarteKanban, { jourCourt, type Signal } from "./Carte";
import type { Carte } from "./donnees";
import { etapeDossier, TEINTES } from "./etapes";
import { RELANCE_JOURS, ville } from "./regles";

/*
 * Un dossier, en carte (Carte.tsx) : dans le Tableau du Parcours, et, avec
 * le contenu de sa relance, dans le Kanban des relances. Un clic ouvre sa
 * page, /dossiers/<id>, qui porte son parcours.
 *
 * Ses puces : le montant (le devis signé, point vert ; sinon le dernier
 * envoyé), le volume, la date de chargement (ou la période souhaitée), le
 * type de client. Son pied : le commercial ; un devis qui attend sa réponse
 * depuis plus de RELANCE_JOURS jours ; venu du site ; espace client ouvert.
 */

/** Ce qu'un tableau ajoute à la carte d'un dossier. */
export type ExtraDossier = {
  /** Le contenu propre au tableau (une relance). */
  contenu?: React.ReactNode;
  /** Les signaux du tableau, à la place de ceux du dossier. */
  signaux?: Signal[];
  actions?: React.ReactNode;
  id?: string;
};

export function signauxDossier(c: Carte): Signal[] {
  const s: Signal[] = [];
  if (c.attente != null && c.attente >= RELANCE_JOURS) s.push({ texte: `Devis sans réponse · ${c.attente} j`, teinte: "ambre", icone: "horloge", titre: `Devis envoyé sans réponse depuis ${c.attente} jours` });
  if (c.site) s.push({ teinte: "lilas", icone: "globe", titre: "Venu d'une demande du site" });
  if (c.espace) s.push({ teinte: "vert", icone: "equipe", titre: "Espace client ouvert" });
  return s;
}

export default function CarteDossier({
  carte: c,
  extra,
  ligne,
  saisir,
  apresGlisser,
  fantome,
  flottante,
  arrivee,
  style,
}: {
  carte: Carte;
  extra?: ExtraDossier;
  ligne?: number;
  saisir?: (e: React.PointerEvent<HTMLElement>) => void;
  apresGlisser?: () => boolean;
  fantome?: boolean;
  flottante?: boolean;
  arrivee?: boolean;
  style?: React.CSSProperties;
}) {
  const date = c.dateChargement ? jourCourt(c.dateChargement) : c.periode;
  return (
    <CarteKanban
      id={extra?.id}
      titre={c.client}
      reference={c.ref}
      href={`/dossiers/${c.id}`}
      libelle={`${c.client}, dossier ${c.ref}. Ouvrir le dossier`}
      trajet={{ depart: ville(c.depart), arrivee: ville(c.arrivee) }}
      contenu={extra?.contenu}
      puces={[
        { genre: "montant", valeur: c.montant, signe: c.signe, titre: c.signe ? "Devis signé" : "Dernier devis envoyé" },
        { genre: "volume", valeur: c.volume },
        { genre: "date", texte: date, titre: c.dateChargement ? "Date de chargement" : "Période souhaitée" },
        { genre: "segment", texte: TYPES[c.segment] ?? c.segment, segment: c.segment },
      ]}
      responsable={{ id: c.commercialId, nom: c.commercial, initiales: c.initiales }}
      signaux={extra?.signaux ?? signauxDossier(c)}
      actions={extra?.actions}
      // Tenue hors de sa colonne, elle garde la couleur de son étape.
      accent={flottante ? TEINTES[etapeDossier(c.statut).teinte] : undefined}
      ligne={ligne}
      saisir={saisir}
      apresGlisser={apresGlisser}
      fantome={fantome}
      flottante={flottante}
      arrivee={arrivee}
      style={style}
    />
  );
}
