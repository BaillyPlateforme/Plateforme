"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

type Pt = { lat: number; lon: number };

async function geocode(q: string): Promise<Pt | null> {
  if (!q) return null;
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&type=municipality`);
    const j = await r.json();
    const f = j?.features?.[0];
    if (!f) return null;
    return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
  } catch {
    return null;
  }
}

async function routeGeo(a: Pt, b: Pt): Promise<[number, number][] | null> {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`);
    const j = await r.json();
    const coords = j?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (!coords) return null;
    return coords.map(([lon, lat]) => [lat, lon]);
  } catch {
    return null;
  }
}

// Carte du trajet départ → arrivée (OpenStreetMap, sans clé).
export default function TrajetMap({
  departVille,
  arriveeVille,
  departCoord,
  arriveeCoord,
  height = 380,
  distanceKm,
}: {
  departVille: string | null;
  arriveeVille: string | null;
  departCoord?: Pt | null;
  arriveeCoord?: Pt | null;
  height?: number;
  distanceKm?: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [km, setKm] = useState<number | null>(distanceKm ?? null);
  // Départ et arrivée au même endroit : on n'affiche ni trajet ni distance.
  const [proche, setProche] = useState(false);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let done = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const a = departCoord ?? (await geocode(departVille ?? ""));
      const b = arriveeCoord ?? (await geocode(arriveeVille ?? ""));
      if (done || !ref.current) return;
      if (!a || !b) { setStatus("error"); return; }

      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);

      const or = "#a98a00";
      const noir = "#1b1a18";

      // Déménagement dans la même commune : sans adresse précise, les deux
      // points tombent au même endroit — le centre de la commune. Tracer une
      // ligne de longueur nulle et annoncer « 0 km » n'avait aucun sens : on
      // montre la commune, et on le dit.
      const memeLieu = distanceVol(a, b) < 0.6;
      if (memeLieu) {
        setProche(true);
        L.circleMarker([a.lat, a.lon], { radius: 9, color: "#fff", weight: 2, fillColor: noir, fillOpacity: 1 })
          .addTo(map)
          .bindTooltip(departVille ?? "");
        L.circle([a.lat, a.lon], { radius: 1200, color: noir, weight: 1, opacity: 0.35, fillColor: or, fillOpacity: 0.12 }).addTo(map);
        map.setView([a.lat, a.lon], 13);
        setStatus("ok");
        return;
      }

      L.circleMarker([a.lat, a.lon], { radius: 8, color: "#fff", weight: 2, fillColor: or, fillOpacity: 1 }).addTo(map).bindTooltip(`Départ · ${departVille ?? ""}`);
      L.circleMarker([b.lat, b.lon], { radius: 8, color: "#fff", weight: 2, fillColor: noir, fillOpacity: 1 }).addTo(map).bindTooltip(`Arrivée · ${arriveeVille ?? ""}`);

      const geo = await routeGeo(a, b);
      const line = L.polyline(geo ?? [[a.lat, a.lon], [b.lat, b.lon]], { color: noir, weight: 4, opacity: 0.85 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
      if (km == null) {
        try {
          const rr = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
          const jj = await rr.json();
          const m = jj?.routes?.[0]?.distance;
          if (typeof m === "number") setKm(Math.round(m / 1000));
        } catch { /* ignore */ }
      }
      setStatus("ok");
    })();
    return () => { done = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departVille, arriveeVille]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line" style={{ height }}>
      <div ref={ref} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-subtle/60 text-sm text-ink-soft">Chargement de la carte…</div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-subtle/60 px-4 text-center text-sm text-ink-soft">
          Trajet non localisable ({departVille ?? "?"} → {arriveeVille ?? "?"}).
        </div>
      )}
      {status === "ok" && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-xl border border-line bg-card/95 px-3 py-1.5 text-xs shadow-sm">
          {proche ? (
            <>
              <span className="font-medium">{departVille ?? "?"}</span>
              <span className="ml-1.5 text-ink-soft">· déménagement dans la même commune</span>
            </>
          ) : (
            <>
              <span className="font-medium">{departVille ?? "?"}</span> → <span className="font-medium">{arriveeVille ?? "?"}</span>
              {km != null && <span className="ml-1.5 text-ink-soft">· {km} km</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Distance à vol d'oiseau, en kilomètres. Sert à repérer deux points confondus. */
function distanceVol(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
