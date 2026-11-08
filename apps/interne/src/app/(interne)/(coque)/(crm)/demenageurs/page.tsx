import type { Metadata } from "next";
import Bandeau from "@/ui/Bandeau";
import { equipesConnues, listerAgents } from "@/terrain/lib/agents";
import GestionDemenageurs from "@/terrain/composants/GestionDemenageurs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Déménageurs" };

/*
 * Les comptes des déménageurs pour l'outil terrain : un par personne,
 * intérimaires compris. Rangée avec l'exploitation (c'est elle qui compose les
 * équipes du planning) plutôt que dans les Réglages : un intérimaire arrive et
 * repart d'une semaine à l'autre, ce n'est pas un réglage. La coque du CRM
 * vérifie déjà que l'on est de l'équipe ; chaque action le revérifie.
 */
export default async function Demenageurs() {
  const [agents, equipes] = await Promise.all([listerAgents(), equipesConnues()]);
  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation"
        titre="Déménageurs"
        texte="Un compte par déménageur, intérimaires compris, pour l'outil terrain : les chantiers du jour lus au planning, et les photos avant, après et de détail rattachées au dossier."
        action={{ label: "Ouvrir l'outil terrain", href: "/terrain", icone: "fleche" }}
      />
      <GestionDemenageurs agents={agents} equipes={equipes} />
    </div>
  );
}
