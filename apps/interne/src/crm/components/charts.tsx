export function Line({ pts, goal, id }: { pts: number[]; goal?: number[]; id: string }) {
  const w = 400, h = 150, mx = Math.max(1, ...pts, ...(goal ?? [])) * 1.1;
  const path = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${((i * w) / Math.max(1, a.length - 1)).toFixed(1)} ${(h - (v / mx) * h).toFixed(1)}`).join(" ");
  const d = path(pts);
  return (
    <div style={{ position: "relative" }}>
      <svg className="line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={`url(#g${id})`} />
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {goal && (
        <svg className="line goal" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <path d={path(goal)} fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

export function Gauge({ pct }: { pct: number }) {
  const arc = "M15 100 A85 85 0 0 1 185 100";
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 110">
        <path className="g-bg" d={arc} fill="none" pathLength={100} />
        <path className="g-mid" d={arc} fill="none" pathLength={100} strokeDasharray={`${Math.min(100, pct)} 100`} />
      </svg>
      <b>{pct}<small>%</small></b><span>de devis signés</span>
    </div>
  );
}
