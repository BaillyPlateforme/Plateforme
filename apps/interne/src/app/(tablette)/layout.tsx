import type { Metadata, Viewport } from "next";
import { jakarta } from "@/polices";
import "./tablette.css";

/*
 * La mise en page racine de la tablette du commercial (/tablette), à côté
 * de celles du CRM, des sections de l'équipe et de l'outil terrain : pas de
 * coque, pas de menu. Une interface tenue à deux mains, au doigt, pour la
 * visite technique chez le client (cahier des charges, §3.2) : la visite du
 * jour, le métré pièce par pièce, les photos, les accès, les options, puis le
 * compte-rendu que le client signe sur l'écran.
 *
 * Réservée à l'équipe : le proxy de l'app la garde comme les pages du CRM,
 * et chaque page, action et route la revérifie (currentUser).
 */
export const metadata: Metadata = {
  title: { default: "Visite technique", template: "%s — Bailly Visite" },
  description: "La visite technique sur tablette : métré, photos, accès, options et compte-rendu signé.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Bailly Visite", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4b2fe0",
};

export default function TabletteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body className="tablette">{children}</body>
    </html>
  );
}
