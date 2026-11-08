import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import { TYPES } from "@/crm/lib/format";
import { cartesKanban, commerciauxKanban } from "@/crm/kanban/donnees";
import { archivesTrouves, demandesSansDossier } from "@/crm/parcours/demandes";
import { estVueAnalyse, lireFiltres } from "@/crm/parcours/filtres";
import Hub from "@/crm/parcours/Hub";
import AnalyseDemandes from "@/crm/parcours/analyse/AnalyseDemandes";
import { vueDuSite } from "@/crm/statistiques/demandes/vues";
import { listRappels } from "@/lib/rappels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parcours des dossiers" };

type Params = { vue?: string; q?: string; type?: string; commercial?: string; etape?: string; segment?: string; dossier?: string; analyse?: string };

/*
 * Le Parcours : un seul parcours, de la demande du site à la facture
 * (unification du 08/11/2026 : les anciennes rubriques « Parcours » et
 * « Demandes » n'en font plus qu'une). Le menu de gauche (MenuParcours) a
 * deux groupes :
 *
 *  - Parcours : le Tableau (vue par défaut ; première colonne « Demandes »,
 *    les demandes du site qui attendent qu'on les accepte ou qu'on les
 *    refuse, puis les étapes du dossier) et la Liste (src/crm/parcours/Hub) ;
 *  - Analyse des demandes (?vue=demandes, rappels, statistiques, leads) : la
 *    liste détaillée des demandes, les rappels, les statistiques et le suivi
 *    des leads (src/crm/parcours/analyse).
 *
 * Les anciennes adresses y mènent : /kanban, /dossiers (la liste),
 * /commandes, /dashboard (la liste des demandes et ses vues), /dashboard/leads,
 * /statistiques/demandes, le workflow et le Kanban des demandes.
 */
export default async function Parcours({ searchParams }: { searchParams: Promise<Params> }) {
  await currentUser();
  const sp = await searchParams;
  // Un lien d'avant, vers un dossier : sa page, qui porte désormais son parcours.
  if (sp.dossier && /^\d+$/.test(sp.dossier)) redirect(`/dossiers/${sp.dossier}`);

  // Les rappels ouverts : une pastille du menu, sur toutes les vues ; jamais bloquant.
  const rappels = listRappels().catch((e) => {
    console.error("Parcours : lecture des rappels impossible", e instanceof Error ? e.message : e);
    return null;
  });

  if (estVueAnalyse(sp.vue)) return <AnalyseDemandes vue={sp.vue} analyse={vueDuSite(sp.analyse)} rappels={await rappels} />;

  const [cartes, commerciaux, demandes, listeRappels] = await Promise.all([
    cartesKanban(),
    commerciauxKanban(),
    // Jamais bloquant : sans les demandes du site, les dossiers restent lisibles.
    demandesSansDossier().catch((e) => {
      console.error("Parcours : lecture des demandes du site impossible", e instanceof Error ? e.message : e);
      return [];
    }),
    rappels,
  ]);
  // ?segment= : le filtre de l'ancien Kanban, devenu ?type=.
  const initiaux = lireFiltres({ ...sp, type: sp.type ?? sp.segment }, Object.keys(TYPES), commerciaux.map((c) => c.id));
  const archives = initiaux.q.trim() ? await archivesTrouves(initiaux.q).catch(() => 0) : 0;
  const rappelsOuverts = listeRappels?.filter((r) => r.statut === "a_rappeler" || r.statut === "en_cours").length;

  return (
    <Hub
      cartes={cartes}
      commerciaux={commerciaux}
      demandes={demandes}
      vueInitiale={sp.vue === "liste" ? "liste" : "colonnes"}
      initiaux={initiaux}
      archives={archives}
      rappels={rappelsOuverts}
    />
  );
}
