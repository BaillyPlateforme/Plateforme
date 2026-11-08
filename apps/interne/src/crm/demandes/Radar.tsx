import { useId } from "react";
import { AXES, type Araignee } from "./araignee";

/*
 * L'araignée d'une demande : six axes de 0 (centre) à 100 (bord), « plus
 * loin = mieux » (araignee.ts dit chaque règle). Un axe sans valeur (pas encore
 * évaluée, parcours sans prix, commune inconnue) reste au centre, marqué
 * d'un rond ambre creux, et son libellé dit « — ».
 *
 * Du SVG seul : il s'affiche aussi bien sur le serveur que dans le
 * navigateur, en petit (Top demandes) ou avec ses libellés (carte
 * Évaluation d'une demande).
 */

export default function Radar({ araignee, taille = 132, libelles = false }: { araignee: Araignee; taille?: number; libelles?: boolean }) {
  const id = useId().replace(/:/g, "");
  const c = taille / 2;
  const r = c - (libelles ? 58 : 6);
  const point = (i: number, v: number) => {
    const a = (-90 + i * (360 / AXES.length)) * (Math.PI / 180);
    return [c + Math.cos(a) * r * (v / 100), c + Math.sin(a) * r * (v / 100)] as const;
  };
  const polygone = (v: number) => AXES.map((_, i) => point(i, v).join(",")).join(" ");
  const valeurs = AXES.map((a) => araignee.valeurs[a.cle]);
  const forme = valeurs.map((v, i) => point(i, v ?? 0).join(",")).join(" ");
  const resume = AXES.map((a, i) => `${a.label} ${valeurs[i] ?? "—"}`).join(", ");

  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={`Araignée de la demande : ${resume}`} style={{ display: "block", flex: "none", overflow: "visible" }}>
      <defs>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4b2fe0" stopOpacity="0.32" />
          <stop offset="1" stopColor="#7a52ff" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {[25, 50, 75, 100].map((n) => (
        <polygon key={n} points={polygone(n)} fill={n === 100 ? "#faf9fd" : "none"} stroke={n === 100 ? "#e3dff0" : "#ece9f5"} strokeWidth={1} />
      ))}
      {AXES.map((a, i) => {
        const [x, y] = point(i, 100);
        return <line key={a.cle} x1={c} y1={c} x2={x} y2={y} stroke="#ece9f5" strokeWidth={1} />;
      })}
      <polygon points={forme} fill={`url(#r${id})`} stroke="#4b2fe0" strokeWidth={libelles ? 2 : 1.6} strokeLinejoin="round" />
      {valeurs.map((v, i) => {
        const [x, y] = point(i, v ?? 0);
        return v == null ? (
          <circle key={AXES[i].cle} cx={x} cy={y} r={libelles ? 3.5 : 2.6} fill="#fff" stroke="#f59e0b" strokeWidth={1.4} />
        ) : (
          <circle key={AXES[i].cle} cx={x} cy={y} r={libelles ? 3.6 : 2.4} fill="#4b2fe0" stroke="#fff" strokeWidth={1.2} />
        );
      })}
      {libelles &&
        AXES.map((a, i) => {
          const [x, y] = point(i, 100);
          const dx = x - c;
          const ancre = Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end";
          const lx = x + (ancre === "middle" ? 0 : dx > 0 ? 8 : -8);
          const ly = y + (y < c - 4 ? -14 : y > c + 4 ? 16 : 0);
          return (
            <text key={a.cle} x={lx} y={ly} textAnchor={ancre} fontSize={11} fill="#6f6c80" fontWeight={600}>
              {a.label}
              <tspan x={lx} dy={13} fontSize={12.5} fontWeight={800} fill={valeurs[i] == null ? "#b45309" : "#14121f"}>
                {valeurs[i] ?? "—"}
              </tspan>
            </text>
          );
        })}
    </svg>
  );
}
