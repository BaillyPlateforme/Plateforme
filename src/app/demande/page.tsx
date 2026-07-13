import DemandeForm from "./DemandeForm";
import { listLibraryPhotos } from "@/lib/library";

export const metadata = {
  title: "Demande de devis — Bailly Déménagement",
};

export const dynamic = "force-dynamic";

export default async function DemandePage() {
  const library = await listLibraryPhotos();
  return <DemandeForm library={library} />;
}
