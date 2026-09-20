import "server-only";
import { listRequests } from "@/lib/requests";
import { listDevis } from "@/lib/devis";
import type { DevisRow, RequestRow } from "@/lib/types";
import { TONS } from "@/app/dashboard/tableau-de-bord/tons";

/**
 * Agrégats du tableau de bord.
 *
 * Sortis de la page pour être servis par `/api/data/tableau-de-bord` : l'écran
 * se dessine d'abord, les chiffres arrivent ensuite. Aucune JSX ici — tout
 * doit pouvoir traverser une frontière HTTP, les icônes comprises, réduites à
 * une clé que la page traduit en dessin.
 */
const JOUR = 86_400_000;
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur = (n: number) =>
  n >= 1000 ? `${nf.format(Math.round(n / 100) / 10)} k€` : `${nf.format(n)} €`;
const moisCourt = new Intl.DateTimeFormat("fr-FR", { month: "short" });

const somme = (rs: RequestRow[], f: (r: RequestRow) => number | null) =>
  rs.reduce((s, r) => s + (f(r) ?? 0), 0);

const QUALIFIEES = ["qualified", "quoted", "won"];

/** Fenêtre d'observation : assez large pour couvrir un cycle de demandes. */
const FENETRE = 90;

export async function preparerTableauDeBord() {
  let requests: RequestRow[] = [];
  let devis: DevisRow[] = [];
  try {
    [requests, devis] = await Promise.all([listRequests(), listDevis()]);
  } catch {
    /* base indisponible : la page s'affiche à zéro plutôt que de planter */
  }

  const now = Date.now();
  const depuis = (n: number) => requests.filter((r) => +new Date(r.created_at) >= now - n * JOUR);
  const entre = (a: number, b: number) =>
    requests.filter((r) => {
      const t = +new Date(r.created_at);
      return t >= now - a * JOUR && t < now - b * JOUR;
    });

  const mois = depuis(FENETRE);
  const moisPrec = entre(FENETRE * 2, FENETRE);
  // Sans période précédente, une variation de « +100 % » ne veut rien dire.
  const delta = (a: number, b: number): number | null =>
    b === 0 ? null : Math.round(((a - b) / b) * 100);

  const clients = (rs: RequestRow[]) => new Set(rs.map((r) => r.client_email).filter(Boolean)).size;

  const tuiles = [
    {
      valeur: nf.format(mois.length),
      label: "Demandes reçues",
      delta: delta(mois.length, moisPrec.length),
      fond: "#ffe2e5",
      pastille: "#fa5a7d",
      icone: "inbox",
    },
    {
      valeur: eur(somme(mois, (r) => r.estimation_prix)),
      label: "Estimations cumulées",
      delta: delta(somme(mois, (r) => r.estimation_prix), somme(moisPrec, (r) => r.estimation_prix)),
      fond: "#fff4de",
      pastille: "#ff947a",
      icone: "euro",
    },
    {
      valeur: `${nf.format(somme(mois, (r) => r.volume_m3))} m³`,
      label: "Volume à déménager",
      delta: delta(somme(mois, (r) => r.volume_m3), somme(moisPrec, (r) => r.volume_m3)),
      fond: "#dcfce7",
      pastille: "#3cd856",
      icone: "box",
    },
    {
      valeur: nf.format(clients(mois)),
      label: "Nouveaux clients",
      delta: delta(clients(mois), clients(moisPrec)),
      fond: "#f3e8ff",
      pastille: "#bf83ff",
      icone: "user",
    },
  ];

  // ── Flux des demandes, 12 derniers mois ──
  const moisSerie = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i), 1);
    return d;
  });
  const dansMois = (r: RequestRow, d: Date) => {
    const t = new Date(r.created_at);
    return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
  };
  const fluxLabels = moisSerie.map((d) => moisCourt.format(d).replace(".", ""));
  const flux = [
    {
      label: "Reçues",
      color: TONS.violet,
      data: moisSerie.map((d) => requests.filter((r) => dansMois(r, d)).length),
    },
    {
      label: "Qualifiées",
      color: TONS.vert,
      data: moisSerie.map(
        (d) => requests.filter((r) => dansMois(r, d) && QUALIFIEES.includes(r.status)).length,
      ),
    },
    {
      label: "Devisées",
      color: TONS.rouge,
      data: moisSerie.map(
        (d) => requests.filter((r) => dansMois(r, d) && ["quoted", "won"].includes(r.status)).length,
      ),
    },
  ];

  // ── Estimations par jour de la semaine, par origine ──
  const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const indexJour = (r: RequestRow) => (new Date(r.created_at).getDay() + 6) % 7;
  const parJour = (source: RequestRow["source"]) =>
    JOURS.map((_, i) =>
      Math.round(
        somme(
          requests.filter((r) => r.source === source && indexJour(r) === i),
          (r) => r.estimation_prix,
        ),
      ),
    );
  const revenus = [
    { label: "Formulaire", color: TONS.bleu, data: parJour("form") },
    { label: "E-mail", color: TONS.vert, data: parJour("email") },
  ];

  // ── Rythme hebdomadaire sur la fenêtre : reçues contre qualifiées ──
  const SEMAINES = 12;
  const semaine = (i: number) => entre((SEMAINES - i) * 7, (SEMAINES - i - 1) * 7);
  const semaines = [
    {
      label: "Reçues",
      color: TONS.bleu,
      data: Array.from({ length: SEMAINES }, (_, i) => semaine(i).length),
    },
    {
      label: "Qualifiées",
      color: TONS.vert,
      data: Array.from({ length: SEMAINES }, (_, i) =>
        semaine(i).filter((r) => QUALIFIEES.includes(r.status)).length,
      ),
    },
  ];
  const totalRecues = semaines[0].data.reduce((a, b) => a + b, 0);
  const totalQualifiees = semaines[1].data.reduce((a, b) => a + b, 0);

  // ── Reçues vs qualifiées, 7 derniers mois ──
  const sept = moisSerie.slice(-7);
  const objectif = [
    {
      label: "Qualifiées",
      color: TONS.sapin,
      data: sept.map(
        (d) => requests.filter((r) => dansMois(r, d) && QUALIFIEES.includes(r.status)).length,
      ),
    },
    {
      label: "Reçues",
      color: TONS.jaune,
      data: sept.map((d) => requests.filter((r) => dansMois(r, d)).length),
    },
  ];

  // ── Top villes de départ ──
  const villes = Object.entries(
    requests.reduce<Record<string, number>>((acc, r) => {
      const v = (r.depart_ville ?? "").trim();
      if (v) acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const villeMax = villes[0]?.[1] ?? 1;
  const tons = [TONS.bleu, TONS.vert, TONS.violet, "#f59e0b", TONS.rouge];

  // ── Départements ──
  const deps = Object.entries(
    requests.reduce<Record<string, number>>((acc, r) => {
      const cp = (r.depart_code_postal ?? "").trim();
      if (cp.length >= 2) {
        const d = cp.slice(0, 2);
        acc[d] = (acc[d] ?? 0) + 1;
      }
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const depMax = deps[0]?.[1] ?? 1;

  // ── Volume traité, 6 derniers mois ──
  const six = moisSerie.slice(-6);
  const volQualifie = six.map((d) =>
    Math.round(somme(requests.filter((r) => dansMois(r, d) && QUALIFIEES.includes(r.status)), (r) => r.volume_m3)),
  );
  const volAttente = six.map((d) =>
    Math.round(somme(requests.filter((r) => dansMois(r, d) && !QUALIFIEES.includes(r.status)), (r) => r.volume_m3)),
  );

  const etiquette = (d: Date) => moisCourt.format(d).replace(".", "");

  return {
    requests, devis, tuiles, fluxLabels, flux, JOURS, revenus, semaines, SEMAINES,
    totalRecues, totalQualifiees, objectif, villes, villeMax, tons, deps, depMax,
    volQualifie, volAttente,
    septLabels: sept.map(etiquette),
    sixLabels: six.map(etiquette),
  };
}

