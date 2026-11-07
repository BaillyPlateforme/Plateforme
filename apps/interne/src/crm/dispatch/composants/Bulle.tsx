"use client";

import { m3 } from "../outils";
import type { Ligne } from "../types";
import { Picto } from "./Picto";
import s from "./dispatch.module.css";

/**
 * Un client du plan, en bulle : nom, destination (pastille de la couleur du
 * pays), volume, remarques, dossier rattaché. La poignée à gauche sert au
 * glisser-déposer tactile ; à la souris, toute la bulle se saisit.
 */
export default function Bulle({
  ligne,
  couleur,
  figee,
  fantome,
  flottante,
  style,
  onPointerDown,
  onOuvrir,
}: {
  ligne: Ligne;
  couleur: string;
  /** Dans une colonne verrouillée : elle ne se déplace plus, mais s'ouvre toujours. */
  figee?: boolean;
  fantome?: boolean;
  flottante?: boolean;
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onOuvrir?: () => void;
}) {
  const classes = [s.bulle, figee && s.figee, fantome && s.fantome, flottante && s.flottante].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      style={{ ...style, ["--c" as string]: couleur }}
      data-ligne={flottante ? undefined : ligne.id}
      role={flottante ? undefined : "button"}
      tabIndex={flottante ? -1 : 0}
      aria-label={flottante ? undefined : `${ligne.client}, ${[ligne.ville, ligne.pays].filter(Boolean).join(", ")}, ${m3(ligne.volume)}${figee ? ", colonne verrouillée" : ""}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOuvrir?.();
        }
      }}
    >
      <span className={s.prise} data-prise="" title={figee ? "Colonne verrouillée" : "Glisser pour déplacer"}>
        <Picto nom={figee ? "cadenas" : "prise"} taille={figee ? 12 : 14} />
      </span>
      <span className={s.nom}>{ligne.client}</span>
      <span className={s.volume}>{m3(ligne.volume)}</span>
      <span className={s.lieu}>
        <i />
        {[ligne.ville, ligne.pays].filter(Boolean).join(", ") || "Destination à préciser"}
      </span>
      {ligne.remarques && <span className={s.remarque}>{ligne.remarques}</span>}
      {ligne.dossierRef && (
        <span className={s.etiquettes}>
          <span className={s.etiquette} title="Dossier du CRM rattaché">
            <Picto nom="lien" taille={11} />
            {ligne.dossierRef}
          </span>
        </span>
      )}
    </div>
  );
}
