import Bandeau, { Pilules } from "@/ui/Bandeau";
import VuesStatistiques, { BasStatistiques } from "@/crm/statistiques/Vues";
import StatistiquesDuSite from "@/crm/statistiques/demandes/StatistiquesDuSite";
import { VUES_DU_SITE, vueDuSite } from "@/crm/statistiques/demandes/vues";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques des demandes du site" };

/*
 * Statistiques › Demandes du site (simplification du 08/11/2026) : l'ancienne
 * page /dashboard/statistiques et ses huit onglets, avec en tête la vue
 * d'ensemble qui était /dashboard/tableau-de-bord. L'analyse se choisit dans
 * la rangée du bas du bandeau, à côté des trois vues des Statistiques.
 *
 * Les graphiques sont écrits avec les classes de Tailwind : ils vivent dans
 * un conteneur `.vue-equipe`, où les règles générales du CRM s'arrêtent.
 */
export default async function StatistiquesDemandes({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const vue = vueDuSite((await searchParams).vue);
  return (
    <div className="view">
      <Bandeau
        surtitre="Statistiques · Demandes du site"
        titre="Demandes du site"
        texte="Analyse complète du flux de demandes, du formulaire comme des mails"
        bas={
          <BasStatistiques>
            <VuesStatistiques actif="demandes" />
            <Pilules
              label="Analyse"
              items={VUES_DU_SITE.map((v) => ({
                href: v.cle === "ensemble" ? "/statistiques/demandes" : `/statistiques/demandes?vue=${v.cle}`,
                label: v.label,
                actif: v.cle === vue,
              }))}
            />
          </BasStatistiques>
        }
      />
      <div className="vue-equipe">
        <StatistiquesDuSite vue={vue} />
      </div>
    </div>
  );
}
