import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./crm.css";

/*
 * La mise en page racine du CRM, à côté de celle de l'espace équipe.
 *
 * Le CRM garde son design « Fusion » plein écran, sa feuille de style et sa
 * police : il a sa propre racine (html, body) pour que sa feuille ne touche
 * pas l'espace équipe, ni celle de l'équipe (Tailwind, Roboto) le CRM. Passer
 * de l'un à l'autre recharge la page entière, ce que Next fait de lui-même
 * entre deux mises en page racines.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "BaillyCRM", template: "%s — BaillyCRM" },
  description: "Le CRM métier de Bailly Déménagement",
  robots: { index: false, follow: false },
};

export default function CrmRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
