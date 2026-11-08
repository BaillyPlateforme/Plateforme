import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import { TYPES } from "@/crm/lib/format";
import { cartesKanban, commerciauxKanban } from "@/crm/kanban/donnees";
import { archivesTrouves, demandesADecider } from "@/crm/parcours/demandes";
import { estVueAnalyse, lireFiltres } from "@/crm/parcours/filtres";
import Hub from "@/crm/parcours/Hub";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parcours des dossiers" };

type Params = Record<string, string | string[] | undefined>;

/*
 * Le Parcours : tous les dossiers, de la demande du site à la facture. Deux
 * vues au menu de gauche (src/crm/parcours/Hub) : le Tableau (vue par défaut ;
 * sa première colonne, « Demandes », résume les demandes du site qui
 * attendent qu'on les accepte ou qu'on les refuse, et mène au détail dans
 * Demandes) et la Liste.
 *
 * Les demandes, de près, ont leur entrée : Demandes (/demandes). L'ancienne
 * « Analyse des demandes » du Parcours (?vue=demandes, rappels,
 * statistiques, leads) y mène, filtres compris. Mènent ici : /kanban,
 * /dossiers (la liste), /commandes, le workflow.
 */
export default async function Parcours({ searchParams }: { searchParams: Promise<Params> }) {
  await currentUser();
  const brut = await searchParams;
  const sp = Object.fromEntries(Object.entries(brut).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  // Un lien d'avant, vers un dossier : sa page, qui porte désormais son parcours.
  if (sp.dossier && /^\d+$/.test(sp.dossier)) redirect(`/dossiers/${sp.dossier}`);

  // Parcours › Analyse des demandes (du 08/11/2026) : ses vues sont dans Demandes.
  if (estVueAnalyse(sp.vue)) {
    const p = new URLSearchParams();
    // « Fort potentiel » sur la liste était l'ancienne vue Focus : c'est Top demandes.
    if (sp.vue === "demandes" && sp.potentiel === "fort") {
      p.set("vue", "top");
      p.set("potentiel", "fort");
    } else p.set("vue", sp.vue === "demandes" ? "liste" : sp.vue);
    for (const k of p.get("vue") === "liste" ? ["q", "statut", "source", "tri"] : p.get("vue") === "statistiques" ? ["analyse"] : []) if (sp[k]) p.set(k, sp[k]!);
    redirect(`/demandes?${p}`);
  }

  const [cartes, commerciaux, demandes] = await Promise.all([
    cartesKanban(),
    commerciauxKanban(),
    // Jamais bloquant : sans les demandes du site, les dossiers restent lisibles.
    demandesADecider().catch((e) => {
      console.error("Parcours : lecture des demandes du site impossible", e instanceof Error ? e.message : e);
      return [];
    }),
  ]);
  // ?segment= : le filtre de l'ancien Kanban, devenu ?type=.
  const initiaux = lireFiltres({ ...sp, type: sp.type ?? sp.segment }, Object.keys(TYPES), commerciaux.map((c) => c.id));
  const archives = initiaux.q.trim() ? await archivesTrouves(initiaux.q).catch(() => 0) : 0;

  return <Hub cartes={cartes} commerciaux={commerciaux} demandes={demandes} vueInitiale={sp.vue === "liste" ? "liste" : "colonnes"} initiaux={initiaux} archives={archives} />;
}
