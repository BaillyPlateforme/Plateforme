"use client";

import CarteKanban, { Action, Note } from "@/crm/kanban/Carte";
import { m3 } from "../outils";
import type { Ligne } from "../types";
import { Picto } from "./Picto";

/**
 * Un client du plan, en carte : la carte de tous les tableaux du CRM
 * (src/crm/kanban/Carte), pas une autre. Le nom et la référence de son
 * dossier ; sa destination (pastille et liseré de la couleur du pays) ; sa
 * remarque ; son volume. Rattaché à un dossier du CRM, un clic ouvre le
 * dossier (/dossiers/<id>), et « Fiche » sa fiche dans le plan ; sinon, le
 * clic ouvre la fiche. La poignée sert au glisser-déposer tactile ; à la
 * souris, toute la carte se saisit.
 */
export default function Bulle({
  ligne,
  couleur,
  figee,
  fantome,
  flottante,
  style,
  saisir,
  apresGlisser,
  onOuvrir,
}: {
  ligne: Ligne;
  couleur: string;
  /** Dans une colonne verrouillée : elle ne se déplace plus, mais s'ouvre toujours. */
  figee?: boolean;
  fantome?: boolean;
  flottante?: boolean;
  style?: React.CSSProperties;
  saisir?: (e: React.PointerEvent<HTMLElement>) => void;
  apresGlisser?: () => boolean;
  /** La fiche du client dans le plan. */
  onOuvrir?: () => void;
}) {
  const lieu = [ligne.ville, ligne.pays].filter(Boolean).join(", ");
  return (
    <CarteKanban
      titre={ligne.client}
      reference={ligne.dossierRef}
      referenceTitre="Dossier du CRM rattaché"
      href={ligne.dossierId ? `/dossiers/${ligne.dossierId}` : null}
      ouvrir={ligne.dossierId ? undefined : onOuvrir}
      libelle={`${ligne.client}, ${lieu || "destination à préciser"}, ${m3(ligne.volume)}${figee ? ", colonne verrouillée" : ""}. ${ligne.dossierId ? "Ouvrir le dossier" : "Ouvrir la fiche"}`}
      lieu={lieu || null}
      contenu={ligne.remarques ? <Note ton="ambre">{ligne.remarques}</Note> : undefined}
      puces={[{ genre: "volume", valeur: ligne.volume }]}
      // Rattachée, un clic ouvre le dossier : la fiche du plan garde son bouton. Sinon, le clic l'ouvre déjà.
      actions={
        onOuvrir && ligne.dossierId && !flottante ? (
          <Action onClick={onOuvrir} title="La fiche de ce client dans le plan : volume, colonne, dossier, remarques">
            <Picto nom="crayon" taille={13} />
            Fiche
          </Action>
        ) : undefined
      }
      accent={couleur}
      lisere
      ligne={ligne.id}
      saisir={figee ? undefined : saisir}
      apresGlisser={apresGlisser}
      figee={figee}
      fantome={fantome}
      flottante={flottante}
      style={style}
    />
  );
}
