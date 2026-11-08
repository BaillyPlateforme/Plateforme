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

/* ───────── Comparaison avec la période précédente ───────── */

/** Aujourd'hui à Paris, AAAA-MM-JJ. */
export const aujourdhuiParis = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

/** Un jour AAAA-MM-JJ décalé de `n` jours. */
export function plusJours(jour: string, n: number) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const plusMois = (jour: string, n: number) => premier(Number(jour.slice(0, 4)), Number(jour.slice(5, 7)), n);
const ecart = (a: string, b: string) => Math.round((+new Date(`${b}T12:00:00Z`) - +new Date(`${a}T12:00:00Z`)) / 86_400_000);
const DUREE: Record<ClePeriode, number> = { mois: 1, "mois-dernier": 1, trimestre: 3, annee: 12, "12-mois": 12 };
const jourCourt = (jour: string, annee: boolean) => {
  const [a, m, j] = jour.split("-").map(Number);
  return `${j === 1 ? "1er" : j} ${MOIS_COURTS[m - 1]}${annee ? ` ${a}` : ""}`;
};

/** Deux bornes, début compris, fin exclue (AAAA-MM-JJ). */
export type Intervalle = { debut: string; fin: string };

export type Comparaison = {
  /** La période choisie, telle qu'on la compare (arrêtée à aujourd'hui quand elle est « à date »). */
  courante: Intervalle;
  /** La période d'avant, de même longueur. */
  precedente: Intervalle;
  /** « vs octobre », « vs 2025 à date », « vs T3 à date ». */
  libelle: string;
  /** « du 1er janv. au 8 nov. 2025 ». */
  precis: string;
};

/**
 * La période d'avant, pour les écarts des tuiles.
 *
 * - « à date » : une période en cours (ce mois, ce trimestre, cette année)
 *   se compare à la précédente arrêtée au même point — 1er–8 nov. contre
 *   1er–8 oct. —, sinon chaque écart serait faussement en baisse. Pour ce qui
 *   ne se date que dans le passé (signatures, demandes reçues).
 * - « entière » : la période d'avant tout entière. Pour ce qui se date aussi
 *   dans l'avenir (déménagements planifiés, CA rattaché au déménagement) :
 *   le mois en cours, planning compris, contre le mois dernier.
 */
export function comparaisonDe(p: Periode, mode: "a-date" | "entiere"): Comparaison {
  const n = DUREE[p.cle];
  const demain = plusJours(aujourdhuiParis(), 1);
  const enCours = p.fin > demain;
  const avant: Intervalle = { debut: plusMois(p.debut, -n), fin: plusMois(p.fin, -n) };
  let courante: Intervalle = { debut: p.debut, fin: p.fin };
  let precedente = avant;
  if (mode === "a-date" && enCours) {
    courante = { debut: p.debut, fin: demain };
    const fin = plusJours(avant.debut, ecart(p.debut, demain));
    precedente = { debut: avant.debut, fin: fin < avant.fin ? fin : avant.fin };
  }
  // Le libellé, court (il tient dans une tuile) : la période d'avant par son nom, « à date » quand elle est arrêtée au même point.
  const aDate = precedente.fin !== avant.fin;
  const annee = avant.debut.slice(0, 4);
  const nomMois = MOIS_LONGS[Number(avant.debut.slice(5, 7)) - 1];
  const nom: Record<ClePeriode, string> = {
    mois: aDate ? `${MOIS_COURTS[Number(avant.debut.slice(5, 7)) - 1]}` : nomMois,
    "mois-dernier": `${nomMois}${annee !== aujourdhuiParis().slice(0, 4) ? ` ${annee}` : ""}`,
    trimestre: `T${Math.floor((Number(avant.debut.slice(5, 7)) - 1) / 3) + 1}${annee !== p.debut.slice(0, 4) ? ` ${annee}` : ""}`,
    annee: annee,
    "12-mois": "un an plus tôt",
  };
  const libelle = `vs ${nom[p.cle]}${aDate && p.cle !== "12-mois" ? " à date" : ""}`;
  // Les dates exactes, pour la bulle : « du 1er janv. au 8 nov. 2025 ».
  const dernier = plusJours(precedente.fin, -1);
  const precis = `du ${jourCourt(precedente.debut, precedente.debut.slice(0, 4) !== dernier.slice(0, 4))} au ${jourCourt(dernier, true)}`;
  return { courante, precedente, libelle, precis };
}

/* ───────── Découpage d'une période (les colonnes d'un flux) ───────── */

export type Creneau = Intervalle & { cle: string; libelle: string; detail: string };

/**
 * Les créneaux d'une période, jusqu'à aujourd'hui : les jours d'un mois, les
 * semaines (du lundi) d'un trimestre, les mois d'une année. Une colonne par
 * créneau, toujours lisible (31 au plus).
 */
export function creneauxDe(p: Periode): Creneau[] {
  const demain = plusJours(aujourdhuiParis(), 1);
  const fin = p.fin < demain ? p.fin : demain;
  const out: Creneau[] = [];
  if (p.cle === "mois" || p.cle === "mois-dernier") {
    for (let j = p.debut; j < fin; j = plusJours(j, 1)) {
      const n = Number(j.slice(8, 10));
      out.push({ cle: j, debut: j, fin: plusJours(j, 1), libelle: n === 1 || n % 5 === 0 ? String(n) : "", detail: jourCourt(j, false) });
    }
  } else if (p.cle === "trimestre") {
    // Des semaines du lundi au dimanche, la première et la dernière coupées aux bornes.
    let j = p.debut;
    while (j < fin) {
      const jourSemaine = (new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7;
      const suivant = plusJours(j, 7 - jourSemaine);
      const f = suivant < fin ? suivant : fin;
      out.push({ cle: j, debut: j, fin: f, libelle: jourCourt(j, false).replace(/\.$/, ""), detail: `semaine du ${jourCourt(j, false)}` });
      j = f;
    }
  } else {
    for (let j = p.debut; j < fin; j = plusMois(j, 1)) {
      const cle = j.slice(0, 7);
      const f = plusMois(j, 1);
      out.push({ cle, debut: j, fin: f < fin ? f : fin, libelle: moisCourt(cle, p.cle === "12-mois" && cle.endsWith("-01")), detail: `${MOIS_LONGS[Number(cle.slice(5, 7)) - 1]} ${cle.slice(0, 4)}` });
    }
  }
  return out;
}
