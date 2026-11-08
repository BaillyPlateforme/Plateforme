import type { Metadata } from "next";
import { currentUser } from "@/crm/lib/auth";
import { instant, modelesDossier } from "@/crm/creation/donnees";
import GestionModeles from "@/crm/creation/GestionModeles";
import Bandeau from "@/ui/Bandeau";
import { AvecMenu } from "@/ui/MenuVertical";
import MenuCreation from "@/crm/creation/MenuCreation";

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
        surtitre="Dossiers · Création"
        titre="Modèles de dossier"
        texte="Des points de départ pour créer vite ; les plus utilisés en tête."
        action={{ label: "Nouveau modèle", href: "/dossiers/modeles?nouveau=1", icone: "plus" }}
      />
      <AvecMenu menu={<MenuCreation page="modeles" />}>
        <GestionModeles key={nouveau ? "nouveau" : "liste"} modeles={modeles} maintenant={instant()} nouveau={nouveau} />
      </AvecMenu>
    </div>
  );
}
