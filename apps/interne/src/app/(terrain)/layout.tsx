import type { Metadata, Viewport } from "next";
import { jakarta } from "@/polices";
import "./terrain.css";

/*
 * La mise en page racine de l'outil terrain des déménageurs (/terrain), à
 * côté de celles du CRM et des sections de l'équipe : pas de coque, pas de
 * menu, une page légère pensée pour un téléphone tenu d'une main sur un
 * chantier. Même police et même palette « Fusion » que le CRM, en plus
 * contrasté (plein soleil), avec de grandes cibles pour les pouces.
 */
export const metadata: Metadata = {
  title: { default: "Bailly Terrain", template: "%s — Bailly Terrain" },
  description: "L'outil terrain des déménageurs de Bailly Déménagement : chantiers du jour et photos.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Bailly Terrain", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4c1d95",
};

export default function TerrainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body className="terrain">{children}</body>
    </html>
  );
}
