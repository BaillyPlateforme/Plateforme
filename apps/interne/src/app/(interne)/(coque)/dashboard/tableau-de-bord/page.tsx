import { redirect } from "next/navigation";

/*
 * La vue d'ensemble des demandes du site a rejoint l'accueil (simplification
 * du 08/11/2026) : ses dernières demandes y sont, ses graphiques dans
 * Statistiques › Demandes du site.
 */
export default function AncienneVueDEnsemble() {
  redirect("/");
}
