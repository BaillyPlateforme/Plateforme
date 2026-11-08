/*
 * Les analyses des demandes du site : les huit onglets de l'ancienne page
 * /dashboard/statistiques, rangées sous « Statistiques » dans le menu de
 * gauche de Parcours › Analyse des demandes (?vue=statistiques&analyse=…,
 * unification du 08/11/2026). La première, « Vue d'ensemble », est l'ancienne
 * page /dashboard/tableau-de-bord, qui doublait l'ancien onglet du même nom.
 */
export const VUES_DU_SITE = [
  { cle: "ensemble", label: "Vue d'ensemble" },
  { cle: "mails", label: "Mails" },
  { cle: "formulaire", label: "Formulaire" },
  { cle: "heatmap", label: "Heatmap" },
  { cle: "analyse", label: "Analyse" },
  { cle: "formules", label: "Formules" },
  { cle: "geographie", label: "Géographie" },
  { cle: "conversion", label: "Conversion" },
] as const;

export type VueDuSite = (typeof VUES_DU_SITE)[number]["cle"];

export const vueDuSite = (v: unknown): VueDuSite => (VUES_DU_SITE.some((x) => x.cle === v) ? (v as VueDuSite) : "ensemble");
