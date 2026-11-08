import "server-only";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { listRequests } from "@/lib/requests";
import type { CarteRappel } from "@/lib/rappels";
import { listLeads } from "@/lib/suivi";
import StatistiquesDuSite from "@/crm/statistiques/demandes/StatistiquesDuSite";
import type { VueDuSite } from "@/crm/statistiques/demandes/vues";
import { dossiersDesDemandes } from "../demandes";
import type { VueAnalyse } from "../filtres";
import MenuParcours from "../MenuParcours";
import SuiviLeads from "../SuiviLeads";
import FiltresDemandes from "./FiltresDemandes";
import ListeDemandes from "./ListeDemandes";
import RappelsBoard from "./RappelsBoard";
import h from "../hub.module.css";

/*
 * Parcours › Analyse des demandes (unification du 08/11/2026) : les demandes
 * du site regardées de plus près, sous le même bandeau que le Tableau et la
 * Liste du Parcours — même titre ; seuls la phrase et le menu de gauche
 * disent la vue.
 *
 *  - Demandes : toutes les demandes, ouvertes, acceptées ou perdues, avec
 *    leurs filtres dans la rangée du bas (l'ancienne page /dashboard ; son
 *    Focus est devenu le filtre « Fort potentiel ») ;
 *  - À rappeler : les clients qui ont demandé à être rappelés, en colonnes
 *    (l'ancienne vue Rappels) ;
 *  - Statistiques : les huit analyses de l'ancien Statistiques › Demandes du
 *    site, choisies sous l'entrée du menu ;
 *  - Suivi des leads : le tableau de Margaux, ses statuts et chiffres
 *    d'affaires saisis à la main (il a ses propres filtres).
 *
 * Ces vues sont écrites avec Tailwind (classes de l'équipe) : elles vivent
 * dans un conteneur `.vue-equipe`.
 */

const TEXTES: Record<VueAnalyse, string> = {
  demandes: "Demandes · tout ce qui arrive, du formulaire comme des mails",
  rappels: "À rappeler · les clients qui demandent qu'on les rappelle",
  statistiques: "Statistiques · le flux des demandes, du formulaire comme des mails",
  leads: "Suivi des leads · chaque demande du site, du premier contact au chiffre d'affaires",
};

export default async function AnalyseDemandes({ vue, analyse, rappels }: { vue: VueAnalyse; analyse: VueDuSite; rappels: CarteRappel[] | null }) {
  let contenu: React.ReactNode;
  if (vue === "demandes") {
    const [requests, dossiers] = await Promise.all([listRequests().catch(() => null), dossiersDesDemandes().catch(() => ({}))]);
    contenu = requests ? <ListeDemandes requests={requests} dossiers={dossiers} /> : <Indisponible texte="Les demandes ne se lisent pas pour le moment : réessayez dans un instant." />;
  } else if (vue === "rappels") {
    contenu = rappels ? <RappelsBoard rappels={rappels} /> : <Indisponible texte="Les rappels ne se lisent pas pour le moment : réessayez dans un instant." />;
  } else if (vue === "statistiques") {
    contenu = <StatistiquesDuSite vue={analyse} />;
  } else {
    const leads = await listLeads().catch(() => null);
    contenu = leads ? <SuiviLeads leads={leads} /> : <Indisponible texte="Le suivi des leads ne se lit pas pour le moment : réessayez dans un instant." />;
  }

  const ouverts = rappels?.filter((r) => r.statut === "a_rappeler" || r.statut === "en_cours").length;
  return (
    <div className="view">
      <Bandeau
        surtitre="Dossiers · Analyse des demandes"
        titre="Parcours des dossiers"
        texte={TEXTES[vue]}
        action={{ label: "Nouveau dossier", href: "/dossiers/nouveau", icone: "plus" }}
        bas={vue === "demandes" ? <FiltresDemandes /> : undefined}
      />
      <AvecMenu menu={<MenuParcours vue={vue} analyse={analyse} nombres={{ rappels: ouverts }} />}>
        <div className={`vue-equipe ${h.equipe}`}>{contenu}</div>
      </AvecMenu>
    </div>
  );
}

function Indisponible({ texte }: { texte: string }) {
  return <div className="card empty">{texte}</div>;
}
