import DemandeForm from "./DemandeForm";
import { listLibraryPhotos } from "@/lib/library";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Demande de devis — Bailly Déménagement",
};

export const dynamic = "force-dynamic";

export default async function DemandePage() {
  const [library, settings] = await Promise.all([listLibraryPhotos(), getSettings()]);
  return <DemandeForm library={library} instant={settings.resultat_instantane} />;
}
