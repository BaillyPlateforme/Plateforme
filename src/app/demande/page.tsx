import DemandeForm from "./DemandeForm";
import { listLibraryPhotos } from "@/lib/library";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Demande de devis — Bailly Déménagement",
};

export const dynamic = "force-dynamic";

export default async function DemandePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  // L'accueil envoie ici avec le parcours déjà choisi ; sans cela, on commence
  // par la page de choix.
  const modeInitial = mode === "express" || mode === "complet" ? mode : null;

  const [library, settings] = await Promise.all([listLibraryPhotos(), getSettings()]);
  return (
    <DemandeForm library={library} instant={settings.resultat_instantane} modeInitial={modeInitial} />
  );
}
