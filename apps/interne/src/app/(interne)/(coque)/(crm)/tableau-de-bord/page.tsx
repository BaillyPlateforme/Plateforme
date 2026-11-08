import { redirect } from "next/navigation";

/* Le tableau de la journée est devenu l'accueil (simplification du 08/11/2026). */
export default function AncienTableauDuJour() {
  redirect("/");
}
