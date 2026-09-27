// ============================================================
// Moteur de calcul — il applique la grille de `grille.ts`.
//
// Principe : le transport se lit dans la matrice de la formule, à
// l'intersection de la tranche de volume et de la tranche de distance. La
// première tranche donne un FORFAIT ; les autres, un prix au m³ à multiplier
// par le volume. Tout le reste vient s'ajouter en suppléments, chacun sur sa
// propre ligne.
//
// Le moteur ne devine rien : ce qu'il ne sait pas, il le remonte dans
// `alertes` pour que l'équipe tranche, plutôt que de facturer à l'aveugle.
// ============================================================

import {
  SUPPLEMENTS,
  TARIFS,
  TRANCHES_DISTANCE,
  TRANCHES_VOLUME,
  TVA_DEFAUT,
  type Formule,
} from "./grille";
import type { RequestRow } from "@/lib/types";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Nombres à la française dans les libellés : ils finissent sur le devis. */
const nb = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export interface SimulationInput {
  formule: Formule;
  volume_m3: number;
  distance_km: number;
  /** Date imposée par le client : majoration du transport. */
  voyage_special?: boolean;
  /** Distance camion → accès, en mètres, de chaque côté. */
  portage_depart_m?: number;
  portage_arrivee_m?: number;
  /** Navette quand le porteur ne peut pas se positionner. */
  transbordement?: boolean;
  /** Nombre de mises en œuvre du monte-meubles (départ et/ou arrivée). */
  monte_meubles?: number;
  piano_droit?: number;
  charges_lourdes?: number;
  /** Valeur déclarée du mobilier, en € : sert à la garantie nationale. */
  valeur_declaree?: number;
  tva?: number;
}

export interface LigneDevis {
  label: string;
  detail?: string;
  amount: number;
}

export interface Simulation {
  lines: LigneDevis[];
  transport: number;
  supplements: number;
  ht: number;
  tva: number;
  ttc: number;
  /** Ce que le moteur a lu dans la grille, pour pouvoir le montrer. */
  /** Valeur de la case : un forfait en euros, ou un prix au m³. */
  valeur_case: number;
  est_forfait: boolean;
  /** Prix au m³ appliqué — zéro quand la tranche est au forfait. */
  tarif_m3: number;
  tranche_volume: string;
  tranche_distance: string;
  index_volume: number;
  index_distance: number;
  /** Points à trancher par l'équipe avant d'envoyer le devis. */
  alertes: string[];
  /** Mentions à reporter sur le devis, sans incidence sur le montant. */
  mentions: string[];
}

/** Tranche de volume : la première dont le plafond couvre le volume. */
export function indexVolume(volume: number): number {
  const i = TRANCHES_VOLUME.findIndex((t) => t.max === null || volume <= t.max);
  return i === -1 ? TRANCHES_VOLUME.length - 1 : i;
}

/** Tranche de distance : idem, la dernière absorbe tout ce qui dépasse. */
export function indexDistance(km: number): number {
  const i = TRANCHES_DISTANCE.findIndex((t) => km <= t.max);
  return i === -1 ? TRANCHES_DISTANCE.length - 1 : i;
}

/** Ce que la grille donne pour un chantier : un forfait, ou un prix au m³. */
export function caseGrille(formule: Formule, volume: number, km: number) {
  const iv = indexVolume(volume);
  return {
    valeur: TARIFS[formule][indexDistance(km)][iv],
    forfait: TRANCHES_VOLUME[iv].forfait,
  };
}

export function simuler(input: SimulationInput): Simulation {
  const volume = Math.max(0, input.volume_m3 || 0);
  const km = Math.max(0, input.distance_km || 0);
  const formule = input.formule ?? "standard";
  const tauxTva = input.tva ?? TVA_DEFAUT;

  const iv = indexVolume(volume);
  const id = indexDistance(km);
  const trancheVolume = TRANCHES_VOLUME[iv];
  const trancheDistance = TRANCHES_DISTANCE[id];

  const valeurCase = TARIFS[formule][id][iv];
  const estForfait = trancheVolume.forfait;
  const tarif = estForfait ? 0 : valeurCase;

  const alertes: string[] = [];
  const mentions: string[] = [];

  // Hors bornes : on prolonge la tranche la plus proche, mais on le dit.
  const distanceMax = TRANCHES_DISTANCE[TRANCHES_DISTANCE.length - 1].max;
  if (km > distanceMax) {
    alertes.push(
      `Distance au-delà de la grille (${distanceMax} km) : tarif de la tranche ${trancheDistance.label} appliqué.`,
    );
  }

  const lines: LigneDevis[] = [];

  // ---- Transport ----
  const transport = r2(estForfait ? valeurCase : volume * tarif);
  lines.push({
    label: "Transport et manutention",
    detail: estForfait
      ? `forfait ${nb(valeurCase)} € — ${trancheVolume.label}, ${trancheDistance.label}`
      : `${nb(volume)} m³ × ${nb(tarif)} €/m³ — ${trancheVolume.label}, ${trancheDistance.label}`,
    amount: transport,
  });
  if (estForfait) {
    mentions.push("Moins de 5 m³ : le transport est facturé au forfait de la tranche.");
  }

  // ---- Suppléments ----
  const supplements: LigneDevis[] = [];

  if (input.voyage_special) {
    supplements.push({
      label: "Voyage spécial",
      detail: `date imposée · +${Math.round(SUPPLEMENTS.voyageSpecialPct * 100)} % du transport`,
      amount: r2(transport * SUPPLEMENTS.voyageSpecialPct),
    });
  }

  const portage = (metres: number | undefined, cote: string) => {
    const m = Math.max(0, metres || 0);
    const { seuilMetres, trancheMetres, prixParM3 } = SUPPLEMENTS.portage;
    if (m <= seuilMetres) return;
    const tranches = Math.ceil((m - seuilMetres) / trancheMetres);
    supplements.push({
      label: `Portage ${cote}`,
      detail: `${nb(m)} m · ${tranches} tranche${tranches > 1 ? "s" : ""} de ${trancheMetres} m × ${nb(prixParM3)} €/m³`,
      amount: r2(tranches * prixParM3 * volume),
    });
  };
  portage(input.portage_depart_m, "au départ");
  portage(input.portage_arrivee_m, "à l'arrivée");

  if (input.transbordement) {
    const { demiJournee, journee, seuilM3 } = SUPPLEMENTS.transbordement;
    const gros = volume > seuilM3;
    supplements.push({
      label: "Transbordement",
      detail: gros ? `journée · au-delà de ${seuilM3} m³` : `demi-journée · jusqu'à ${seuilM3} m³`,
      amount: gros ? journee : demiJournee,
    });
  }

  const mm = Math.max(0, Math.round(input.monte_meubles || 0));
  if (mm > 0) {
    const { demiJournee, journee, seuilM3 } = SUPPLEMENTS.monteMeubles;
    const gros = volume > seuilM3;
    const prix = gros ? journee : demiJournee;
    supplements.push({
      label: "Monte-meubles avec opérateur",
      detail: `${mm} × ${gros ? "journée" : `demi-journée (jusqu'à ${seuilM3} m³)`} · ${prix} €`,
      amount: r2(mm * prix),
    });
  }

  const pianos = Math.max(0, Math.round(input.piano_droit || 0));
  if (pianos > 0) {
    supplements.push({
      label: "Portage piano droit",
      detail: `${pianos} × ${SUPPLEMENTS.pianoDroit} € · hors réaccordage, départ et arrivée en rez-de-chaussée`,
      amount: r2(pianos * SUPPLEMENTS.pianoDroit),
    });
  }

  const lourds = Math.max(0, Math.round(input.charges_lourdes || 0));
  if (lourds > 0) {
    supplements.push({
      label: "Portage charges lourdes",
      detail: `${lourds} × ${SUPPLEMENTS.chargeLourde} € · 80 à 150 kg (aquarium, frigo américain, coffre-fort…)`,
      amount: r2(lourds * SUPPLEMENTS.chargeLourde),
    });
  }

  const valeur = Math.max(0, input.valeur_declaree || 0);
  if (valeur > 0) {
    const { taux, franchise } = SUPPLEMENTS.assurance;
    supplements.push({
      label: "Garantie nationale",
      detail: `${nb(taux * 100)} % de ${nb(valeur)} € déclarés`,
      amount: r2(valeur * taux),
    });
    mentions.push(`Franchise de ${franchise} € par sinistre.`);
  }

  mentions.push("Frais de stationnement : sur justificatif.");

  lines.push(...supplements);

  const totalSupplements = r2(supplements.reduce((s, l) => s + l.amount, 0));
  const ht = r2(transport + totalSupplements);
  const tva = r2((ht * tauxTva) / 100);

  return {
    lines,
    transport,
    supplements: totalSupplements,
    ht,
    tva,
    ttc: r2(ht + tva),
    valeur_case: valeurCase,
    est_forfait: estForfait,
    tarif_m3: tarif,
    tranche_volume: trancheVolume.label,
    tranche_distance: trancheDistance.label,
    index_volume: iv,
    index_distance: id,
    alertes,
    mentions,
  };
}

/** Valeurs proposées par le formulaire client, converties en euros. */
const VALEUR_MOBILIER: Record<string, number> = {
  "< 10 000 €": 10000,
  "10 000 – 30 000 €": 30000,
  "30 000 – 60 000 €": 60000,
  "> 60 000 €": 100000,
};

export function valeurDeclaree(tranche: unknown): number {
  if (typeof tranche !== "string") return 0;
  return VALEUR_MOBILIER[tranche] ?? 0;
}

/**
 * Traduit une demande en entrée de moteur. Ce que le formulaire ne
 * demande pas (portage, transbordement) n'est pas facturé d'office :
 * le moteur pose une alerte et l'équipe ajuste dans le simulateur.
 */
export function entreeDepuisDemande(req: RequestRow): SimulationInput {
  const raw = (req.raw_payload ?? {}) as Record<string, unknown>;
  const services = req.services ?? {};

  return {
    formule: (req.formule as Formule) || "standard",
    volume_m3: req.volume_m3 ?? 0,
    distance_km: req.distance_km ?? 0,
    monte_meubles: services.monte_meuble ? 1 : 0,
    valeur_declaree: valeurDeclaree(raw.valeur_mobilier),
    voyage_special: false,
  };
}

/** Estimation automatique d'une demande, avec les alertes de contexte. */
export function estimerDemande(req: RequestRow): Simulation {
  const sim = simuler(entreeDepuisDemande(req));
  const raw = (req.raw_payload ?? {}) as Record<string, unknown>;

  if (req.volume_m3 == null || req.volume_m3 <= 0) {
    sim.alertes.push("Volume non renseigné : l'estimation ne vaut rien tant qu'il manque.");
  }
  if (req.distance_km == null) {
    sim.alertes.push("Distance non renseignée : tarif de la tranche 0 à 50 km appliqué par défaut.");
  }
  if (req.date_souhaitee && !req.flexibilite) {
    sim.alertes.push(
      `Date précise demandée : voyage spécial (+${Math.round(SUPPLEMENTS.voyageSpecialPct * 100)} %) applicable si la date est imposée en route.`,
    );
  }
  if (raw.articles_lourds === true) {
    sim.alertes.push(
      `Objets lourds signalés : portage charge lourde ${SUPPLEMENTS.chargeLourde} € l'unité, piano droit ${SUPPLEMENTS.pianoDroit} €, à ajouter selon le relevé.`,
    );
  }
  if (raw.assurance === "luxe") {
    sim.alertes.push("Garantie LUXE demandée : hors grille, à chiffrer à la main.");
  }

  const sansAscenseur = (etage: number | null, asc: boolean | null) => (asc ? 0 : etage ?? 0);
  const etages = sansAscenseur(req.depart_etage, req.depart_ascenseur) + sansAscenseur(req.arrivee_etage, req.arrivee_ascenseur);
  if (etages >= 3 && !req.services?.monte_meuble) {
    sim.alertes.push(
      `${etages} étages sans ascenseur : monte-meubles probablement nécessaire (${SUPPLEMENTS.monteMeubles.demiJournee} € la demi-journée).`,
    );
  }

  return sim;
}
