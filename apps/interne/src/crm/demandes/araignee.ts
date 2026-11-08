import { SANS_PRIX, type Parcours } from "@/lib/parcours";

/*
 * L'araignée d'une demande (Demandes › Top demandes, carte Évaluation d'une
 * demande) : six axes, chacun de 0 (au centre) à 100 (au bord), toujours
 * « plus loin du centre = mieux ». Chaque valeur vient de la base ou d'une
 * donnée publique ; rien n'est inventé, et chaque règle se lit dans AXES.
 *
 * Module pur : le serveur calcule (donnees.ts), le navigateur dessine.
 */

export type CleAxe = "potentiel" | "facilite" | "prestige" | "volume" | "montant" | "completude";

/** Les six axes : leur libellé, leur couleur (une par axe, dans la palette) et leur règle. */
export const AXES: { cle: CleAxe; label: string; couleur: string; regle: string }[] = [
  { cle: "potentiel", label: "Potentiel", couleur: "#4b2fe0", regle: "La note de potentiel de la qualification, sur 100." },
  { cle: "facilite", label: "Facilité", couleur: "#14c27d", regle: "100 moins la note de difficulté : plus le déménagement est facile, plus le point s'éloigne du centre." },
  {
    cle: "prestige",
    label: "Prestige",
    couleur: "#f59e0b",
    regle:
      "Le prix médian au m² des logements vendus dans la commune (DVF 2021–2025), rangé parmi les ventes de toute la France : 82 = plus cher que là où se sont faites 82 % des ventes. La plus haute des deux communes, départ ou arrivée.",
  },
  { cle: "volume", label: "Volume", couleur: "#0ea5e9", regle: "Le rang du volume parmi ceux des demandes reçues : 0 pour le plus petit, 100 pour le plus grand." },
  { cle: "montant", label: "Montant", couleur: "#7a52ff", regle: "Le rang de l'estimation du site parmi celles des demandes reçues. Sans objet pour un parcours sans prix (mutation, entreprise)." },
  {
    cle: "completude",
    label: "Complétude",
    couleur: "#e1306c",
    regle: "La part des huit informations utiles renseignées : nom, e-mail, téléphone, ville de départ, ville d'arrivée, une adresse précise, volume (sauf parcours sans volume), date souhaitée.",
  },
];

/** Le prestige d'une commune, et ce sur quoi il repose. */
export type Prestige = { score: number | null; prix: number; commune: string; ventes: number; periode: string; ou: "départ" | "arrivée" };

export type Araignee = { valeurs: Record<CleAxe, number | null>; prestige: Prestige | null };

/** Le rang centile d'une valeur parmi d'autres (0 à 100 ; les ex æquo comptent pour moitié). */
export function rangCentile(toutes: number[]): (v: number | null) => number | null {
  const tri = [...toutes].sort((a, b) => a - b);
  const n = tri.length;
  return (v) => {
    if (v == null || !n) return null;
    let bas = 0;
    let egaux = 0;
    for (const x of tri) {
      if (x < v) bas++;
      else if (x === v) egaux++;
    }
    return n === 1 ? 100 : Math.round((100 * (bas + egaux / 2)) / n);
  };
}

export type ChampsCompletude = {
  client: string | null;
  email: string | null;
  telephone: string | null;
  depart: string | null;
  arrivee: string | null;
  departAdresse: string | null;
  arriveeAdresse: string | null;
  volume: number | null;
  dateSouhaitee: string | null;
  parcours: Parcours;
};

/** Les huit informations utiles d'une demande, et si elles sont renseignées. */
function champsUtiles(d: ChampsCompletude): { label: string; ok: boolean }[] {
  const plein = (v: unknown) => v != null && String(v).trim() !== "";
  return [
    { label: "nom", ok: plein(d.client) },
    { label: "e-mail", ok: plein(d.email) },
    { label: "téléphone", ok: plein(d.telephone) },
    { label: "ville de départ", ok: plein(d.depart) },
    { label: "ville d'arrivée", ok: plein(d.arrivee) },
    { label: "adresse précise", ok: plein(d.departAdresse) || plein(d.arriveeAdresse) },
    { label: "volume", ok: SANS_PRIX.has(d.parcours) || (d.volume != null && d.volume > 0) },
    { label: "date souhaitée", ok: plein(d.dateSouhaitee) },
  ];
}

/** La complétude : la part des huit informations utiles renseignées. */
export function completude(d: ChampsCompletude): number {
  const champs = champsUtiles(d);
  return Math.round((100 * champs.filter((c) => c.ok).length) / champs.length);
}

/** Ce qui manque à la complétude : « adresse précise », « date souhaitée »… */
export const manques = (d: ChampsCompletude) => champsUtiles(d).filter((c) => !c.ok).map((c) => c.label);

export function araigneeDe(
  d: ChampsCompletude & { potentiel: number | null; difficulte: number | null; estimation: number | null },
  rangs: { volume: (v: number | null) => number | null; montant: (v: number | null) => number | null },
  prestige: Prestige | null,
): Araignee {
  return {
    valeurs: {
      potentiel: d.potentiel,
      facilite: d.difficulte == null ? null : Math.max(0, Math.min(100, 100 - d.difficulte)),
      prestige: prestige?.score ?? null,
      volume: rangs.volume(d.volume != null && d.volume > 0 ? d.volume : null),
      montant: SANS_PRIX.has(d.parcours) ? null : rangs.montant(d.estimation),
      completude: completude(d),
    },
    prestige,
  };
}

const eurM2 = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} €/m²`;

/** « Prestige 82/100 · 4 298 €/m² médian (DVF 2021–2025, Palaiseau) ». */
export function basePrestige(p: Prestige | null): string {
  if (!p) return "Prestige inconnu : commune non reconnue";
  const score = p.score == null ? "Prestige non noté (moins de 5 ventes)" : `Prestige ${p.score}/100`;
  return `${score} · ${eurM2(p.prix)} médian (DVF ${p.periode}, ${p.commune})`;
}
