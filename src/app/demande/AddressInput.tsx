"use client";

import { useEffect, useRef, useState } from "react";

export type Place = { label: string; ville: string; code_postal: string; lat: number; lon: number };

// Autocomplétion d'adresses via la Base Adresse Nationale (api-adresse.data.gouv.fr — gratuit, sans clé).
export function AddressInput({
  value,
  onChange,
  onSelect,
  placeholder,
  kind = "municipality",
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: Place) => void;
  placeholder?: string;
  kind?: "municipality" | "address";
}) {
  const [sugg, setSugg] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const q = value.trim();
    if (q.length < 2) { setSugg([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      try {
        const typeParam = kind === "municipality" ? "&type=municipality" : "";
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5${typeParam}`);
        const j = await r.json();
        const places: Place[] = (j.features ?? []).map((f: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }) => ({
          label: f.properties.label,
          ville: f.properties.city ?? f.properties.name ?? "",
          code_postal: f.properties.postcode ?? "",
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        }));
        setSugg(places);
        setActive(0);
        setOpen(places.length > 0);
      } catch { setSugg([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [value, kind]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const choose = (p: Place) => {
    skip.current = true;
    onChange(kind === "municipality" ? p.ville : p.label);
    onSelect(p);
    setOpen(false);
    setSugg([]);
  };

  return (
    <div ref={box} className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => sugg.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(sugg.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && sugg[active]) { e.preventDefault(); choose(sugg[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {open && sugg.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow-md)]">
          {sugg.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                className={`block w-full px-3 py-2 text-left text-sm transition ${i === active ? "bg-accent-soft text-accent-dark" : "hover:bg-subtle"}`}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)));
}

// Distance routière (OSRM public) avec repli à vol d'oiseau.
export async function roadDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): Promise<number> {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
    const j = await r.json();
    const m = j?.routes?.[0]?.distance;
    if (typeof m === "number" && m > 0) return Math.round(m / 1000);
  } catch { /* repli */ }
  return haversineKm(a, b);
}
