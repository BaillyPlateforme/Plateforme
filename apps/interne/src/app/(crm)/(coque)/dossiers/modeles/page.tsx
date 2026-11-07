import type { Metadata } from "next";
import { currentUser } from "@/crm/lib/auth";
import { instant, modelesDossier } from "@/crm/creation/donnees";
import GestionModeles from "@/crm/creation/GestionModeles";
import Bandeau, { Pilules } from "@/ui/Bandeau";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modèles de dossier" };

/*
 * Les modèles de dossier, en onglet de la création (/dossiers/nouveau) : on
 * s'en sert au moment de créer, c'est là qu'on les range. Les réglages
 * restent pour ce qui paramètre l'outil (courriers, équipe) ; un modèle se
 * crée aussi depuis une fiche, par « Enregistrer comme modèle ».
 */
export default async function ModelesDossier({ searchParams }: { searchParams: Promise<{ nouveau?: string }> }) {
  const [, modeles, sp] = await Promise.all([currentUser(), modelesDossier(), searchParams]);
  const nouveau = sp.nouveau === "1";
  return (
    <div className="view">
      <Bandeau
        surtitre="Commercial"
        titre="Modèles de dossier"
        texte="Des points de départ pour créer vite ; les plus utilisés en tête."
        action={{ label: "Nouveau modèle", href: "/dossiers/modeles?nouveau=1", icone: "plus" }}
        bas={
          <Pilules
            label="Création de dossier"
            items={[
              { href: "/dossiers/nouveau", label: "Nouveau dossier" },
              { href: "/dossiers/modeles", label: "Modèles de dossier", actif: true },
            ]}
          />
        }
      />
      <GestionModeles key={nouveau ? "nouveau" : "liste"} modeles={modeles} maintenant={instant()} nouveau={nouveau} />
    </div>
  );
}
