import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Bandeau from "@/ui/Bandeau";
import { currentUser } from "@/crm/lib/auth";
import PanneauDossiers from "@/crm/parcours/PanneauDossiers";
import { cartesPanneau, VUES_PANNEAU } from "@/crm/parcours/cartes-panneau";
import p from "@/crm/parcours/panneau.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parcours des dossiers" };

/*
 * Le Parcours donne vue directement sur la ligne de parcours d'un dossier :
 * celui qu'on demande, sinon le plus récemment modifié de la vue. Les autres
 * dossiers sont dans la bande de droite (cartes illustrées, refermable).
 */
export default async function Parcours({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const vue = VUES_PANNEAU.some((v) => v.cle === sp.vue) ? (sp.vue as string) : "";
  const cartes = await cartesPanneau(vue);
  if (cartes[0]) redirect(`/parcours/${cartes[0].id}${vue ? `?vue=${vue}` : ""}`);

  return (
    <div className="view">
      <Bandeau surtitre="Commercial · Suivi des dossiers" titre="Parcours des dossiers" texte="De la demande à la facture, tout le parcours d’un dossier sur une page.">
        <Link href="/kanban" data-ton="contour">Kanban</Link>
      </Bandeau>
      <div className={p.avecPanneau}>
        <div className={p.zone}>
          <p style={{ color: "var(--muted)" }}>Aucun dossier dans cette vue.</p>
        </div>
        <PanneauDossiers cartes={cartes} actif={null} vue={vue} vues={VUES_PANNEAU} />
      </div>
    </div>
  );
}
