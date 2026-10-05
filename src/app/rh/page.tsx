import type { Metadata } from "next";
import ThemeClair from "@/components/ThemeClair";
import PortailRh from "./PortailRh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Espace RH — Bailly Déménagement",
  robots: { index: false, follow: false },
};

/**
 * L'espace RH. Une seule adresse pour toutes les entreprises : c'est le compte
 * connecté qui dit laquelle. Le garde d'accès a déjà vérifié la session ; les
 * données, elles, sont filtrées par le serveur d'après le compte.
 */
export default async function EspaceRhPage({ searchParams }: { searchParams: Promise<{ apercu?: string }> }) {
  const { apercu } = await searchParams;
  return (
    <>
      <ThemeClair />
      {/* `apercu` ne sert qu'à l'équipe Bailly : pour un compte RH, le serveur l'ignore. */}
      <PortailRh apercu={apercu ?? null} />
    </>
  );
}
