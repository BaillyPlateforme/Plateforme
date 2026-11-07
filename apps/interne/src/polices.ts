import { Plus_Jakarta_Sans } from "next/font/google";

/*
 * La police de l'app interne : Plus Jakarta Sans, celle du design « Fusion »
 * du CRM. Déclarée une fois ici, et posée par les deux mises en page racines
 * (le CRM, les sections issues de l'espace équipe) : un seul design partout.
 */
export const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});
