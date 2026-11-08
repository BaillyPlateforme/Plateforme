import { nomsExecutants } from "./donnees";
import SaisiePrestataire from "./SaisiePrestataire";

/*
 * Le champ « prestataire » d'une lettre de voiture, prêt à poser dans un
 * formulaire existant : il lit lui-même l'annuaire (les sociétés qui
 * exécutent : sous-traitants, agences, partenaires) et garde le nom `name`
 * attendu par l'action qui enregistre la lettre.
 */
export default async function ChampPrestataire({ valeur, nom = "prestataire", id }: { valeur: string | null; nom?: string; id?: string }) {
  const annuaire = await nomsExecutants().catch(() => []);
  return <SaisiePrestataire nom={nom} valeur={valeur} annuaire={annuaire} id={id} />;
}
