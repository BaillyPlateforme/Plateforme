"use client";

import { useState, useTransition } from "react";
import { estimerVolumeVehicule } from "./actions";
import { dimensionsLisibles, lireVolume, type EstimationVehicule, type VehiculeSaisi } from "./commun";
import c from "./cimob.module.css";

/*
 * « Estimer le volume » d'une moto ou d'une voiture (Céline, 17/11/2026 : « le
 * calcul par l'IA est-il possible ? »). Le bouton demande au serveur
 * (estimerVolumeVehicule, cimob/actions.ts) les dimensions usuelles du modèle ;
 * le volume calculé préremplit le champ, qui reste modifiable. Sans réponse
 * exploitable, un message le dit et la saisie à la main reste possible.
 */

export function BoutonEstimer({ vehicule, onEstime, className }: { vehicule: VehiculeSaisi; onEstime: (e: EstimationVehicule) => void; className?: string }) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (vehicule.genre !== "moto" && vehicule.genre !== "voiture") return null;
  const pret = !!vehicule.marque.trim() && !!vehicule.modele.trim();
  return (
    <>
      <button
        type="button"
        className={`${c.estimer} ${className ?? ""}`}
        disabled={enCours || !pret}
        title={pret ? "Les dimensions usuelles du modèle, demandées à l’IA : le volume se calcule et reste modifiable" : "Saisissez d’abord la marque et le modèle"}
        onClick={() =>
          demarrer(async () => {
            setMessage(null);
            try {
              const r = await estimerVolumeVehicule({ genre: vehicule.genre, marque: vehicule.marque, modele: vehicule.modele, motorisation: vehicule.motorisation });
              if (r.ok) onEstime(r.estimation);
              else setMessage(r.message);
            } catch {
              setMessage("Estimation impossible pour le moment. Saisissez le volume à la main.");
            }
          })
        }
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
          <path d="M19 15l.8 1.9L21.7 18l-1.9.8L19 20.7l-.8-1.9-1.9-.8 1.9-1.1z" />
        </svg>
        {enCours ? "Estimation…" : "Estimer le volume"}
      </button>
      {message && (
        <span className={c.refus} role="status">
          {message}
        </span>
      )}
    </>
  );
}

/** Sous le volume : les dimensions retenues, en petit, et la mention qu'il s'agit d'une estimation. */
export function NoteEstimation({ estimation, volume }: { estimation: EstimationVehicule | null; volume: string }) {
  if (!estimation) return null;
  const saisi = lireVolume(volume, 1000);
  const modifie = saisi != null && Math.abs(saisi - estimation.volume) >= 0.05;
  return (
    <small className={c.note} role="status">
      Estimation IA{estimation.reconnu ? ` (${estimation.reconnu})` : ""} : {dimensionsLisibles(estimation)} = {String(estimation.volume).replace(".", ",")} m³
      {modifie ? " · volume modifié à la main" : " · à vérifier, c’est une estimation"}
    </small>
  );
}
