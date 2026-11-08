import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuStatistiques from "@/crm/statistiques/Vues";
import StatistiquesDuSite from "@/crm/statistiques/demandes/StatistiquesDuSite";
import { vueDuSite } from "@/crm/statistiques/demandes/vues";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques des demandes du site" };

/*
 * Statistiques › Demandes du site (simplification du 08/11/2026) : l'ancienne
 * page /dashboard/statistiques et ses huit onglets, avec en tête la vue
 * d'ensemble qui était /dashboard/tableau-de-bord. L'analyse se choisit au
 * menu de gauche, second groupe sous les vues des Statistiques ; sans
 * période, la rangée du bas du bandeau reste vide.
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
      />
      <AvecMenu menu={<MenuStatistiques actif="demandes" analyse={vue} />}>
        <div className="vue-equipe">
          <StatistiquesDuSite vue={vue} />
        </div>
      </AvecMenu>
    </div>
  );
}
