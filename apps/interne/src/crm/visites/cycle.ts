/*
 * Le cycle d'une visite technique, tel que Créagidem le présente : à
 * planifier, planifiée, effectuée, devis établi, sans suite. Rien n'est
 * stocké en double : l'état se lit dans le rendez-vous (terminé, devis
 * établi, classé sans suite), dans son compte-rendu signé et dans le dossier
 * (perdu). « À planifier » est l'état d'un dossier à visiter qui n'a pas
 * encore de rendez-vous de visite à venir. Fonctions pures.
 */

export type EtatVisite = "a_planifier" | "planifiee" | "effectuee" | "devis" | "sans_suite";

export const ETATS_VISITE: Record<EtatVisite, { libelle: string; ton: "i" | "w" | "g" | "p" | "r" }> = {
  a_planifier: { libelle: "À planifier", ton: "w" },
  planifiee: { libelle: "Planifiée", ton: "i" },
  effectuee: { libelle: "Effectuée", ton: "p" },
  devis: { libelle: "Devis établi", ton: "g" },
  sans_suite: { libelle: "Sans suite", ton: "r" },
};

export const ORDRE_ETATS: EtatVisite[] = ["a_planifier", "planifiee", "effectuee", "devis", "sans_suite"];

/** L'état d'un rendez-vous de visite (sur place ou en visio). */
export function etatVisite(r: {
  termine: boolean;
  devis_etabli: boolean;
  sans_suite?: boolean | null;
  dossier_statut?: string | null;
  compte_rendu_signe?: boolean | null;
}): Exclude<EtatVisite, "a_planifier"> {
  if (r.sans_suite || r.dossier_statut === "perdu") return "sans_suite";
  if (r.devis_etabli) return "devis";
  if (r.termine || r.compte_rendu_signe) return "effectuee";
  return "planifiee";
}

export const estVisite = (type: string) => type === "phys" || type === "visio";
