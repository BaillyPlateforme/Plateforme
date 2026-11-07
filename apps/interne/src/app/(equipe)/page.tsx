import { redirect } from "next/navigation";

/** L'app interne n'a pas de page d'accueil à elle : on entre par le tableau de bord. */
export default function Racine() {
  redirect("/dashboard");
}
