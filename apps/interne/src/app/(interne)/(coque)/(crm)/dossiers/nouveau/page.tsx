import type { Metadata } from "next";
import { commerciaux } from "@/crm/lib/data";
import { currentUser } from "@/crm/lib/auth";
import { instant, sourcesCreation } from "@/crm/creation/donnees";
import CreationDossier from "@/crm/creation/CreationDossier";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuCreation from "@/crm/creation/MenuCreation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau dossier" };

/*
 * La création d'un dossier : un écran, au clavier d'abord (src/crm/creation).
 * `?modele=<id>` part directement d'un modèle (bouton « Utiliser » de la page
 * des modèles). Les modèles se gèrent sur l'onglet voisin, /dossiers/modeles.
 */
export default async function NouveauDossier({ searchParams }: { searchParams: Promise<{ modele?: string }> }) {
  const [u, coms, sp] = await Promise.all([currentUser(), commerciaux(), searchParams]);
  const sources = await sourcesCreation(u.id);
  const modele = Number(sp.modele);
  return (
    <div className="view">
      <Bandeau
        surtitre="Dossiers · Création"
        titre="Nouveau dossier"
        texte="Le strict nécessaire ici ; tout le reste se complète sur la fiche."
      />
      <AvecMenu menu={<MenuCreation page="nouveau" />}>
      <CreationDossier
        moi={{ id: u.id, role: u.role }}
        commerciaux={coms.map((c) => ({ id: c.id, nom: c.nom }))}
        monDernier={sources.monDernier}
        dernierAgence={sources.dernierAgence}
        modeles={sources.modeles}
        modeleInitial={Number.isSafeInteger(modele) && modele > 0 ? modele : null}
        maintenant={instant()}
      />
      </AvecMenu>
    </div>
  );
}
