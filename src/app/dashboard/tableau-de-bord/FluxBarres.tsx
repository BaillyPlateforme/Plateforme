"use client";

/**
 * Le graphique de la maquette : des colonnes pâles en fond, deux fines barres
 * par créneau — reçues et qualifiées — et la moyenne en pointillé rouge.
 *
 * Tout est dessiné à la main : une bibliothèque de graphiques pèserait plus
 * lourd que ces quarante lignes, et ne donnerait pas ce trait-là.
 */
export default function FluxBarres({
  labels,
  recues,
  qualifiees,
  hauteur = 270,
}: {
  labels: string[];
  recues: number[];
  qualifiees: number[];
  hauteur?: number;
}) {
  const n = Math.max(1, labels.length);
  const W = 1000;
  const H = hauteur;
  const padL = 34;
  const padB = 26;
  const padT = 10;

  const brut = Math.max(1, ...recues, ...qualifiees);
  const pas = echelon(brut);
  const haut = Math.ceil(brut / pas) * pas;
  const graduations = Array.from({ length: haut / pas + 1 }, (_, i) => i * pas);

  const y = (v: number) => padT + (1 - v / haut) * (H - padT - padB);
  const pasX = (W - padL) / n;
  const centre = (i: number) => padL + pasX * (i + 0.5);

  const moyenne = recues.length ? recues.reduce((a, b) => a + b, 0) / recues.length : 0;

  // Au-delà d'une quinzaine de créneaux, une étiquette sur deux suffit.
  const saut = n > 16 ? Math.ceil(n / 12) : 1;
  const largeur = Math.min(5, Math.max(2.5, pasX * 0.14));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img">
      {graduations.map((g) => (
        <g key={g}>
          <line x1={padL} x2={W} y1={y(g)} y2={y(g)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={padL - 10} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-soft)">
            {g}
          </text>
        </g>
      ))}

      {/* Colonnes de fond : le total du créneau, en gris très clair. */}
      {labels.map((l, i) => {
        const total = recues[i] + qualifiees[i];
        const h = Math.max(0, y(0) - y(total));
        return (
          <rect
            key={`f-${l}-${i}`}
            x={centre(i) - pasX * 0.26}
            y={y(0) - h}
            width={pasX * 0.52}
            height={h}
            fill="var(--color-subtle)"
            rx="2"
          />
        );
      })}

      {labels.map((l, i) => (
        <g key={`b-${l}-${i}`}>
          <rect
            x={centre(i) - largeur - 1}
            y={y(recues[i])}
            width={largeur}
            height={Math.max(1, y(0) - y(recues[i]))}
            fill="var(--chart-1)"
            rx={largeur / 2}
          />
          <rect
            x={centre(i) + 1}
            y={y(qualifiees[i])}
            width={largeur}
            height={Math.max(1, y(0) - y(qualifiees[i]))}
            fill="var(--chart-2)"
            rx={largeur / 2}
          />
        </g>
      ))}

      {/* La moyenne des demandes reçues. */}
      <line
        x1={padL}
        x2={W}
        y1={y(moyenne)}
        y2={y(moyenne)}
        stroke="#8a2b3b"
        strokeWidth="1.3"
        strokeDasharray="5 5"
      />

      {labels.map((l, i) =>
        i % saut === 0 ? (
          <text
            key={`x-${l}-${i}`}
            x={centre(i)}
            y={H - 7}
            textAnchor="middle"
            fontSize="11"
            fill="var(--color-ink-soft)"
          >
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Un échelon d'axe lisible : 1, 2, 5, 10, 20, 50… */
function echelon(max: number) {
  const brut = max / 5;
  const dix = 10 ** Math.floor(Math.log10(Math.max(1, brut)));
  const reste = brut / dix;
  return (reste <= 1 ? 1 : reste <= 2 ? 2 : reste <= 5 ? 5 : 10) * dix;
}
