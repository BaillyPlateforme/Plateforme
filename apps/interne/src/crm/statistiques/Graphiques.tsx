import { RAMPE_ENTONNOIR, UNIQUE } from "./palette";
import { moisCourt } from "./periodes";
import s from "./statistiques.module.css";

/*
 * Les graphiques des pages de statistiques, rendus côté serveur en HTML et
 * SVG, sans bibliothèque ni script : la méthode dataviz — tracés fins (barres
 * de 16 à 22 px aux bouts arrondis de 4 px, carrés sur la ligne de base,
 * courbes de 2 px), quadrillage en filet clair, étiquettes choisies (le bout
 * d'une barre, le maximum, le dernier mois), une légende dès deux séries, et
 * une bulle au survol ou au clavier (chaque cible est focalisable). Les
 * textes restent à l'encre du CRM : la couleur est portée par la marque à
 * côté, jamais par le texte. Chaque graphique a son tableau à côté ou
 * dessous, dans la page.
 */

/* ───────── Formats ───────── */
const ENTIER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const UNE_DECIMALE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export const nombre = (n: number) => ENTIER.format(n);
export const euros = (n: number) => `${ENTIER.format(Math.round(n))} €`;
/** 1 284 € · 12,9 k€ · 1,2 M€ : pour les axes et les étiquettes serrées. */
export function eurosCourts(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${UNE_DECIMALE.format(n / 1e6)} M€`;
  if (a >= 1e4) return `${ENTIER.format(n / 1e3)} k€`;
  if (a >= 1e3) return `${UNE_DECIMALE.format(n / 1e3)} k€`;
  return `${ENTIER.format(n)} €`;
}
export const pourcent = (x: number | null) => (x == null || !Number.isFinite(x) ? "—" : `${ENTIER.format(Math.round(x * 100))} %`);
export const volume = (n: number) => `${UNE_DECIMALE.format(n)} m³`;

/** Des graduations rondes de 0 à au moins `max` (4 ou 5 intervalles). */
export function graduations(max: number, intervalles = 4) {
  if (!(max > 0)) return { haut: 1, pas: [0, 1] };
  const brut = max / intervalles;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= brut) ?? 10 * p;
  const haut = Math.ceil(max / pas) * pas;
  return { haut, pas: Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => +(i * pas).toFixed(6)) };
}

/* ───────── Tuiles ───────── */
export function Tuiles({ children }: { children: React.ReactNode }) {
  return <div className={s.tuiles}>{children}</div>;
}
export function Tuile({ label, valeur, detail, heros = false, ton }: { label: string; valeur: string; detail?: React.ReactNode; heros?: boolean; ton?: "vert" | "ambre" | "rose" }) {
  return (
    <div className={`${s.tuile} ${heros ? s.heros : ""}`} data-ton={ton}>
      <small>{label}</small>
      <b>{valeur}</b>
      {detail && <span>{detail}</span>}
    </div>
  );
}

/* ───────── Légende ───────── */
export function Legende({ series }: { series: { libelle: string; couleur: string }[] }) {
  return (
    <ul className={s.legende}>
      {series.map((x) => (
        <li key={x.libelle}>
          <i style={{ background: x.couleur }} />
          {x.libelle}
        </li>
      ))}
    </ul>
  );
}

/** Un graphique sans données : la place gardée, la raison dite. */
export function Vide({ texte, hauteur = 180 }: { texte: string; hauteur?: number }) {
  return (
    <div className={s.vide} style={{ minHeight: hauteur }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
        <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
      </svg>
      <span>{texte}</span>
    </div>
  );
}

/* ───────── Barres classées (horizontales) ───────── */
export type Barre = { cle: string; libelle: string; valeur: number; couleur?: string; detail?: string; etiquette?: string };

export function BarresClassees({ barres, format, vide = "Rien sur la période." }: { barres: Barre[]; format: (n: number) => string; vide?: string }) {
  const max = Math.max(0, ...barres.map((b) => b.valeur));
  if (!barres.length || max <= 0) return <Vide texte={vide} hauteur={120} />;
  return (
    <div className={s.barres} role="list">
      {barres.map((b) => {
        const pct = (b.valeur / max) * 100;
        return (
          <div key={b.cle} className={`${s.barre} ${s.cible}`} role="listitem" tabIndex={0} aria-label={`${b.libelle} : ${format(b.valeur)}${b.detail ? `, ${b.detail}` : ""}`}>
            <span className={s.barreNom}>{b.libelle}</span>
            <span className={s.piste}>
              <i style={{ width: `${Math.max(pct, b.valeur > 0 ? 1.2 : 0)}%`, background: b.couleur ?? UNIQUE }} />
              <em style={{ left: `${pct}%` }}>
                {b.etiquette ?? format(b.valeur)}
              </em>
            </span>
            {b.detail && <span className={s.bulle}>{b.detail}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ───────── Entonnoirs (petits multiples) ───────── */
export type Entonnoir = { cle: string; libelle: string; couleur: string; etapes: [number, number, number] };
const ETAPES = ["Visites", "Dossiers devisés", "Signés"];

export function Entonnoirs({ entonnoirs }: { entonnoirs: Entonnoir[] }) {
  const max = Math.max(1, ...entonnoirs.flatMap((e) => e.etapes));
  return (
    <>
      <div className={s.entonnoirs}>
        {entonnoirs.map((e) => (
          <div key={e.cle} className={s.entonnoir}>
            <p className={s.entonnoirTete}>
              <i style={{ background: e.couleur }} />
              {e.libelle}
            </p>
            {e.etapes.map((v, i) => {
              const avant = i > 0 ? e.etapes[i - 1] : null;
              return (
                <div key={i} className={`${s.etape} ${s.cible}`} tabIndex={0} aria-label={`${e.libelle}, ${ETAPES[i]} : ${nombre(v)}`}>
                  <span className={s.etapeNom}>{ETAPES[i]}</span>
                  <span className={s.piste}>
                    <i style={{ width: `${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%`, background: RAMPE_ENTONNOIR[i] }} />
                  </span>
                  <b>{nombre(v)}</b>
                  {avant != null && <span className={s.bulle}>{avant > 0 ? `${pourcent(v / avant)} de l’étape précédente (en volume)` : "Aucune entrée à l’étape précédente"}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Legende series={ETAPES.map((l, i) => ({ libelle: l, couleur: RAMPE_ENTONNOIR[i] }))} />
    </>
  );
}

/* ───────── Courbes mensuelles (plusieurs séries, un seul axe) ───────── */
export type Serie = { cle: string; libelle: string; couleur: string; valeurs: number[] };

export function Courbes({ mois, series, format, formatAxe, retenus = [] }: { mois: string[]; series: Serie[]; format: (n: number) => string; formatAxe: (n: number) => string; /** Les mois de la période choisie, teintés. */ retenus?: boolean[] }) {
  const max = Math.max(0, ...series.flatMap((x) => x.valeurs));
  if (!series.length || max <= 0) return <Vide texte="Aucun montant sur les douze derniers mois." hauteur={260} />;
  const { haut, pas } = graduations(max);
  const n = mois.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => (v / haut) * 100;
  const annees = new Set(mois.map((m) => m.slice(0, 4))).size > 1;
  return (
    <>
      <div className={s.courbes}>
        <div className={s.plan}>
          {pas.map((t) => (
            <span key={t} className={s.grille} style={{ bottom: `${y(t)}%` }}>
              <em>{formatAxe(t)}</em>
            </span>
          ))}
          {retenus.map((r, i) =>
            r ? <span key={i} className={s.retenu} style={{ left: `${Math.max(0, x(i - 0.5))}%`, width: `${Math.min(100, x(i + 0.5)) - Math.max(0, x(i - 0.5))}%` }} /> : null,
          )}
          <svg className={s.traits} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {series.map((se) => (
              <g key={se.cle}>
                {series.length === 1 && <path d={`M${se.valeurs.map((v, i) => `${x(i)} ${100 - y(v)}`).join(" L")} L${x(n - 1)} 100 L${x(0)} 100Z`} fill={se.couleur} opacity={0.1} />}
                <path d={`M${se.valeurs.map((v, i) => `${x(i)} ${100 - y(v)}`).join(" L")}`} fill="none" stroke={se.couleur} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}
          </svg>
          {/* Le point de fin de chaque série, toujours visible. */}
          {series.map((se) => (
            <i key={se.cle} className={s.point} style={{ left: `${x(n - 1)}%`, bottom: `${y(se.valeurs[n - 1])}%`, background: se.couleur }} />
          ))}
          {/* Les colonnes de survol : la ligne de visée, les points du mois, la bulle. */}
          {mois.map((m, i) => (
            <div
              key={m}
              className={`${s.colonneSurvol} ${s.cible}`}
              style={{ left: `${Math.max(0, x(i - 0.5))}%`, width: `${Math.min(100, x(i + 0.5)) - Math.max(0, x(i - 0.5))}%` }}
              tabIndex={0}
              aria-label={`${moisCourt(m, true)} : ${series.map((se) => `${se.libelle} ${format(se.valeurs[i])}`).join(", ")}`}
            >
              <span className={s.visee} style={{ left: `${((x(i) - Math.max(0, x(i - 0.5))) / (Math.min(100, x(i + 0.5)) - Math.max(0, x(i - 0.5)))) * 100}%` }}>
                {series.map((se) => (
                  <i key={se.cle} style={{ bottom: `${y(se.valeurs[i])}%`, background: se.couleur }} />
                ))}
              </span>
              <span className={s.bulle} data-cote={i > n / 2 ? "gauche" : "droite"}>
                <b>{moisCourt(m, true)}</b>
                {series.map((se) => (
                  <span key={se.cle} className={s.bulleLigne}>
                    <i style={{ background: se.couleur }} />
                    {se.libelle}
                    <em>{format(se.valeurs[i])}</em>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className={s.axeX}>
          {mois.map((m, i) => (
            <span key={m} style={{ left: `${x(i)}%` }}>
              {moisCourt(m, annees && m.endsWith("-01"))}
            </span>
          ))}
        </div>
      </div>
      {series.length > 1 && <Legende series={series} />}
    </>
  );
}

/* ───────── Colonnes mensuelles (une série) ───────── */
export function Colonnes({ mois, valeurs, format, detail, retenus = [] }: { mois: string[]; valeurs: number[]; format: (n: number) => string; detail?: (i: number) => string; retenus?: boolean[] }) {
  const max = Math.max(0, ...valeurs);
  if (max <= 0) return <Vide texte="Rien sur les douze derniers mois." hauteur={240} />;
  const { haut, pas } = graduations(max);
  const iMax = valeurs.indexOf(max);
  const annees = new Set(mois.map((m) => m.slice(0, 4))).size > 1;
  return (
    <div className={s.colonnes}>
      <div className={s.plan}>
        {pas.map((t) => (
          <span key={t} className={s.grille} style={{ bottom: `${(t / haut) * 100}%` }}>
            <em>{format(t)}</em>
          </span>
        ))}
        <div className={s.rangee}>
          {mois.map((m, i) => {
            const v = valeurs[i];
            const etiquette = i === iMax || i === mois.length - 1;
            return (
              <div key={m} className={`${s.colonne} ${s.cible}`} data-retenu={retenus[i] || undefined} tabIndex={0} aria-label={`${moisCourt(m, true)} : ${format(v)}${detail ? `, ${detail(i)}` : ""}`}>
                <i style={{ height: `${(v / haut) * 100}%` }}>{etiquette && v > 0 && <em>{format(v)}</em>}</i>
                <span className={s.bulle} data-cote={i > mois.length / 2 ? "gauche" : "droite"}>
                  <b>{moisCourt(m, true)}</b>
                  <span className={s.bulleLigne}>
                    {format(v)}
                    {detail && <em>{detail(i)}</em>}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={s.axeColonnes}>
        {mois.map((m, i) => (
          <span key={m}>{moisCourt(m, annees && m.endsWith("-01"))}</span>
        ))}
      </div>
    </div>
  );
}

/* ───────── Barres empilées horizontales (deux ou trois séries) ───────── */
export function Empilees({ lignes, series, vide = "Rien sur la période." }: { lignes: { cle: string; libelle: string; parts: number[] }[]; series: { libelle: string; couleur: string }[]; vide?: string }) {
  const max = Math.max(0, ...lignes.map((l) => l.parts.reduce((a, b) => a + b, 0)));
  if (!lignes.length || max <= 0) return <Vide texte={vide} hauteur={120} />;
  return (
    <>
      <div className={s.barres} role="list">
        {lignes.map((l) => {
          const total = l.parts.reduce((a, b) => a + b, 0);
          return (
            <div key={l.cle} className={`${s.barre} ${s.cible}`} role="listitem" tabIndex={0} aria-label={`${l.libelle} : ${series.map((x, i) => `${x.libelle} ${l.parts[i]}`).join(", ")}`}>
              <span className={s.barreNom}>{l.libelle}</span>
              <span className={s.piste}>
                <span className={s.pile} style={{ width: `${(total / max) * 100}%` }}>
                  {l.parts.map((v, i) => (v > 0 ? <i key={i} style={{ flexGrow: v, background: series[i].couleur }} /> : null))}
                </span>
                <em style={{ left: `${(total / max) * 100}%` }}>
                  {nombre(total)}
                </em>
              </span>
              <span className={s.bulle}>
                {series.map((x, i) => (
                  <span key={x.libelle} className={s.bulleLigne}>
                    <i style={{ background: x.couleur }} />
                    {x.libelle}
                    <em>{nombre(l.parts[i])}</em>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <Legende series={series} />
    </>
  );
}

/* ───────── Jauge de remplissage ───────── */
export function Jauge({ part, libelle }: { part: number; libelle: string }) {
  const depasse = part > 1;
  return (
    <span className={s.jauge} data-depasse={depasse || undefined} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(part * 100)} aria-label={libelle}>
      <i style={{ width: `${Math.min(100, part * 100)}%` }} />
    </span>
  );
}
