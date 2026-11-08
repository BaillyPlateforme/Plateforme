import MenuVertical, { type ItemMenu } from "@/ui/MenuVertical";
import { VUES_DU_SITE, type VueDuSite } from "@/crm/statistiques/demandes/vues";

/*
 * Le menu de gauche de Demandes (demande de David, 08/11/2026 : « un onglet
 * demande, qui reprend le kanban avec des étapes plus détaillées […] une
 * véritable vue feed, et une vue par potentiel »). Les vues à gauche, les
 * filtres dans la bande.
 *
 *  - Demandes : le Kanban (les étapes détaillées, jusqu'au dossier), le Feed
 *    (tout ce qui arrive aux demandes) et Top demandes (classées par
 *    potentiel, avec leur araignée) ;
 *  - Analyse : la liste détaillée et ses filtres, les clients à rappeler,
 *    les statistiques (leurs huit analyses s'ouvrent sous l'entrée) et le
 *    suivi des leads.
 */

export type VueDemandes = "kanban" | "feed" | "top" | "liste" | "rappels" | "statistiques" | "leads";
export const VUES_DEMANDES: VueDemandes[] = ["kanban", "feed", "top", "liste", "rappels", "statistiques", "leads"];
export const estVueDemandes = (v: unknown): v is VueDemandes => VUES_DEMANDES.includes(v as VueDemandes);

/** L'adresse d'une vue de Demandes (le Kanban est l'adresse nue). */
export const adresseDemandes = (v: VueDemandes) => (v === "kanban" ? "/demandes" : `/demandes?vue=${v}`);

export default function MenuDemandes({ vue, analyse, nombres }: { vue: VueDemandes; analyse?: VueDuSite; nombres?: { rappels?: number } }) {
  const statistiques: ItemMenu[] =
    vue === "statistiques"
      ? VUES_DU_SITE.map((v) => ({ href: `/demandes?vue=statistiques&analyse=${v.cle}`, label: v.label, actif: (analyse ?? "ensemble") === v.cle, sous: true }))
      : [];
  return (
    <MenuVertical
      titre="Demandes"
      groupes={[
        {
          items: [
            { href: adresseDemandes("kanban"), label: "Kanban", icone: "kanban", actif: vue === "kanban" },
            { href: adresseDemandes("feed"), label: "Feed", icone: "fil", actif: vue === "feed" },
            { href: adresseDemandes("top"), label: "Top demandes", icone: "etoile", actif: vue === "top" },
          ],
        },
        {
          titre: "Analyse",
          items: [
            { href: adresseDemandes("liste"), label: "Liste", icone: "menu", actif: vue === "liste" },
            { href: adresseDemandes("rappels"), label: "À rappeler", icone: "horloge", actif: vue === "rappels", nombre: nombres?.rappels },
            { href: adresseDemandes("statistiques"), label: "Statistiques", icone: "stats", actif: vue === "statistiques" },
            ...statistiques,
            { href: adresseDemandes("leads"), label: "Suivi des leads", icone: "tendance", actif: vue === "leads" },
          ],
        },
      ]}
    />
  );
}
