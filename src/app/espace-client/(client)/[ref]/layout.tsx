import { chargerEspace } from "@/lib/espace-client/espace";
import { BoutonDemo } from "../../_ui/BoutonDemo";
import { PiedDePage } from "../../_ui/Cadre";

/**
 * Le cadre d'un dossier : chaque page pose son propre bandeau, celui-ci
 * ajoute le pied de page et, en démonstration, le bouton des profils.
 * `chargerEspace` vérifie la session et la propriété du dossier : un dossier
 * qui n'est pas au client connecté répond 404.
 */
export default async function DossierLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  return (
    <>
      {children}
      <PiedDePage e={e} />
      <BoutonDemo reference={e.dossier.reference} email={e.client.email} />
    </>
  );
}
