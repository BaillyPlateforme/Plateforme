import { redirect } from "next/navigation";

/*
 * Les statistiques des demandes du site sont une vue des Statistiques
 * (simplification du 08/11/2026) : /dashboard/statistiques et ce qui vient
 * dessous y mènent.
 */
export default function AnciennesStatistiquesDuSite() {
  redirect("/statistiques/demandes");
}
