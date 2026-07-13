"use client";

import { useState } from "react";

export type Slice = { label: string; value: number; color: string };

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const oS = polar(cx, cy, rO, a0);
  const oE = polar(cx, cy, rO, a1);
  const iE = polar(cx, cy, rI, a1);
  const iS = polar(cx, cy, rI, a0);
  return `M ${oS.x} ${oS.y} A ${rO} ${rO} 0 ${large} 1 ${oE.x} ${oE.y} L ${iE.x} ${iE.y} A ${rI} ${rI} 0 ${large} 0 ${iS.x} ${iS.y} Z`;
}

// Camembert (donut) — data ordonnée, rampe séquentielle sauge.
export function Donut({
  data,
  centerLabel,
  size = 200,
}: {
  data: Slice[];
  centerLabel?: string;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const rO = size / 2 - 4;
  const rI = rO * 0.62;
  const gap = 1.4; // degrés de séparation entre segments

  let angle = 0;
  const segs = data.map((d) => {
    const frac = total > 0 ? d.value / total : 0;
    const a0 = angle + gap / 2;
    const a1 = angle + frac * 360 - gap / 2;
    angle += frac * 360;
    return { ...d, a0: Math.max(a0, angle - frac * 360), a1 };
  });

  const active = hover != null ? segs[hover] : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {total === 0 && (
          <circle cx={cx} cy={cy} r={(rO + rI) / 2} fill="none" stroke="var(--color-line)" strokeWidth={rO - rI} />
        )}
        {segs.map((s, i) =>
          s.a1 > s.a0 ? (
            <path
              key={i}
              d={arc(cx, cy, rO, rI, s.a0, s.a1)}
              fill={s.color}
              opacity={hover == null || hover === i ? 1 : 0.35}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: "opacity 0.15s" }}
            />
          ) : null,
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-ink font-serif" style={{ fontSize: 26 }}>
          {active ? active.value : total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[var(--color-ink-soft)]" style={{ fontSize: 11 }}>
          {active ? active.label : centerLabel ?? "total"}
        </text>
      </svg>

      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li
              key={i}
              className="flex items-center gap-2.5"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className={`flex-1 truncate ${hover === i ? "text-ink" : "text-ink-soft"}`}>{d.label}</span>
              <span className="tabular-nums text-ink">{d.value}</span>
              <span className="w-9 text-right tabular-nums text-ink-soft">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Barres horizontales — comparaison de magnitude entre catégories.
export function BarList({ data, unit }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-ink-soft">Pas de données.</p>;
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 shrink-0 truncate text-sm text-ink-soft">{d.label}</div>
          <div className="h-6 flex-1 overflow-hidden rounded-md bg-subtle">
            <div
              className="h-full rounded-md"
              style={{ width: `${(d.value / max) * 100}%`, background: "var(--color-accent)" }}
            />
          </div>
          <div className="w-16 text-right text-sm tabular-nums">
            {d.value}
            {unit ? ` ${unit}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
