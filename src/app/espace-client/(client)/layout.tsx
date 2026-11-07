import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Suspense } from "react";
import { Apparitions } from "../_ui/Apparitions";
import { Toast } from "../_ui/Toast";
import "../espace-client.css";

/*
 * La mise en page de l'espace client.
 *
 * Elle seule charge Barlow et la feuille de la micro démo : le reste de
 * l'application garde Roboto et ses propres styles. Tout est posé sous la
 * classe racine `.ec`, de sorte que la feuille, une fois chargée, ne touche
 * rien en dehors de l'espace client.
 */

// Corps de texte : Barlow, très lisible.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Titres : la version condensée, dans l'esprit des affiches de voyage du modèle.
const condensee = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Mon espace client · Bailly Déménagement", template: "%s · Espace client Bailly" },
  description: "Votre déménagement, vos documents et chaque étape, au même endroit.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#12110f" };

export default function EspaceClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ec ${barlow.variable} ${condensee.variable}`}>
      {children}
      <Apparitions />
      <Suspense>
        <Toast />
      </Suspense>
    </div>
  );
}
