import type { Metadata } from "next";
import ThemeClair from "@/components/ThemeClair";
import EspaceIndisponible from "./[code]/[slug]/EspaceIndisponible";

export const metadata: Metadata = {
  title: "Espace pro — Bailly Déménagement",
  robots: { index: false, follow: false },
};

/**
 * /pro tout court : aucun espace ne se trouve ici, et aucun ne se liste.
 */
export default function LienIncomplet() {
  return (
    <>
      <ThemeClair />
      <EspaceIndisponible />
    </>
  );
}
