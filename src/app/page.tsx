import Accueil from "./Accueil";
import { listLibraryPhotos } from "@/lib/library";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Bailly Déménagement — devis en ligne",
  description:
    "Décrivez votre déménagement, recevez une estimation immédiate établie sur notre grille tarifaire.",
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ mode }, library, settings] = await Promise.all([
    searchParams,
    listLibraryPhotos(),
    getSettings(),
  ]);

  return (
    <Accueil
      library={library}
      instant={settings.resultat_instantane}
      annee={new Date().getFullYear()}
      parcoursInitial={mode === "express" || mode === "complet" ? mode : null}
    />
  );
}
