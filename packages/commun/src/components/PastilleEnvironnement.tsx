"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

/*
 * La pastille « DEV » à côté du logo : on sait d'un coup d'œil qu'on n'est
 * pas en production. Elle se règle sur l'adresse du site, sans variable :
 *   - interne-dev.…, externe-dev.…, tout nom en « -dev » ou « dev. » → DEV ;
 *   - localhost, 127.0.0.1 → LOCAL ;
 *   - partout ailleurs (la production) : rien.
 * Rendue après l'hydratation (le serveur ne connaît pas l'adresse vue par le
 * navigateur) : jamais d'écart entre le serveur et le navigateur.
 */

export function environnementDeLAdresse(hote: string): "DEV" | "LOCAL" | null {
  const h = hote.toLowerCase();
  if (h === "localhost" || h.startsWith("127.") || h === "[::1]" || h.endsWith(".localhost")) return "LOCAL";
  if (/(^|[.-])dev([.-]|$)/.test(h)) return "DEV";
  return null;
}

const rien = () => () => {};

export function PastilleEnvironnement({ style }: { style?: CSSProperties }) {
  const env = useSyncExternalStore(rien, () => environnementDeLAdresse(window.location.hostname), () => null);
  if (!env) return null;
  return (
    <span
      title={env === "DEV" ? "Environnement de développement : données et envois d'essai" : "Poste de développement"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        height: 20,
        padding: "0 8px",
        marginLeft: 8,
        borderRadius: 999,
        background: env === "DEV" ? "#ff5a1f" : "#5b5f6b",
        color: "#fff",
        font: "800 10.5px/1 system-ui, -apple-system, 'Segoe UI', sans-serif",
        letterSpacing: "0.08em",
        verticalAlign: "middle",
        boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.35)",
        ...style,
      }}
    >
      {env}
    </span>
  );
}
