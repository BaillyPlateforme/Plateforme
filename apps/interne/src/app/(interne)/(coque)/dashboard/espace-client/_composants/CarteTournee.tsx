"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type PointTournee = { id: string; lat: number; lng: number; ordre: number | null; label: string; creneau: string | null };

/**
 * La carte de la tournée (OpenStreetMap, sans clé) : le dépôt, les arrêts
 * numérotés dans l'ordre de passage, et l'itinéraire qui les relie.
 */
export function CarteTournee({ depot, points }: { depot: { lat: number; lng: number; nom: string }; points: PointTournee[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const cle = JSON.stringify(points);

  useEffect(() => {
    let carte: import("leaflet").Map | null = null;
    let annule = false;
    const liste = JSON.parse(cle) as PointTournee[];
    (async () => {
      const L = (await import("leaflet")).default;
      if (annule || !ref.current) return;
      carte = L.map(ref.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(carte);
      const pastille = (texte: string, fond: string, encre = "#fff") =>
        L.divIcon({
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          html: `<div style="width:32px;height:32px;border-radius:999px;background:${fond};color:${encre};display:grid;place-items:center;font:700 14px system-ui,sans-serif;border:3px solid #fff;box-shadow:0 6px 16px -4px rgba(0,0,0,.45)">${texte}</div>`,
        });
      // Infobulles en texte, jamais en HTML : Leaflet insère une chaîne telle quelle, et un nom saisi par
      // un client (« <img onerror=…> ») s'exécutait au survol, dans la session de l'équipe.
      const texte = (s: string) => Object.assign(document.createElement("span"), { textContent: s });
      L.marker([depot.lat, depot.lng], { icon: pastille("D", "var(--color-nuit)") }).addTo(carte).bindTooltip(texte(depot.nom));
      const ordonnes = [...liste].sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
      for (const p of ordonnes) {
        L.marker([p.lat, p.lng], { icon: p.ordre ? pastille(String(p.ordre), "var(--color-brand)", "var(--color-nuit)") : pastille("?", "#9b98a1") })
          .addTo(carte)
          .bindTooltip(texte(`${p.ordre ? `${p.ordre}. ` : ""}${p.label}${p.creneau ? ` · ${p.creneau}` : ""}`));
      }
      const trace: [number, number][] = [[depot.lat, depot.lng], ...ordonnes.filter((p) => p.ordre).map((p) => [p.lat, p.lng] as [number, number])];
      if (trace.length > 1) L.polyline(trace, { color: "var(--color-nuit)", weight: 3, opacity: 0.8, dashArray: "8 8" }).addTo(carte);
      carte.fitBounds(L.latLngBounds([[depot.lat, depot.lng], ...liste.map((p) => [p.lat, p.lng] as [number, number])]), { padding: [36, 36] });
    })();
    return () => {
      annule = true;
      carte?.remove();
    };
  }, [cle, depot.lat, depot.lng, depot.nom]);

  return <div ref={ref} className="h-[400px] w-full overflow-hidden rounded-xl bg-subtle" role="img" aria-label="Carte de la tournée de livraison des cartons" />;
}
