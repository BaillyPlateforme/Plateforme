/*
 * Les périodes des pages de statistiques, en jours du calendrier de Paris :
 * un début compris, une fin exclue (AAAA-MM-JJ). « 12 mois glissants » part du
 * premier jour du mois, onze mois en arrière, pour que chaque mois de la série
 * soit entier. Les courbes mensuelles couvrent toujours les 12 derniers mois.
 */

export type ClePeriode = "mois" | "mois-dernier" | "trimestre" | "annee" | "12-mois";
export type Periode = { cle: ClePeriode; libelle: string; debut: string; fin: string; phrase: string };

export const PERIODES: { cle: ClePeriode; libelle: string }[] = [
  { cle: "mois", libelle: "Ce mois" },
  { cle: "mois-dernier", libelle: "Mois dernier" },
  { cle: "trimestre", libelle: "Trimestre" },
  { cle: "annee", libelle: "Année" },
  { cle: "12-mois", libelle: "12 mois glissants" },
];
export const PERIODE_PAR_DEFAUT: ClePeriode = "annee";

const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Aujourd'hui à Paris : [année, mois de 1 à 12]. */
function maintenant(): [number, number] {
  const [a, m] = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).split("-").map(Number);
  return [a, m];
}

/** Le premier jour d'un mois, décalé de `n` mois (mois de 1 à 12). */
function premier(a: number, m: number, n = 0) {
  const t = a * 12 + (m - 1) + n;
  const aa = Math.floor(t / 12);
  const mm = (t % 12) + 1;
  return `${aa}-${String(mm).padStart(2, "0")}-01`;
}

export const estPeriode = (v: unknown): v is ClePeriode => PERIODES.some((p) => p.cle === v);

export function periodeDe(cle: unknown): Periode {
  const c = estPeriode(cle) ? cle : PERIODE_PAR_DEFAUT;
  const [a, m] = maintenant();
  const libelle = PERIODES.find((p) => p.cle === c)!.libelle;
  switch (c) {
    case "mois":
      return { cle: c, libelle, debut: premier(a, m), fin: premier(a, m, 1), phrase: `${MOIS_LONGS[m - 1]} ${a}` };
    case "mois-dernier": {
      const d = premier(a, m, -1);
      const mm = Number(d.slice(5, 7));
      return { cle: c, libelle, debut: d, fin: premier(a, m), phrase: `${MOIS_LONGS[mm - 1]} ${d.slice(0, 4)}` };
    }
    case "trimestre": {
      const t = Math.floor((m - 1) / 3);
      return { cle: c, libelle, debut: premier(a, t * 3 + 1), fin: premier(a, t * 3 + 1, 3), phrase: `${t + 1}ᵉ trimestre ${a}` };
    }
    case "annee":
      return { cle: c, libelle, debut: `${a}-01-01`, fin: `${a + 1}-01-01`, phrase: `année ${a}` };
    case "12-mois":
      return { cle: c, libelle, debut: premier(a, m, -11), fin: premier(a, m, 1), phrase: "12 derniers mois" };
  }
}

/** Les 12 derniers mois, celui en cours compris : leurs clés AAAA-MM et leurs bornes. */
export function douzeMois() {
  const [a, m] = maintenant();
  const mois = Array.from({ length: 12 }, (_, i) => premier(a, m, i - 11).slice(0, 7));
  return { mois, debut: `${mois[0]}-01`, fin: premier(a, m, 1) };
}

/** « 2026-03 » → « mars » (ou « mars 26 » quand l'année change dans la série). */
export function moisCourt(cle: string, avecAnnee = false) {
  const m = Number(cle.slice(5, 7));
  return avecAnnee ? `${MOIS_COURTS[m - 1]} ${cle.slice(2, 4)}` : MOIS_COURTS[m - 1];
}

/** Le mois de la clé est-il dans la période ? (pour teinter les mois retenus dans une série). */
export const moisDansPeriode = (cle: string, p: Periode) => `${cle}-01` >= p.debut && `${cle}-01` < p.fin;
