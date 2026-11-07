"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { libelleSegment, libelleType, type Champs } from "./commun";
import EditeurModele from "./EditeurModele";

/*
 * « Enregistrer comme modèle », dans le bandeau de la fiche dossier : le
 * bouton « Créer un modèle » et sa fenêtre. Le modèle reprend le segment, le type de
 * déménagement, le volume et les options du dossier ; ses observations sont
 * seulement proposées, car elles décrivent souvent le client.
 */
export default function EnregistrerModele({
  dossier,
}: {
  dossier: { id: number; ref: string; type: string; type_demenagement: string; volume: number; vehicule: boolean; garde_meuble: boolean; observations: string | null };
}) {
  const [ouvert, setOuvert] = useState(false);
  const champs: Champs = {
    type: dossier.type,
    type_demenagement: dossier.type_demenagement,
    volume: dossier.volume > 0 ? dossier.volume : null,
    garde_meuble: dossier.garde_meuble,
    vehicule: dossier.vehicule,
  };
  const nom = [libelleSegment(dossier.type), libelleType(dossier.type_demenagement)].filter(Boolean).join(" · ");
  return (
    <>
      {/* Un libellé court : « Enregistrer comme modèle » ferait passer les boutons du bandeau sur deux rangées. */}
      <button type="button" data-ton="contour" onClick={() => setOuvert(true)} title="Enregistrer ce dossier comme modèle">
        Créer un modèle
      </button>
      {/* Dans un portail : la fenêtre ne doit pas hériter des boutons du bandeau, où vit ce bouton. */}
      {ouvert &&
        createPortal(
          <EditeurModele
            ouvert
            confirmer
            brouillon={{ id: null, nom, description: null, champs }}
            sourceDossier={{ id: dossier.id, ref: dossier.ref }}
            observationsDossier={dossier.observations}
            onFermer={() => setOuvert(false)}
          />,
          document.body,
        )}
    </>
  );
}
