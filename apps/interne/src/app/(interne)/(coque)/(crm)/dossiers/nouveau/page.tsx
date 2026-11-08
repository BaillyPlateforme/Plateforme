import type { Metadata } from "next";
import { commerciaux } from "@/crm/lib/data";
import { currentUser } from "@/crm/lib/auth";
import { clientARattacher, instant, sourcesCreation } from "@/crm/creation/donnees";
import CreationDossier from "@/crm/creation/CreationDossier";
import { sourceDuplication } from "@/crm/duplication/donnees";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuCreation from "@/crm/creation/MenuCreation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau dossier" };

/*
 * La création d'un dossier : un écran, au clavier d'abord (src/crm/creation).
 * `?modele=<id>` part directement d'un modèle (bouton « Utiliser » de la page
 * des modèles). Les modèles se gèrent sur l'onglet voisin, /dossiers/modeles.
 * `?client=<id>` rattache d'emblée un client du CRM (« Nouveau dossier pour ce
 * client », depuis sa fiche /clients/<id>). `?depuis=<id>` duplique un
 * dossier pour un nouveau client (« ⋯ » du dossier) : l'écran est prérempli,
 * et des cases disent ce qui est repris (src/crm/duplication).
 */
export default async function NouveauDossier({ searchParams }: { searchParams: Promise<{ modele?: string; client?: string; depuis?: string }> }) {
  const [u, coms, sp] = await Promise.all([currentUser(), commerciaux(), searchParams]);
  const [sources, client, duplication] = await Promise.all([
    sourcesCreation(u.id),
    sp.client && /^\d+$/.test(sp.client) ? clientARattacher(Number(sp.client)) : null,
    sp.depuis && /^\d+$/.test(sp.depuis) ? sourceDuplication(Number(sp.depuis)) : null,
  ]);
  const modele = Number(sp.modele);
  return (
    <div className="view">
      <Bandeau
        surtitre={duplication ? `Dossiers · Duplication de ${duplication.ref}` : "Dossiers · Création"}
        titre={duplication ? "Dupliquer pour un nouveau client" : "Nouveau dossier"}
        texte={
          duplication
            ? `À partir du dossier ${duplication.ref} (${duplication.client}) : saisissez le nouveau client, ou rattachez un client existant, et choisissez ce qui est repris.`
            : "Le strict nécessaire ici ; tout le reste se complète sur la fiche."
        }
        secondaire={duplication ? { label: `Retour à ${duplication.ref}`, href: `/dossiers/${duplication.id}` } : undefined}
      />
      <AvecMenu menu={<MenuCreation page="nouveau" />}>
      <CreationDossier
        moi={{ id: u.id, role: u.role }}
        commerciaux={coms.map((c) => ({ id: c.id, nom: c.nom }))}
        monDernier={sources.monDernier}
        dernierAgence={sources.dernierAgence}
        modeles={sources.modeles}
        modeleInitial={Number.isSafeInteger(modele) && modele > 0 ? modele : null}
        clientInitial={client}
        duplication={duplication}
        maintenant={instant()}
      />
      </AvecMenu>
    </div>
  );
}
