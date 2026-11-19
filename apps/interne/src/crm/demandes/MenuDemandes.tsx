import MenuVertical, { type ItemMenu } from "@/ui/MenuVertical";
import { VUES_DU_SITE, type VueDuSite } from "@/crm/statistiques/demandes/vues";

/*
 * Les vues de Demandes (demande de David, 08/11/2026 : « un onglet
 * demande, qui reprend le kanban avec des étapes plus détaillées […] une
 * véritable vue feed, et une vue par potentiel »). Les vues à gauche, les
 * filtres dans la bande.
 *
 *  - Demandes : le Kanban (les étapes détaillées, jusqu'au dossier), puis le
 *    Feed (les demandes dans l'ordre où elles arrivent, par jour) et Top
 *    demandes (par potentiel, la meilleure en vedette) — la même liste et le
 *    même panneau de la demande choisie (ListeDetail) ;
 *  - Analyse : la liste détaillée et ses filtres, les clients à rappeler,
 *    les statistiques (leurs huit analyses s'ouvrent sous l'entrée) et le
 *    suivi des leads.
 */

export type VueDemandes = "kanban" | "feed" | "top" | "liste" | "rappels" | "statistiques" | "leads";
export const VUES_DEMANDES: VueDemandes[] = ["kanban", "feed", "top", "liste", "rappels", "statistiques", "leads"];
export const estVueDemandes = (v: unknown): v is VueDemandes => VUES_DEMANDES.includes(v as VueDemandes);

/** L'adresse d'une vue de Demandes (le Kanban est l'adresse nue). */
export const adresseDemandes = (v: VueDemandes) => (v === "kanban" ? "/demandes" : `/demandes?vue=${v}`);

/** Le titre de chaque vue, au bandeau de la page. */
export const TITRES_DEMANDES: Record<VueDemandes, string> = {
  kanban: "Demandes",
  feed: "Feed des demandes",
  top: "Top demandes",
  liste: "Liste des demandes",
  rappels: "À rappeler",
  statistiques: "Statistiques des demandes",
  leads: "Suivi des leads",
};

/**
 * Depuis le 19/11/2026, les vues de Demandes sont dans la sous-barre du haut
 * (ui/navigation.ts). Ne reste à gauche que le choix des huit analyses des
 * Statistiques.
 */
export default function MenuDemandes({ analyse }: { analyse?: VueDuSite }) {
  const items: ItemMenu[] = VUES_DU_SITE.map((v) => ({ href: `/demandes?vue=statistiques&analyse=${v.cle}`, label: v.label, actif: (analyse ?? "ensemble") === v.cle }));
  return <MenuVertical titre="Statistiques" groupes={[{ items }]} />;
}
