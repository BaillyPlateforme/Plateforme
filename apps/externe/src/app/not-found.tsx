import type { Metadata } from "next";
import ThemeClair from "@/components/ThemeClair";
import PageIntrouvable from "./PageIntrouvable";

export const metadata: Metadata = {
  title: "Page introuvable — Bailly Déménagement",
  robots: { index: false, follow: false },
};

/**
 * Une adresse inconnue du site : la page de Next disait « 404 · This page
 * could not be found », en anglais et sans la marque.
 */
export default function Introuvable() {
  return (
    <>
      <ThemeClair />
      <PageIntrouvable />
    </>
  );
}
