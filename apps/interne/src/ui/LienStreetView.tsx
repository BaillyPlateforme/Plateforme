"use client";

import { useRef, useState } from "react";
import s from "./lien-street-view.module.css";

/*
 * Le bouton « Street View » à côté d'une adresse du dossier (retours de
 * Céline, 16/11/2026 : « un bouton à côté de l'adresse pour que ça se
 * connecte directement à Google Maps Street View »).
 *
 * Un simple lien vers Google Maps, dans un nouvel onglet, sans clé d'API.
 * Street View s'ouvre sur un point (latitude, longitude) : l'adresse est
 * située par la Base Adresse (/api/adresses, la même que les champs
 * d'adresse) dès que la souris ou le doigt approche du bouton. Tant qu'elle ne
 * l'est pas — ou si elle reste introuvable —, le lien ouvre l'adresse dans
 * Google Maps, d'où Street View est à un clic.
 */

export const lienCarte = (adresse: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
export const lienPanorama = (lat: number, lon: number) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}`;

export default function LienStreetView({ adresse, ton = "doux", court = false }: { adresse: string | null | undefined; ton?: "doux" | "bandeau"; court?: boolean }) {
  const texte = (adresse ?? "").replace(/\s+/g, " ").trim();
  const [panorama, setPanorama] = useState<string | null>(null);
  const demande = useRef(false);
  if (texte.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return null;

  const situer = async () => {
    if (demande.current) return;
    demande.current = true;
    try {
      const r = await fetch(`/api/adresses?q=${encodeURIComponent(texte.slice(0, 200))}`);
      const j = (await r.json()) as { suggestions?: { lat: number | null; lon: number | null }[] };
      const p = j.suggestions?.[0];
      if (p && typeof p.lat === "number" && typeof p.lon === "number") setPanorama(lienPanorama(p.lat, p.lon));
    } catch {
      // Le lien vers la carte reste : Street View y est à un clic.
      demande.current = false;
    }
  };

  return (
    <a
      href={panorama ?? lienCarte(texte)}
      target="_blank"
      rel="noopener"
      className={s.lien}
      data-ton={ton}
      onPointerEnter={situer}
      onFocus={situer}
      title={`Voir « ${texte} » dans Google Maps Street View (nouvel onglet)`}
      aria-label={`Street View : ${texte} (nouvel onglet)`}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="5" r="2.4" />
        <path d="M9.5 21v-6.5H8V10a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4.5h-1.5V21" />
      </svg>
      {!court && <span>Street View</span>}
    </a>
  );
}
