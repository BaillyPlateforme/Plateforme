import type { Metadata } from "next";
import ThemeClair from "@/components/ThemeClair";
import EspaceIndisponible from "./[slug]/EspaceIndisponible";

export const metadata: Metadata = {
  title: "Espace pro — Bailly Déménagement",
  robots: { index: false, follow: false },
};

/**
 * /pro/<quelque chose> : un lien sans son code. Le nom d'une entreprise ne
 * suffit pas à ouvrir son espace — c'est tout l'intérêt du code.
 */
export default function LienIncomplet() {
  return (
    <>
      <ThemeClair />
      <EspaceIndisponible />
    </>
  );
}
