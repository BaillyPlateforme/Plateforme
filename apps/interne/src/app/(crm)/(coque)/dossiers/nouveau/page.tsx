import type { Metadata } from "next";
import { commerciaux } from "@/crm/lib/data";
import { currentUser } from "@/crm/lib/auth";
import { instant, sourcesCreation } from "@/crm/creation/donnees";
import CreationDossier from "@/crm/creation/CreationDossier";
import Bandeau, { Pilules } from "@/ui/Bandeau";

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
        surtitre="Commercial"
        titre="Nouveau dossier"
        texte="Le strict nécessaire ici ; tout le reste se complète sur la fiche."
        bas={
          <Pilules
            label="Création de dossier"
            items={[
              { href: "/dossiers/nouveau", label: "Nouveau dossier", actif: true },
              { href: "/dossiers/modeles", label: "Modèles de dossier" },
            ]}
          />
        }
      />
      <CreationDossier
        moi={{ id: u.id, role: u.role }}
        commerciaux={coms.map((c) => ({ id: c.id, nom: c.nom }))}
        monDernier={sources.monDernier}
        dernierAgence={sources.dernierAgence}
        modeles={sources.modeles}
        modeleInitial={Number.isSafeInteger(modele) && modele > 0 ? modele : null}
        maintenant={instant()}
      />
    </div>
  );
}
