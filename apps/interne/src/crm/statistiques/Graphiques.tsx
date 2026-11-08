import Link from "next/link";
import { RETRAIT, UNIQUE, rampe } from "./palette";
import { moisCourt } from "./periodes";
import s from "./statistiques.module.css";

/*
 * Les graphiques des Statistiques et d'À la une, rendus côté serveur en HTML
 * et SVG, sans bibliothèque ni script, selon la méthode dataviz :
 *
 * - des tracés fins (barres de 10 à 22 px, bout arrondi de 4 px, carré sur
 *   la ligne de base ; courbes de 2 px ; points de 10 px cerclés de blanc),
 *   un quadrillage en filet clair, des graduations rondes ;
 * - une couleur par personne (palette.ts), la même dans tous les graphiques
 *   de la page ; une seule teinte, du clair au foncé, pour des étapes
 *   ordonnées (l'entonnoir, les tranches de potentiel) ;
 * - les textes à l'encre du CRM, la couleur portée par la marque d'à côté ;
 *   des valeurs alignées en colonne ; une légende dès deux séries ;
 * - une bulle au survol ou au clavier (chaque cible est focalisable), qui
 *   n'est jamais le seul chemin vers un chiffre : chaque page garde son
 *   tableau ou ses valeurs écrites.
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
export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${nombre(n)} ${n > 1 ? motPluriel : mot}`;

/** Des graduations rondes de 0 à au moins `max` (4 intervalles environ). */
export function graduations(max: number, intervalles = 4) {
  if (!(max > 0)) return { haut: 1, pas: [0, 1] };
  const brut = max / intervalles;
  const p = 10 ** Math.floor(Math.log10(brut));
  // 1, 2, 5 : jamais 2,5 (sur un axe de comptes, « 2,5 » s'arrondirait en « 3 »).
  const pas = [1, 2, 5, 10].map((k) => k * p).find((k) => k >= brut) ?? 10 * p;
  // Pas de fraction d'unité sur un axe de comptes.
  const pasRond = max < 10 && pas < 1 ? 1 : pas;
  const haut = Math.ceil(max / pasRond) * pasRond;
  return { haut, pas: Array.from({ length: Math.round(haut / pasRond) + 1 }, (_, i) => +(i * pasRond).toFixed(6)) };
}

/* ───────── Légende ───────── */
export function Legende({ series, forme = "carre" }: { series: { libelle: string; couleur: string }[]; forme?: "carre" | "trait" }) {
  return (
    <ul className={s.legende}>
      {series.map((x) => (
        <li key={x.libelle}>
          <i data-forme={forme} style={{ background: x.couleur }} />
          {x.libelle}
        </li>
      ))}
    </ul>
  );
}

/** Un graphique sans données : la place gardée, la raison dite. */
export function Vide({ texte }: { texte: string }) {
  return (
    <div className={s.vide}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
        <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
      </svg>
      <span>{texte}</span>
    </div>
  );
}

/* ───────── Barres classées (horizontales), valeurs alignées ───────── */
export type Barre = { cle: string; libelle: string; valeur: number; couleur?: string; detail?: string; etiquette?: string; href?: string };

export function BarresClassees({
  barres,
  format,
  vide = "Rien sur la période.",
  disposition = "ligne",
}: {
  barres: Barre[];
  format: (n: number) => string;
  vide?: string;
  /** « pile » : le nom et la valeur sur une ligne, la barre dessous, de toute la largeur (une carte étroite). */
  disposition?: "ligne" | "pile";
}) {
  const max = Math.max(0, ...barres.map((b) => b.valeur));
  if (!barres.length || max <= 0) return <Vide texte={vide} />;
  return (
    <div className={s.barres} data-disposition={disposition} role="list">
      {barres.map((b) => {
        const contenu = (
          <>
            <span className={s.barreNom}>
              {b.couleur && <i style={{ background: b.couleur }} />}
              <span>
                {b.libelle}
                {b.detail && <small>{b.detail}</small>}
              </span>
            </span>
            <span className={s.piste}>
              <i style={{ width: `${Math.max((b.valeur / max) * 100, b.valeur > 0 ? 1.5 : 0)}%`, background: b.couleur ?? UNIQUE }} />
            </span>
            <b className={s.barreValeur}>{b.etiquette ?? format(b.valeur)}</b>
          </>
        );
        const etiquette = `${b.libelle} : ${b.etiquette ?? format(b.valeur)}${b.detail ? `, ${b.detail}` : ""}`;
        return b.href ? (
          <Link key={b.cle} href={b.href} className={`${s.barre} ${s.barreLien}`} role="listitem" aria-label={etiquette}>
            {contenu}
          </Link>
        ) : (
          <div key={b.cle} className={s.barre} role="listitem" aria-label={etiquette}>
            {contenu}
          </div>
        );
      })}
    </div>
  );
}

/* ───────── Barres empilées horizontales (deux séries) ───────── */
export function Empilees({ lignes, series, vide = "Rien sur la période." }: { lignes: { cle: string; libelle: string; parts: number[] }[]; series: { libelle: string; couleur: string }[]; vide?: string }) {
  const max = Math.max(0, ...lignes.map((l) => l.parts.reduce((a, b) => a + b, 0)));
  if (!lignes.length || max <= 0) return <Vide texte={vide} />;
  return (
    <>
      <div className={s.barres} role="list">
        {lignes.map((l) => {
          const total = l.parts.reduce((a, b) => a + b, 0);
          return (
            <div key={l.cle} className={`${s.barre} ${s.cible}`} role="listitem" tabIndex={0} aria-label={`${l.libelle} : ${series.map((x, i) => `${x.libelle} ${l.parts[i]}`).join(", ")}`}>
              <span className={s.barreNom}>
                <span>{l.libelle}</span>
              </span>
              <span className={s.piste}>
                <span className={s.pile} style={{ width: `${(total / max) * 100}%` }}>
                  {l.parts.map((v, i) => (v > 0 ? <i key={i} style={{ flexGrow: v, background: series[i].couleur }} /> : null))}
                </span>
              </span>
              <b className={s.barreValeur}>{nombre(total)}</b>
              <span className={s.bulle}>
                <b>{l.libelle}</b>
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

/* ───────── Entonnoir ───────── */
export type Etape = { cle: string; libelle: string; n: number };

/**
 * Un vrai entonnoir : une cohorte, chaque étape contenue dans la précédente.
 * Des barres centrées, de plus en plus étroites, reliées par leur passage ;
 * entre deux étapes, la part qui passe.
 */
export function Entonnoir({ etapes, vide = "Rien sur la période." }: { etapes: Etape[]; vide?: string }) {
  const max = Math.max(0, ...etapes.map((e) => e.n));
  if (max <= 0) return <Vide texte={vide} />;
  const couleurs = rampe(etapes.length);
  const largeur = (n: number) => (n > 0 ? Math.max(3, (n / max) * 100) : 0);
  return (
    <ol className={s.entonnoir} aria-label="Entonnoir">
      {etapes.map((e, i) => {
        const avant = i > 0 ? etapes[i - 1] : null;
        const w = largeur(e.n);
        const wa = avant ? largeur(avant.n) : 0;
        return (
          <li key={e.cle}>
            {avant && (
              <div className={s.passage} aria-hidden>
                <span className={s.passageFlux}>
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none">
                    <polygon points={`${50 - wa / 2},0 ${50 + wa / 2},0 ${50 + w / 2},10 ${50 - w / 2},10`} fill={couleurs[i - 1]} opacity={0.16} />
                  </svg>
                  <span className={s.taux}>{avant.n > 0 ? pourcent(e.n / avant.n) : "—"}</span>
                </span>
              </div>
            )}
            <div className={`${s.etape} ${s.cible}`} tabIndex={0} aria-label={`${e.libelle} : ${nombre(e.n)}${avant && avant.n > 0 ? `, ${pourcent(e.n / avant.n)} de l'étape précédente` : ""}`}>
              <span className={s.etapeNom}>{e.libelle}</span>
              <span className={s.etapeZone}>
                {e.n > 0 ? <i style={{ width: `${w}%`, background: couleurs[i] }} /> : <i className={s.etapeZero} />}
              </span>
              <b>{nombre(e.n)}</b>
              <span className={s.bulle}>
                <b>{e.libelle}</b>
                <span className={s.bulleLigne}>
                  {nombre(e.n)}
                  <em>{etapes[0].n > 0 ? `${pourcent(e.n / etapes[0].n)} du départ` : ""}</em>
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────── Répartition (une barre segmentée fine, et sa liste) ───────── */
export type Part = { cle: string; libelle: string; n: number; couleur: string; detail?: string };

export function Repartition({ parts, format = nombre, vide = "Rien sur la période.", libelle }: { parts: Part[]; format?: (n: number) => string; vide?: string; libelle: string }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (total <= 0) return <Vide texte={vide} />;
  const visibles = parts.filter((p) => p.n > 0);
  return (
    <div className={s.repartition}>
      <div className={s.segments} role="img" aria-label={`${libelle} : ${visibles.map((p) => `${p.libelle} ${pourcent(p.n / total)}`).join(", ")}`}>
        {visibles.map((p) => (
          <i key={p.cle} style={{ flexGrow: p.n, background: p.couleur }} title={`${p.libelle} : ${format(p.n)} (${pourcent(p.n / total)})`} />
        ))}
      </div>
      <ul className={s.parts}>
        {parts.map((p) => (
          <li key={p.cle} data-zero={p.n === 0 || undefined}>
            <i style={{ background: p.couleur }} />
            <span>
              {p.libelle}
              {p.detail && <small>{p.detail}</small>}
            </span>
            <b>{format(p.n)}</b>
            <em>{pourcent(p.n / total)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── Colonnes (une série, ou deux empilées) ───────── */
export type Colonne = { cle: string; libelle: string; detail: string };
export type SerieColonnes = { libelle: string; couleur: string; valeurs: number[] };

export function Colonnes({
  colonnes,
  series,
  format,
  formatAxe = format,
  retenus,
  couleurs,
  etiquettes = "extremes",
  vide = "Rien sur la période.",
  hauteur = 200,
  complement,
}: {
  colonnes: Colonne[];
  series: SerieColonnes[];
  format: (n: number) => string;
  formatAxe?: (n: number) => string;
  /** Une seule série : les colonnes retenues (la période) en couleur, les autres en retrait. */
  retenus?: boolean[];
  /** Une seule série : une couleur par colonne (des tranches ordonnées). */
  couleurs?: string[];
  /** Les valeurs écrites sur les colonnes : le maximum et la dernière, toutes, ou aucune. */
  etiquettes?: "extremes" | "toutes" | "aucune";
  vide?: string;
  hauteur?: number;
  /** Une ligne de plus dans la bulle (le volume d'un mois…). */
  complement?: (i: number) => string;
}) {
  const totaux = colonnes.map((_, i) => series.reduce((a, se) => a + (se.valeurs[i] ?? 0), 0));
  const max = Math.max(0, ...totaux);
  if (!colonnes.length || max <= 0) return <Vide texte={vide} />;
  const { haut, pas } = graduations(max);
  const iMax = totaux.indexOf(max);
  const n = colonnes.length;
  return (
    <div className={s.colonnes}>
      <div className={s.plan} style={{ height: hauteur }}>
        {pas.map((t) => (
          <span key={t} className={s.filet} style={{ bottom: `${(t / haut) * 100}%` }}>
            <em>{formatAxe(t)}</em>
          </span>
        ))}
        <div className={s.rangee} data-serre={n > 16 || undefined}>
          {colonnes.map((c, i) => {
            const total = totaux[i];
            const ecrit = etiquettes === "toutes" || (etiquettes === "extremes" && (i === iMax || i === n - 1));
            return (
              <div key={c.cle} className={`${s.colonne} ${s.cible}`} tabIndex={0} aria-label={`${c.detail} : ${series.map((se) => `${series.length > 1 ? `${se.libelle} ` : ""}${format(se.valeurs[i] ?? 0)}`).join(", ")}`}>
                <span className={s.pileColonne} style={{ height: `${(total / haut) * 100}%` }}>
                  {series.map((se, k) => {
                    const v = se.valeurs[i] ?? 0;
                    if (v <= 0) return null;
                    const couleur = series.length === 1 ? (couleurs?.[i] ?? (retenus && !retenus[i] ? RETRAIT : se.couleur)) : se.couleur;
                    return <i key={k} style={{ flexGrow: v, background: couleur }} />;
                  })}
                  {ecrit && total > 0 && <em>{format(total)}</em>}
                </span>
                <span className={s.bulle} data-cote={i > n / 2 ? "gauche" : "droite"}>
                  <b>{c.detail}</b>
                  {series.map((se) => (
                    <span key={se.libelle} className={s.bulleLigne}>
                      {series.length > 1 && <i style={{ background: se.couleur }} />}
                      {se.libelle}
                      <em>{format(se.valeurs[i] ?? 0)}</em>
                    </span>
                  ))}
                  {series.length > 1 && (
                    <span className={s.bulleLigne}>
                      Total
                      <em>{format(total)}</em>
                    </span>
                  )}
                  {complement && <span className={`${s.bulleLigne} ${s.bulleSous}`}>{complement(i)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={s.axeColonnes} data-serre={n > 16 || undefined}>
        {colonnes.map((c) => (
          <span key={c.cle}>{c.libelle}</span>
        ))}
      </div>
      {series.length > 1 && <Legende series={[...series].reverse()} />}
    </div>
  );
}

/** Les douze mois d'une série mensuelle, en colonnes (libellé court, année au changement). */
export const colonnesMois = (mois: string[]): Colonne[] => {
  const annees = new Set(mois.map((m) => m.slice(0, 4))).size > 1;
  return mois.map((m) => ({ cle: m, libelle: moisCourt(m, annees && m.endsWith("-01")), detail: moisCourt(m, true) }));
};

/* ───────── Aire mensuelle, et la même un an plus tôt ───────── */
export function Aire({
  mois,
  valeurs,
  libelle,
  comparaison,
  details,
  retenus = [],
  format,
  formatAxe = format,
}: {
  mois: string[];
  valeurs: number[];
  libelle: string;
  /** La même mesure un an plus tôt : une ligne grise, fine. */
  comparaison?: { libelle: string; valeurs: number[] };
  /** Le détail de chaque mois dans la bulle (par commercial…). */
  details?: (i: number) => { libelle: string; couleur: string; valeur: number }[];
  retenus?: boolean[];
  format: (n: number) => string;
  formatAxe?: (n: number) => string;
}) {
  const max = Math.max(0, ...valeurs, ...(comparaison?.valeurs ?? []));
  if (max <= 0) return <Vide texte="Aucun montant sur les douze derniers mois." />;
  const { haut, pas } = graduations(max);
  const n = mois.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => (v / haut) * 100;
  const trace = (vs: number[]) => `M${vs.map((v, i) => `${x(i)} ${100 - y(v)}`).join(" L")}`;
  const annees = new Set(mois.map((m) => m.slice(0, 4))).size > 1;
  const gauche = (i: number) => Math.max(0, x(i - 0.5));
  const large = (i: number) => Math.min(100, x(i + 0.5)) - gauche(i);
  const fin = valeurs[n - 1];
  return (
    <div className={s.aire}>
      <div className={s.plan} style={{ height: 230 }}>
        {pas.map((t) => (
          <span key={t} className={s.filet} style={{ bottom: `${y(t)}%` }}>
            <em>{formatAxe(t)}</em>
          </span>
        ))}
        {/* La période choisie : une seule bande par suite de mois retenus (pas de couture entre deux mois). */}
        {retenus.map((r, i) => {
          if (!r || retenus[i - 1]) return null;
          let j = i;
          while (retenus[j + 1]) j++;
          return <span key={i} className={s.retenu} style={{ left: `${gauche(i)}%`, width: `${gauche(j) + large(j) - gauche(i)}%` }} />;
        })}
        <svg className={s.traits} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={`${trace(valeurs)} L${x(n - 1)} 100 L${x(0)} 100Z`} fill={UNIQUE} opacity={0.1} />
          {comparaison && <path d={trace(comparaison.valeurs)} fill="none" stroke="#a7a3b8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
          <path d={trace(valeurs)} fill="none" stroke={UNIQUE} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <i className={s.point} style={{ left: `${x(n - 1)}%`, bottom: `${y(fin)}%`, background: UNIQUE }} />
        <em className={s.finEtiquette} style={{ bottom: `${y(fin)}%` }}>
          {formatAxe(fin)}
        </em>
        {mois.map((m, i) => (
          <div
            key={m}
            className={`${s.colonneSurvol} ${s.cible}`}
            style={{ left: `${gauche(i)}%`, width: `${large(i)}%` }}
            tabIndex={0}
            aria-label={`${moisCourt(m, true)} : ${libelle} ${format(valeurs[i])}${comparaison ? `, ${comparaison.libelle} ${format(comparaison.valeurs[i])}` : ""}`}
          >
            <span className={s.visee} style={{ left: `${((x(i) - gauche(i)) / large(i)) * 100}%` }}>
              <i style={{ bottom: `${y(valeurs[i])}%`, background: UNIQUE }} />
              {comparaison && <i style={{ bottom: `${y(comparaison.valeurs[i])}%`, background: "#a7a3b8" }} />}
            </span>
            <span className={s.bulle} data-cote={i > n / 2 ? "gauche" : "droite"}>
              <b>{moisCourt(m, true)}</b>
              <span className={s.bulleLigne}>
                <i data-forme="trait" style={{ background: UNIQUE }} />
                {libelle}
                <em>{format(valeurs[i])}</em>
              </span>
              {details?.(i)
                .filter((d) => d.valeur > 0)
                .map((d) => (
                  <span key={d.libelle} className={`${s.bulleLigne} ${s.bulleSous}`}>
                    <i style={{ background: d.couleur }} />
                    {d.libelle}
                    <em>{format(d.valeur)}</em>
                  </span>
                ))}
              {comparaison && (
                <span className={s.bulleLigne}>
                  <i data-forme="trait" style={{ background: "#a7a3b8" }} />
                  {comparaison.libelle}
                  <em>{format(comparaison.valeurs[i])}</em>
                </span>
              )}
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
      <Legende forme="trait" series={[{ libelle, couleur: UNIQUE }, ...(comparaison ? [{ libelle: comparaison.libelle, couleur: "#a7a3b8" }] : [])]} />
    </div>
  );
}

/* ───────── Chiffres (un état, en quelques valeurs) ───────── */
export function Chiffres({ items }: { items: { label: string; valeur: string; detail?: string }[] }) {
  return (
    <dl className={s.chiffres}>
      {items.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd>
            {it.valeur}
            {it.detail && <small>{it.detail}</small>}
          </dd>
        </div>
      ))}
    </dl>
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

