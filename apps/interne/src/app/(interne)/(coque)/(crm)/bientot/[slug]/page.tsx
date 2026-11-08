import { Ic } from "@/crm/lib/icons";

const T: Record<string, [string, string]> = {
  conteneurs: ["Conteneurs", "Réception des conteneurs avec photos du plomb et des dommages, rattachées au dossier client : le prochain module livré après le cœur de métier."],
  "garde-meuble": ["Garde-meuble", "Suivi des entrées et sorties de garde-meuble, avec contrat et facturation dédiés."],
  espaces: ["Espaces client, RH et partenaires", "Trois portails reliés au CRM : le client qui déménage, les RH et acheteurs des grands comptes (lecture seule), et les partenaires et agents."],
  "visite-vocale": ["Visite à la voix", "L'inventaire dicté pendant la visite : la fiche se remplit au fil de la conversation."],
};
export default async function Bientot({ params }: { params: Promise<{ slug: string }> }) {
  const [t, d] = T[(await params).slug] ?? ["Bientôt", "Ce module arrive prochainement."];
  return (
    <div className="soon"><div className="orb"><Ic n="spark" /></div><h1>{t}</h1><p>{d}</p></div>
  );
}
