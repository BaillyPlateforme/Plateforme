import { useId } from "react";
import { AXES, type Araignee, type CleAxe } from "./araignee";

/*
 * L'araignée d'une demande, en couleur (demande de David, 08/11/2026) : six
 * axes de 0 (centre) à 100 (bord), « plus loin = mieux » (araignee.ts dit
 * chaque règle), une couleur par axe — potentiel indigo, facilité vert,
 * prestige ambre, volume ciel, montant violet, complétude rose.
 *
 * La surface se teinte, part par part, des couleurs des deux axes qui la
 * bordent, en léger ; chaque valeur porte son point de couleur, et, en
 * grand, son libellé et son chiffre de la même couleur (une nuance plus
 * soutenue, pour se lire sur le blanc). La grille reste fine et grise. Un
 * axe sans valeur (pas encore évaluée, parcours sans prix, commune
 * inconnue) reste au centre, marqué d'un rond ambre creux, son chiffre « — ».
 *
 * Du SVG seul : il s'affiche sur le serveur comme dans le navigateur, en
 * petit (la demande vedette de Top demandes) ou avec ses libellés (le
 * panneau de Demandes, la carte Évaluation d'une demande).
 */

/** Les nuances des libellés : la couleur de l'axe, assez foncée pour se lire sur le blanc. */
const TEXTE: Record<CleAxe, string> = {
  potentiel: "#3a22c4",
  facilite: "#0b7a4f",
  prestige: "#b45309",
  volume: "#0369a1",
  montant: "#6236e6",
  completude: "#be185d",
};

export default function Radar({ araignee, taille = 132, libelles = false }: { araignee: Araignee; taille?: number; libelles?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const c = taille / 2;
  const r = c - (libelles ? 62 : 6);
  const n = AXES.length;
  const point = (i: number, v: number) => {
    const a = (-90 + i * (360 / n)) * (Math.PI / 180);
    return [c + Math.cos(a) * r * (v / 100), c + Math.sin(a) * r * (v / 100)] as const;
  };
  const polygone = (v: number) => AXES.map((_, i) => point(i, v).join(",")).join(" ");
  const valeurs = AXES.map((a) => araignee.valeurs[a.cle]);
  const pts = valeurs.map((v, i) => point(i, v ?? 0));
  const resume = AXES.map((a, i) => `${a.label} ${valeurs[i] ?? "—"}`).join(", ");

  return (
    // Avec libellés, la marge des côtés (les noms des axes) n'est pas utile en haut et en bas : 40 px de moins en hauteur.
    <svg width={taille} height={libelles ? taille - 40 : taille} viewBox={libelles ? `0 20 ${taille} ${taille - 40}` : `0 0 ${taille} ${taille}`} role="img" aria-label={`Araignée de la demande : ${resume}`} style={{ display: "block", flex: "none", overflow: "visible" }}>
      <defs>
        {/* Une part de la surface : du centre aux deux points voisins, teintée de leurs deux couleurs. */}
        {AXES.map((a, i) => {
          const j = (i + 1) % n;
          return (
            <linearGradient key={a.cle} id={`p${id}${i}`} gradientUnits="userSpaceOnUse" x1={pts[i][0]} y1={pts[i][1]} x2={pts[j][0]} y2={pts[j][1]}>
              <stop offset="0" stopColor={a.couleur} stopOpacity="0.34" />
              <stop offset="1" stopColor={AXES[j].couleur} stopOpacity="0.34" />
            </linearGradient>
          );
        })}
      </defs>
      {/* La grille : fine, grise ; le pourtour sur un fond à peine teinté. */}
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={polygone(v)} fill={v === 100 ? "#fbfaff" : "none"} stroke={v === 100 ? "#e3dff0" : "#eeebf6"} strokeWidth={1} />
      ))}
      {AXES.map((a, i) => {
        const [x, y] = point(i, 100);
        return <line key={a.cle} x1={c} y1={c} x2={x} y2={y} stroke={a.couleur} strokeOpacity={0.22} strokeWidth={1} />;
      })}
      {/* La surface, part par part, puis son contour. */}
      {AXES.map((a, i) => {
        const j = (i + 1) % n;
        return <polygon key={a.cle} points={`${c},${c} ${pts[i].join(",")} ${pts[j].join(",")}`} fill={`url(#p${id}${i})`} stroke="none" />;
      })}
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#2e1f9e" strokeOpacity={0.5} strokeWidth={libelles ? 1.6 : 1.3} strokeLinejoin="round" />
      {/* Les valeurs : un point de la couleur de l'axe, ou un rond ambre creux au centre quand elle manque. */}
      {valeurs.map((v, i) =>
        v == null ? (
          <circle key={AXES[i].cle} cx={c} cy={c} r={libelles ? 4 : 2.8} fill="#fff" stroke="#f59e0b" strokeWidth={1.5} />
        ) : (
          <circle key={AXES[i].cle} cx={pts[i][0]} cy={pts[i][1]} r={libelles ? 4.6 : 3} fill={AXES[i].couleur} stroke="#fff" strokeWidth={libelles ? 1.8 : 1.2} />
        ),
      )}
      {libelles &&
        AXES.map((a, i) => {
          const [x, y] = point(i, 100);
          const dx = x - c;
          const ancre = Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end";
          const lx = x + (ancre === "middle" ? 0 : dx > 0 ? 9 : -9);
          const ly = y + (y < c - 4 ? -18 : y > c + 4 ? 15 : -4);
          const v = valeurs[i];
          return (
            <text key={a.cle} x={lx} y={ly} textAnchor={ancre} fontSize={11.5} fontWeight={700} fill={TEXTE[a.cle]}>
              {a.label}
              <tspan x={lx} dy={15} fontSize={15} fontWeight={800} fill={v == null ? "#a7a3b8" : TEXTE[a.cle]}>
                {v ?? "—"}
              </tspan>
            </text>
          );
        })}
    </svg>
  );
}
