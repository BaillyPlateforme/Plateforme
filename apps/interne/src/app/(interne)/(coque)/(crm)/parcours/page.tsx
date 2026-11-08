import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import { currentUser } from "@/crm/lib/auth";
import { TYPES } from "@/crm/lib/format";
import { cartesKanban, commerciauxKanban } from "@/crm/kanban/donnees";
import { archivesTrouves, demandesSansDossier } from "@/crm/parcours/demandes";
import { lireFiltres } from "@/crm/parcours/filtres";
import Hub from "@/crm/parcours/Hub";
import MenuParcours from "@/crm/parcours/MenuParcours";
import SuiviLeads from "@/crm/parcours/SuiviLeads";
import { listLeads } from "@/lib/suivi";
import h from "@/crm/parcours/hub.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parcours des dossiers" };

type Params = { vue?: string; q?: string; type?: string; commercial?: string; etape?: string; segment?: string; dossier?: string };

/*
 * Le Parcours : tous les dossiers, de la demande du site à la facture
 * (src/crm/parcours/Hub.tsx). Les anciennes adresses y mènent : /kanban,
 * /dossiers (la liste), /commandes, et, de l'espace équipe, le suivi des
 * leads, le workflow et le Kanban des demandes.
 *
 * ?vue=leads : le suivi des leads (le tableau des demandes du site, ses
 * statuts et chiffres d'affaires saisis à la main), troisième vue du Parcours,
 * au menu de gauche comme les deux autres ; il a ses propres filtres, la
 * rangée du bas de la bande reste vide.
 */
export default async function Parcours({ searchParams }: { searchParams: Promise<Params> }) {
  await currentUser();
  const sp = await searchParams;
  // Un lien d'avant, vers un dossier : sa page, qui porte désormais son parcours.
  if (sp.dossier && /^\d+$/.test(sp.dossier)) redirect(`/dossiers/${sp.dossier}`);

  if (sp.vue === "leads") {
    const leads = await listLeads().catch(() => null);
    return (
      <div className="view">
        <Bandeau
          surtitre="Dossiers · Demandes du site"
          titre="Parcours des dossiers"
          texte="Chaque demande du site, du premier contact au chiffre d'affaires."
          action={{ label: "Nouveau dossier", href: "/dossiers/nouveau", icone: "plus" }}
        />
        <AvecMenu menu={<MenuParcours vue="leads" />}>
          <div className={`vue-equipe ${h.equipe}`}>
            {leads ? <SuiviLeads leads={leads} /> : <div className="card empty">Le suivi des leads ne se lit pas pour le moment : réessayez dans un instant.</div>}
          </div>
        </AvecMenu>
      </div>
    );
  }

  const [cartes, commerciaux, demandes] = await Promise.all([
    cartesKanban(),
    commerciauxKanban(),
    // Jamais bloquant : sans les demandes du site, les dossiers restent lisibles.
    demandesSansDossier().catch((e) => {
      console.error("Parcours : lecture des demandes du site impossible", e instanceof Error ? e.message : e);
      return [];
    }),
  ]);
  // ?segment= : le filtre de l'ancien Kanban, devenu ?type=.
  const initiaux = lireFiltres({ ...sp, type: sp.type ?? sp.segment }, Object.keys(TYPES), commerciaux.map((c) => c.id));
  const archives = initiaux.q.trim() ? await archivesTrouves(initiaux.q).catch(() => 0) : 0;

  return <Hub cartes={cartes} commerciaux={commerciaux} demandes={demandes} vueInitiale={sp.vue === "liste" ? "liste" : "colonnes"} initiaux={initiaux} archives={archives} />;
}
