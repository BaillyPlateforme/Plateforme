import ThemeClair from "@/components/ThemeClair";
import DemandeRappel from "./DemandeRappel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Être rappelé — Bailly",
  robots: { index: false, follow: false },
};

/**
 * La page où arrive le bouton « Je souhaite être rappelé » des messages et du
 * PDF. L'adresse porte l'identifiant de la demande ; l'ouvrir suffit à
 * l'inscrire dans le tableau des rappels.
 */
export default async function RappelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <ThemeClair />
      <DemandeRappel requestId={id} />
    </>
  );
}
