import DemandeForm from "./demande/DemandeForm";
import { listLibraryPhotos } from "@/lib/library";
import { getSettings } from "@/lib/settings";

/**
 * La page d'accueil du site, c'est le formulaire de devis.
 *
 * L'espace équipe ne s'annonce nulle part ici : il vit sous /dashboard,
 * derrière l'authentification, et on y entre par /login.
 */
export const metadata = {
  title: "Demande de devis — Bailly Déménagement",
  description:
    "Décrivez votre déménagement et recevez une estimation immédiate, calculée sur notre grille tarifaire.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const [library, settings] = await Promise.all([listLibraryPhotos(), getSettings()]);
  return <DemandeForm library={library} instant={settings.resultat_instantane} />;
}
