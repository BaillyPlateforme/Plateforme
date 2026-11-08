import Link from "next/link";
import { Icone, type NomIcone } from "@/ui/icones";
import { RETRAIT, UNIQUE } from "./palette";
import s from "./statistiques.module.css";

/*
 * Le cadre commun des Statistiques et d'À la une (une seule famille, pour
 * que les deux se lisent comme un seul produit) :
 *
 * - Grille : douze colonnes ; dans une rangée, les cartes ont la même
 *   hauteur (le pied de chacune descend au bas) ;
 * - Carte : titre, sous-titre, lien vers la vue détaillée, le graphique,
 *   et une note de pied ;
 * - Tuiles et Tuile : une rangée de chiffres de même taille — libellé,
 *   valeur, écart avec la période d'avant (flèche et signe, jamais la
 *   couleur seule), la valeur d'avant nommée, et douze petites colonnes
 *   (les douze derniers mois, ceux de la période en indigo).
 */

/* ───────── Grille et cartes ───────── */
export function Grille({ children }: { children: React.ReactNode }) {
  return <div className={s.grille}>{children}</div>;
}

type Largeur = 3 | 4 | 5 | 6 | 7 | 8 | 12;

export function Carte({
  titre,
  sousTitre,
  lien,
  pied,
  largeur = 12,
  serree = false,
  haut = false,
  children,
}: {
  titre: React.ReactNode;
  sousTitre?: React.ReactNode;
  lien?: { href: string; label: string };
  pied?: React.ReactNode;
  largeur?: Largeur;
  /** Sans marge intérieure : un tableau bord à bord. */
  serree?: boolean;
  /** Le contenu en haut de la carte (une liste), au lieu d'être centré dans la hauteur de la rangée (un graphique). */
  haut?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`${s.carte} ${serree ? s.carteSerree : ""} ${haut ? s.carteHaut : ""}`} data-largeur={largeur}>
      <header className={s.carteTete}>
        <div>
          <h3>{titre}</h3>
          {sousTitre && <p>{sousTitre}</p>}
        </div>
        {lien && (
          <Link href={lien.href} className={s.voir}>
            {lien.label}
            <Icone nom="chevron" taille={14} />
          </Link>
        )}
      </header>
      <div className={s.corps}>{children}</div>
      {pied && <footer className={s.pied}>{pied}</footer>}
    </section>
  );
}

/** « Comment lire ces chiffres », sous la grille. */
export function Note({ children }: { children: React.ReactNode }) {
  return <p className={s.note}>{children}</p>;
}

/* ───────── Tuiles ───────── */
export function Tuiles({ children, chevauche = false, colonnes }: { children: React.ReactNode; /** Posées à cheval sur le bas du bandeau (un tableau de bord). */ chevauche?: boolean; colonnes?: number }) {
  return (
    <div className={`${s.tuiles} ${chevauche ? `chevauche ${s.chevauche}` : ""}`} data-n={colonnes} style={colonnes ? ({ "--colonnes": colonnes } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}

/** L'écart d'une tuile avec la période d'avant. */
export type Ecart = {
  /** La valeur d'avant (null : pas calculable, rien n'est affiché). */
  avant: number | null;
  /** La valeur comparée (la période arrêtée à aujourd'hui quand elle est « à date »). */
  courant: number | null;
  /** « vs octobre », « vs 2025 à date ». */
  libelle: string;
  /** Les dates exactes de la période d'avant, dans la bulle de la ligne. */
  precis?: string;
  format: (n: number) => string;
  /** Une baisse est-elle la bonne nouvelle (un coût) ? */
  baisseBonne?: boolean;
  /** Un taux (0 à 1) : l'écart se dit en points, pas en pour cent. */
  taux?: boolean;
  /** La valeur comparée diffère de la valeur affichée (le planning à venir n'est pas comparé) : on la dit. */
  aDate?: boolean;
};

const ENTIER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function Delta({ e }: { e: Ecart }) {
  if (e.avant == null || e.courant == null) return null;
  let v: number;
  let texte: string;
  if (e.taux) {
    v = Math.round((e.courant - e.avant) * 100);
    texte = `${ENTIER.format(Math.abs(v))} pt${Math.abs(v) > 1 ? "s" : ""}`;
  } else {
    if (e.avant === 0) return null;
    v = Math.round(((e.courant - e.avant) / e.avant) * 100);
    // Au-delà de dix fois, un pourcentage ne se lit plus (« +7 900 % ») : on dit le multiple.
    texte = e.courant / e.avant >= 10 ? `×${ENTIER.format(Math.round(e.courant / e.avant))}` : `${ENTIER.format(Math.abs(v))} %`;
  }
  const sens = v > 0 ? "hausse" : v < 0 ? "baisse" : "stable";
  const bon = sens === "stable" ? undefined : (sens === "hausse") !== !!e.baisseBonne;
  return (
    <span className={s.delta} data-sens={sens} data-bon={bon === undefined ? undefined : String(bon)}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        {sens === "stable" ? <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d={sens === "hausse" ? "M5 1.5 9 7.5H1z" : "M5 8.5 1 2.5h8z"} fill="currentColor" />}
      </svg>
      <span className={s.masque}>{sens === "hausse" ? "En hausse de " : sens === "baisse" ? "En baisse de " : "Stable, "}</span>
      {sens === "stable" ? "=" : texte}
    </span>
  );
}

/** Douze petites colonnes : les douze derniers mois, ceux de la période en indigo. */
export function Etincelle({ valeurs, retenus = [], libelle }: { valeurs: number[]; retenus?: boolean[]; libelle: string }) {
  const max = Math.max(0, ...valeurs);
  return (
    <span className={s.etincelle} role="img" aria-label={libelle}>
      {valeurs.map((v, i) => (
        <i key={i} style={{ height: max > 0 ? `${Math.max(v > 0 ? 8 : 0, (v / max) * 100)}%` : 0, background: retenus[i] ? UNIQUE : RETRAIT }} />
      ))}
    </span>
  );
}

export function Tuile({
  label,
  valeur,
  icone,
  ecart,
  detail,
  tendance,
  href,
  ton,
  jauge,
  note,
}: {
  label: string;
  valeur: string;
  icone?: NomIcone;
  ecart?: Ecart;
  /** Une ligne de plus, courte : « 73 dossiers signés ». */
  detail?: React.ReactNode;
  /** Les douze derniers mois. */
  tendance?: { valeurs: number[]; retenus?: boolean[]; libelle: string };
  href?: string;
  /** Une tuile d'alerte (des demandes attendent) : l'icône et la jauge passent à l'ambre. */
  ton?: "ambre";
  /** Un état du jour, part d'un tout : une jauge au bas de la tuile (à la place des douze mois). */
  jauge?: { part: number; libelle: string };
  /** Une ligne discrète sous le détail : « 6,3 k€ d'estimations en jeu ». */
  note?: string;
}) {
  const corps = (
    <>
      <span className={s.tuileTete}>
        {icone && (
          <i className={s.tuileIcone} data-ton={ton}>
            <Icone nom={icone} taille={14} />
          </i>
        )}
        <small>{label}</small>
      </span>
      <b className={s.tuileValeur}>{valeur}</b>
      {detail && <span className={s.tuileDetail}>{detail}</span>}
      {ecart && (
        <span className={s.tuileEcart} title={ecart.precis ? `Période d'avant : ${ecart.precis}` : undefined}>
          <Delta e={ecart} />
          <span>
            {ecart.aDate && ecart.courant != null ? `${ecart.format(ecart.courant)} à ce jour, ` : ""}
            {`${ecart.libelle} : ${ecart.avant == null ? "—" : ecart.format(ecart.avant)}`}
          </span>
        </span>
      )}
      {note && <span className={s.tuileEcart}>{note}</span>}
      {tendance && <Etincelle {...tendance} />}
      {jauge && (
        <span className={s.tuileJauge} data-ton={ton}>
          <span role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(jauge.part * 100)} aria-label={jauge.libelle}>
            <i style={{ width: `${Math.min(100, Math.max(jauge.part > 0 ? 2 : 0, jauge.part * 100))}%` }} />
          </span>
          <small>{jauge.libelle}</small>
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={`${s.tuile} ${s.tuileLien}`}>
      {corps}
    </Link>
  ) : (
    <div className={s.tuile}>{corps}</div>
  );
}
