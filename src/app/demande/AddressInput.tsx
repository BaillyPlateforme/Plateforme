"use client";

import { useEffect, useRef, useState, useId } from "react";
import { Icone } from "./ui";

export type Place = { label: string; ville: string; code_postal: string; context: string; lat: number; lon: number };

// "69, Rhône, Auvergne-Rhône-Alpes" → "69 · Rhône"
function shortContext(ctx: string): string {
  const parts = (ctx ?? "").split(",").map((s) => s.trim());
  return parts.slice(0, 2).join(" · ");
}

// Autocomplétion d'adresses via la Base Adresse Nationale (api-adresse.data.gouv.fr — gratuit, sans clé).
/** Le texte principal d'une suggestion : l'adresse entière, ou la commune. */
function intitule(p: Place, kind: "address" | "municipality") {
  return kind === "municipality" ? p.ville || p.label : p.label || p.ville;
}

/** Exactement ce que la liste montre pour une suggestion, sous forme comparable. */
function affichage(p: Place, kind: "address" | "municipality") {
  return [aplatir(intitule(p, kind)), p.code_postal, aplatir(shortContext(p.context))].join("|");
}

/** Réduit un libellé à sa forme comparable : sans accent, sans ponctuation. */
function aplatir(texte: string) {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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
  const idListe = useId();

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const q = value.trim();
    if (q.length < 2) { setSugg([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      try {
        const typeParam = kind === "municipality" ? "&type=municipality" : "";
        // On demande large et on dédoublonne ensuite : sur un code postal,
        // l'API renvoie la même commune jusqu'à sept fois (une par voie ou par
        // code INSEE), et la liste devenait illisible.
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=12${typeParam}`);
        const j = await r.json();
        const brut: Place[] = (j.features ?? []).map((f: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }) => ({
          label: f.properties.label,
          ville: f.properties.city ?? f.properties.name ?? "",
          code_postal: f.properties.postcode ?? "",
          context: f.properties.context ?? "",
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        }));

        const vues = new Set<string>();
        const places = brut
          .filter((p) => {
            // On dédoublonne sur ce que la liste AFFICHE : deux lignes
            // identiques à l'œil sont un doublon, quoi qu'en dise l'API.
            const cle = affichage(p, kind);
            if (vues.has(cle)) return false;
            vues.add(cle);
            return true;
          })
          .slice(0, 6);

        setSugg(places);
        setActive(0);
        setOpen(places.length > 0 && box.current?.contains(document.activeElement) === true);
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
    <div
      ref={box}
      className="relative"
      // La liste n'a de sens que tant que le champ a la main. Sans cela, passer
      // au champ suivant par la touche Tab laissait la première liste ouverte :
      // deux listes à la fois, l'une sur l'autre.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
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
        // Le champ a sa propre liste de suggestions : celle du navigateur et
        // celles des gestionnaires de mots de passe n'ont rien à y proposer.
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && sugg.length > 0}
        aria-controls={idListe}
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore
        className="champ pl-11"
      />
      <span className="pointer-events-none absolute left-4 top-6 -translate-y-1/2 text-ink-soft">
        <Icone nom="pin" taille={17} />
      </span>
      {open && sugg.length > 0 && (
        <ul id={idListe} role="listbox" className="liste-villes animate-step-in absolute z-50 mt-2 w-full overflow-hidden rounded-[18px] border border-line bg-card p-1.5 shadow-[0_24px_48px_-20px_rgba(27,26,24,0.45)]">
          {sugg.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                // Hors du parcours de la touche Tab : au clavier, la liste se
                // parcourt aux flèches, et Tab passe au champ suivant — sinon
                // il fallait traverser six suggestions pour y arriver.
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-150 ${i === active ? "bg-ink text-shell" : "text-ink"}`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={i === active ? "coche-or shrink-0" : "shrink-0 text-ink-soft"}>
                    <Icone nom="pin" taille={15} />
                  </span>
                  <span className="truncate text-[14px] font-medium">{intitule(p, kind)}</span>
                </span>
                <span className={`shrink-0 text-xs tabular-nums ${i === active ? "opacity-70" : "text-ink-soft"}`}>
                  {/* L'adresse porte déjà son code postal : on ne le répète pas. */}
                  {(kind === "municipality" ? [p.code_postal, shortContext(p.context)] : [shortContext(p.context)])
                    .filter(Boolean)
                    .join(" · ")}
                </span>
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
