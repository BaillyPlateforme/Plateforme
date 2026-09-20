"use client";

/* Primitives de graphiques dessinées pour ce tableau de bord :
   traits lissés, barres à bouts arrondis, aplats pastel. */

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
/** Graduations compactes : 20 000 devient 20 k, sinon l'axe déborde. */
const tick = (v: number) => (v >= 1000 ? `${nf.format(Math.round(v / 100) / 10)} k` : nf.format(v));

/** Courbe lissée passant par les points (Catmull-Rom converti en bézier). */
function lissage(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function echelle(max: number) {
  if (max <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const pas = Math.pow(10, Math.floor(Math.log10(max)));
  const haut = Math.ceil(max / pas) * pas;
  const n = 4;
  return { max: haut, ticks: Array.from({ length: n + 1 }, (_, i) => (haut / n) * i) };
}

/* ─────────────── Courbes multiples ─────────────── */

export function Courbes({
  labels,
  series,
  hauteur = 190,
}: {
  labels: string[];
  series: { label: string; color: string; data: number[] }[];
  hauteur?: number;
}) {
  const W = 620;
  const H = hauteur;
  const padL = 16;
  const padB = 22;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const { max: haut } = echelle(max);
  const x = (i: number) => padL + (i * (W - padL - 18)) / Math.max(1, labels.length - 1);
  const y = (v: number) => H - padB - (v / haut) * (H - padB - 10);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: hauteur }}>
        {series.map((s) => (
          <path
            key={s.label}
            d={lissage(s.data.map((v, i) => [x(i), y(v)]))}
            fill="none"
            stroke={s.color}
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
        {labels.map((l, i) => (
          <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-soft)">
            {l}
          </text>
        ))}
      </svg>
      <Legende series={series} />
    </div>
  );
}

/* ─────────────── Barres groupées ─────────────── */

export function BarresGroupees({
  labels,
  series,
  hauteur = 210,
  unite = "",
}: {
  labels: string[];
  series: { label: string; color: string; data: number[] }[];
  hauteur?: number;
  unite?: string;
}) {
  const W = 560;
  const H = hauteur;
  const padL = 14;
  const padB = 24;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const { max: haut } = echelle(max);
  const pas = (W - padL - 10) / Math.max(1, labels.length);
  const largeur = Math.min(16, (pas - 12) / series.length);
  const y = (v: number) => H - padB - (v / haut) * (H - padB - 10);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: hauteur }}>
        {labels.map((l, i) => {
          const centre = padL + pas * i + pas / 2;
          const total = series.length * largeur + (series.length - 1) * 6;
          return (
            <g key={l + i}>
              {series.map((s, j) => {
                const hb = Math.max(2, H - padB - y(s.data[i] ?? 0));
                const bx = centre - total / 2 + j * (largeur + 6);
                return (
                  <rect
                    key={s.label}
                    x={bx}
                    y={H - padB - hb}
                    width={largeur}
                    height={hb}
                    rx={largeur / 2}
                    ry={largeur / 2}
                    fill={s.color}
                  />
                );
              })}
              <text x={centre} y={H - 7} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-soft)">
                {l}
              </text>
            </g>
          );
        })}
      </svg>
      <Legende series={series} />
    </div>
  );
}

/* ─────────────── Barres empilées ─────────────── */

export function BarresEmpilees({
  labels,
  bas,
  haut: serieHaut,
  hauteur = 200,
}: {
  labels: string[];
  bas: { label: string; color: string; data: number[] };
  haut: { label: string; color: string; data: number[] };
  hauteur?: number;
}) {
  const W = 420;
  const H = hauteur;
  const padB = 20;
  const totaux = labels.map((_, i) => (bas.data[i] ?? 0) + (serieHaut.data[i] ?? 0));
  const max = Math.max(1, ...totaux);
  const pas = W / Math.max(1, labels.length);
  const largeur = Math.min(24, pas - 14);
  const ech = (v: number) => (v / max) * (H - padB - 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: hauteur }}>
      {labels.map((l, i) => {
        const hb = ech(bas.data[i] ?? 0);
        const hh = ech(serieHaut.data[i] ?? 0);
        const x = pas * i + pas / 2 - largeur / 2;
        return (
          <g key={l + i}>
            <rect x={x} y={H - padB - hb} width={largeur} height={Math.max(2, hb)} rx={largeur / 2} fill={bas.color} />
            <rect
              x={x}
              y={H - padB - hb - hh}
              width={largeur}
              height={Math.max(2, hh)}
              rx={largeur / 2}
              fill={serieHaut.color}
            />
            <text x={x + largeur / 2} y={H - 5} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-soft)">
              {l}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────── Deux aires superposées ─────────────── */

export function Aires({
  labels,
  series,
  hauteur = 175,
}: {
  labels: string[];
  series: { label: string; color: string; data: number[] }[];
  hauteur?: number;
}) {
  const W = 520;
  const H = hauteur;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const x = (i: number) => (i * W) / Math.max(1, labels.length - 1);
  const y = (v: number) => H - 14 - (v / max) * (H - 30);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: hauteur }}>
      <defs>
        {series.map((s) => (
          <linearGradient key={s.label} id={`aire-${s.label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {series.map((s) => {
        const pts = s.data.map((v, i) => [x(i), y(v)] as [number, number]);
        const trace = lissage(pts);
        return (
          <g key={s.label}>
            <path d={`${trace} L ${W} ${H} L 0 ${H} Z`} fill={`url(#aire-${s.label.replace(/\W/g, "")})`} />
            <path d={trace} fill="none" stroke={s.color} strokeWidth="2.8" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#fff" stroke={s.color} strokeWidth="2" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────── Légende ─────────────── */

export function Legende({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ─────────────── Barre de popularité ─────────────── */

export function Popularite({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="block h-1.5 w-full rounded-full" style={{ background: `${color}22` }}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(3, Math.min(100, pct))}%`, background: color }}
      />
    </span>
  );
}
