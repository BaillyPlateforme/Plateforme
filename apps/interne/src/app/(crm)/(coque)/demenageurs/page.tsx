import type { Metadata } from "next";
import Bandeau from "@/ui/Bandeau";
import Indicateurs from "@/ui/Indicateurs";
import { equipesConnues, listerAgents } from "@/terrain/lib/agents";
import { chiffresPhotos } from "@/terrain/lib/photos";
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
  const [agents, equipes, chiffres] = await Promise.all([listerAgents(), equipesConnues(), chiffresPhotos()]);
  const actifs = agents.filter((a) => a.actif);
  const interimaires = actifs.filter((a) => a.interimaire).length;
  return (
    <div className="view">
      <Bandeau
        surtitre="Exploitation"
        titre="Déménageurs"
        texte="Un compte par déménageur, intérimaires compris, pour l'outil terrain : les chantiers du jour lus au planning, et les photos avant, après et de détail rattachées au dossier."
        action={{ label: "Ouvrir l'outil terrain", href: "/terrain", icone: "fleche" }}
      />
      <Indicateurs
        items={[
          {
            libelle: "Comptes actifs",
            precision: `dont ${interimaires} intérimaire${interimaires > 1 ? "s" : ""}`,
            valeur: String(actifs.length),
            icone: "badge",
            ton: "violet",
          },
          { libelle: "Photos du jour", valeur: String(chiffres.jour), icone: "horloge", ton: "vert" },
          { libelle: "Photos", precision: "7 derniers jours", valeur: String(chiffres.semaine), icone: "tendance", ton: "ambre" },
          { libelle: "Dossiers photographiés", precision: "7 jours", valeur: String(chiffres.dossiers), icone: "dossierClient", ton: "rose" },
        ]}
      />
      <GestionDemenageurs agents={agents} equipes={equipes} />
    </div>
  );
}
