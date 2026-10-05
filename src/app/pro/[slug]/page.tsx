import type { Metadata } from "next";
import ThemeClair from "@/components/ThemeClair";
import { getEspace } from "@/lib/espaces-pro";
import { titreDe, versPublic } from "@/lib/espaces";
import { listLibraryPhotos } from "@/lib/library";
import EspaceAccueil from "./EspaceAccueil";
import EspaceIndisponible from "./EspaceIndisponible";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ demande?: string }> };

/**
 * Un espace pro n'est pas une page du site : c'est un lien remis à une
 * entreprise. Il ne se référence pas, et son titre ne dit rien tant que
 * l'espace n'est pas ouvert.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const espace = await getEspace(slug).catch(() => null);
  return {
    title: espace?.actif ? `${titreDe(espace)} — Bailly Déménagement` : "Espace pro — Bailly Déménagement",
    robots: { index: false, follow: false },
  };
}

export default async function EspacePage({ params, searchParams }: Props) {
  const [{ slug }, { demande }] = await Promise.all([params, searchParams]);
  const espace = await getEspace(slug).catch(() => null);

  // Un lien inconnu et un espace mis en pause se ressemblent, vus du client :
  // il n'a pas à savoir lequel des deux.
  if (!espace || !espace.actif)
    return (
      <>
        <ThemeClair />
        <EspaceIndisponible />
      </>
    );

  const library = await listLibraryPhotos();
  return (
    <>
      <ThemeClair />
      {/* ?demande=1 saute l'accueil : pour un lien glissé dans un intranet. */}
      <EspaceAccueil espace={versPublic(espace)} library={library} direct={demande === "1"} />
    </>
  );
}
