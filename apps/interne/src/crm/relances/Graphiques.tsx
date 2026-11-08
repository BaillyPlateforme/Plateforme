"use client";

import { useState } from "react";
import s from "./relances.module.css";

/*
 * Les graphiques de la section, en HTML et CSS, sans bibliothèque : des
 * colonnes empilées (une couleur par série, ordre fixe), une base unique,
 * 2 px de blanc entre les segments, l'extrémité arrondie, une grille
 * discrète. Au survol ou au focus, une infobulle donne chaque série ; la
 * légende porte les totaux ; un tableau reprend toutes les valeurs.
 */

export type Serie = { cle: string; libelle: string; couleur: string };
export type Point = {
  cle: string;
  /** Sous la colonne : « 9 », « lun. 9 »… */
  etiquette: string;
  /** En tête de l'infobulle et du tableau : « lundi 9 novembre ». */
  detail: string;
  valeurs: Record<string, number>;
  /** Un jour à part (week-end) : fond légèrement grisé. */
  fond?: boolean;
  aujourdhui?: boolean;
};

/** Un maximum rond, divisible en quatre pas entiers. */
function echelle(max: number) {
  const x = Math.max(1, max) / 4;
  const mag = 10 ** Math.floor(Math.log10(x));
  const f = x / mag;
  const pas = Math.max(1, Math.ceil((f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag));
  return { pas, max: pas * 4 };
}

export function Colonnes({
  series,
  points,
  petit = false,
  unite = "relance",
  vide,
}: {
  series: Serie[];
  points: Point[];
  petit?: boolean;
  unite?: string;
  vide?: string;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const total = (p: Point) => series.reduce((n, x) => n + (p.valeurs[x.cle] ?? 0), 0);
  const plusGrand = Math.max(0, ...points.map(total));
  const { pas, max } = echelle(plusGrand);
  const pluriel = (n: number) => `${n} ${unite}${n > 1 ? "s" : ""}`;
  const totaux = series.map((x) => ({ ...x, n: points.reduce((a, p) => a + (p.valeurs[x.cle] ?? 0), 0) }));
  const pasEtiquette = points.length > 16 ? Math.ceil(points.length / 10) : 1;

  return (
    <div>
      {plusGrand === 0 && vide ? (
        <div className={s.vide}>{vide}</div>
      ) : (
        <div className={s.graphe} data-petit={petit || undefined}>
          <div className={s.axeY} aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{ bottom: `${(i * 100) / 4}%` }}>
                {i * pas}
              </span>
            ))}
          </div>
          <div className={s.plot}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={s.ligneGrille} style={{ bottom: `${(i * 100) / 4}%` }} aria-hidden />
            ))}
            <div className={s.colonnes} role="list" aria-label="Valeurs, jour par jour">
              {points.map((p, i) => {
                const t = total(p);
                const bord = i < 2 ? "gauche" : i > points.length - 3 ? "droite" : undefined;
                return (
                  <button
                    key={p.cle}
                    type="button"
                    role="listitem"
                    className={s.col}
                    data-fond={p.fond || undefined}
                    data-aujourdhui={p.aujourdhui || undefined}
                    aria-label={`${p.detail} : ${series.map((x) => `${x.libelle} ${p.valeurs[x.cle] ?? 0}`).join(", ")}`}
                    onPointerEnter={() => setSurvol(i)}
                    onPointerLeave={() => setSurvol((v) => (v === i ? null : v))}
                    onFocus={() => setSurvol(i)}
                    onBlur={() => setSurvol((v) => (v === i ? null : v))}
                  >
                    {t > 0 && !petit && points.length <= 16 && <span className={s.valeurCol}>{t}</span>}
                    <span className={s.pile} style={{ height: `${(t / max) * 100}%` }}>
                      {series.map((x) =>
                        p.valeurs[x.cle] ? <i key={x.cle} style={{ flexGrow: p.valeurs[x.cle], ["--c" as string]: x.couleur }} /> : null,
                      )}
                    </span>
                    {survol === i && (
                      <span className={s.infobulle} data-bord={bord} role="tooltip">
                        <p>{p.detail}</p>
                        {series.map((x) => (
                          <div key={x.cle} style={{ ["--c" as string]: x.couleur }}>
                            <i />
                            <b>{p.valeurs[x.cle] ?? 0}</b>
                            <span>{x.libelle}</span>
                          </div>
                        ))}
                        {series.length > 1 && (
                          <div>
                            <b style={{ marginLeft: 18 }}>{t}</b>
                            <span>au total</span>
                          </div>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={s.axeX} aria-hidden>
            {points.map((p, i) => (
              <span key={p.cle} data-aujourdhui={p.aujourdhui || undefined}>
                {i % pasEtiquette === 0 || p.aujourdhui ? p.etiquette : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {series.length > 1 && (
        <ul className={s.legende}>
          {totaux.map((x) => (
            <li key={x.cle} style={{ ["--c" as string]: x.couleur }}>
              <i />
              {x.libelle} <b>{x.n}</b>
            </li>
          ))}
        </ul>
      )}
      <details className={s.donnees}>
        <summary>Voir les données</summary>
        <table>
          <thead>
            <tr>
              <th>Jour</th>
              {series.map((x) => (
                <th key={x.cle}>{x.libelle}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.cle}>
                <td>{p.detail}</td>
                {series.map((x) => (
                  <td key={x.cle}>{p.valeurs[x.cle] ?? 0}</td>
                ))}
                <td>{total(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: "8px 0 0" }}>{pluriel(points.reduce((n, p) => n + total(p), 0))} sur la période.</p>
      </details>
    </div>
  );
}
