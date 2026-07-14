"use client";

import { useEffect, useId, useRef, useState } from "react";

export type Slice = { label: string; value: number; color: string };

// Compteur animé (esprit Redion).
export function CountUp({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 900, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(a + (b - a) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return (
    <span className="tnum">
      {prefix}
      {display.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

function Delta({ value }: { value: number }) {
  if (!isFinite(value) || value === 0) return null;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${up ? "bg-good/12 text-good" : "bg-warn/12 text-warn"}`}>
      {up ? "↑" : "↓"} {Math.abs(value)}%
    </span>
  );
}

// Sparkline (aire) pour les cartes KPI.
export function Sparkline({ data, color = "var(--color-accent)", height = 34 }: { data: number[]; color?: string; height?: number }) {
  const gid = useId();
  const w = 140;
  const h = height;
  if (data.length < 2) return null;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * w, y: h - ((v - min) / span) * (h - 3) - 1.5 }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Carte KPI façon Redion : barre d'accent latérale + compteur animé + sous-texte / sparkline.
export function KpiCard({
  label, value, decimals = 0, prefix = "", suffix = "", sub, series, delta, color = "var(--color-accent)",
}: {
  label: string; value: number; decimals?: number; prefix?: string; suffix?: string;
  sub?: string; series?: number[]; delta?: number; color?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5">
      <div className="absolute left-0 top-5 h-8 w-1 rounded-r-full" style={{ background: color }} />
      <div className="pl-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</div>
          {delta != null && <Delta value={delta} />}
        </div>
        <div className="mt-2 font-serif text-[30px] font-bold leading-none text-ink">
          <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
        </div>
        {sub && <div className="mt-2 truncate text-[11px] text-ink-soft">{sub}</div>}
        {series && series.length > 1 && (
          <div className="mt-3">
            <Sparkline data={series} color={color} />
          </div>
        )}
      </div>
    </div>
  );
}

// Chemin lissé (Catmull-Rom → Bézier cubique).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export type Series = { name: string; color: string; data: number[] };

// Courbe d'aire multi-séries lissée (façon Redion "Volume & tri dans le temps").
export function MultiAreaTrend({ labels, series }: { labels: string[]; series: Series[] }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const w = 800;
  const h = 260;
  const padY = 18;
  const n = labels.length;
  if (n < 2) return <p className="text-sm text-ink-soft">Pas assez de données.</p>;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const xs = (i: number) => (i / (n - 1)) * w;
  const ys = (v: number) => h - padY - (v / max) * (h - padY * 2);
  const gridY = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-4">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`${gid}-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {gridY.map((f, i) => {
            const y = h - padY - f * (h - padY * 2);
            return <line key={i} x1="0" y1={y} x2={w} y2={y} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
          })}
          {series.map((s, si) => {
            const pts = s.data.map((v, i) => ({ x: xs(i), y: ys(v) }));
            const line = smoothPath(pts);
            return (
              <g key={si}>
                <path d={`${line} L ${w} ${h - padY} L 0 ${h - padY} Z`} fill={`url(#${gid}-${si})`} />
                <path d={line} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {hover != null && (
            <line x1={xs(hover)} y1="0" x2={xs(hover)} y2={h} stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
          {series.map((s, si) =>
            hover != null ? <circle key={si} cx={xs(hover)} cy={ys(s.data[hover])} r="3.5" fill={s.color} stroke="var(--color-card)" strokeWidth="2" /> : null,
          )}
          {labels.map((_, i) => (
            <rect key={i} x={xs(i) - w / n / 2} y="0" width={w / n} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute -top-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-[var(--shadow-md)]" style={{ left: `calc(${(hover / (n - 1)) * 100}% )`, transform: "translateX(-50%)" }}>
            <div className="mb-0.5 font-medium">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span className="text-ink-soft">{s.name}</span>
                <span className="ml-auto font-medium tabular-nums">{s.data[hover]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-soft">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(n / 2)]}</span>
        <span>{labels[n - 1]}</span>
      </div>
    </div>
  );
}

// Barres de catégories façon Redion (pastille + libellé + total, barre pleine largeur dessous).
export function CategoryBars({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-ink-soft">Pas de données.</p>;
  return (
    <div className="space-y-4">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-sm">{d.label}</span>
            <span className="ml-auto text-sm font-semibold tabular-nums">{d.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Courbe d'aire (série temporelle) avec repères d'axe légers.
export function AreaTrend({ points, unit = "" }: { points: { label: string; value: number }[]; unit?: string }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const w = 760;
  const h = 200;
  const padY = 16;
  if (points.length < 2) return <p className="text-sm text-ink-soft">Pas assez de données.</p>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const xs = (i: number) => (i / (points.length - 1)) * w;
  const ys = (v: number) => h - padY - (v / max) * (h - padY * 2);
  const pts = points.map((p, i) => ({ x: xs(i), y: ys(p.value) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const active = hover != null ? points[hover] : null;
  const gridY = [0.25, 0.5, 0.75, 1].map((f) => h - padY - f * (h - padY * 2));

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-ink-soft">
          {active ? active.label : `${points.length} derniers jours`}
        </span>
        <span className="font-serif text-lg">
          {active ? active.value : points.reduce((s, p) => s + p.value, 0)}
          {unit && <span className="ml-1 text-sm text-ink-soft">{unit}</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridY.map((y, i) => (
          <line key={i} x1="0" y1={y} x2={w} y2={y} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {active && (
          <line x1={pts[hover!].x} y1="0" x2={pts[hover!].x} y2={h} stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        {points.map((_, i) => (
          <rect key={i} x={xs(i) - w / points.length / 2} y="0" width={w / points.length} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {active && <circle cx={pts[hover!].x} cy={pts[hover!].y} r="3.5" fill="var(--color-accent)" stroke="var(--color-card)" strokeWidth="2" />}
      </svg>
    </div>
  );
}

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
