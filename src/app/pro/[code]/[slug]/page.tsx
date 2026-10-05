import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ThemeClair from "@/components/ThemeClair";
import { getEspaceParCode } from "@/lib/espaces-pro";
import { cheminEspace, titreDe, versPublic } from "@/lib/espaces";
import { listLibraryPhotos } from "@/lib/library";
import EspaceAccueil from "./EspaceAccueil";
import EspaceIndisponible from "./EspaceIndisponible";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string; slug: string }>; searchParams: Promise<{ demande?: string }> };

/**
 * Un espace pro n'est pas une page du site : c'est un lien remis à une
 * entreprise. Il ne se référence pas, et son titre ne dit rien tant que
 * l'espace n'est pas ouvert.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const espace = await getEspaceParCode(code).catch(() => null);
  return {
    title: espace?.actif ? `${titreDe(espace)} — Bailly Déménagement` : "Espace pro — Bailly Déménagement",
    robots: { index: false, follow: false },
  };
}

/**
 * /pro/<code>/<nom>. C'est le code qui ouvre l'espace ; le nom n'est là que
 * pour que le lien se lise. Remplacer le nom par celui d'une autre entreprise
 * ne mène nulle part ailleurs : on est ramené au lien exact de ce code.
 */
export default async function EspacePage({ params, searchParams }: Props) {
  const [{ code, slug }, { demande }] = await Promise.all([params, searchParams]);
  const espace = await getEspaceParCode(code).catch(() => null);

  // Un lien inconnu et un espace mis en pause se ressemblent, vus du client :
  // il n'a pas à savoir lequel des deux.
  if (!espace || !espace.actif)
    return (
      <>
        <ThemeClair />
        <EspaceIndisponible />
      </>
    );

  if (slug !== espace.slug) redirect(cheminEspace(espace) + (demande === "1" ? "?demande=1" : ""));

  const library = await listLibraryPhotos();
  return (
    <>
      <ThemeClair />
      {/* ?demande=1 saute l'accueil : pour un lien glissé dans un intranet. */}
      <EspaceAccueil espace={versPublic(espace)} library={library} direct={demande === "1"} />
    </>
  );
}
