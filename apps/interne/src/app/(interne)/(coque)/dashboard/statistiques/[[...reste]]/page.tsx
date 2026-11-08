import { redirect } from "next/navigation";

/*
 * Les statistiques des demandes du site sont dans Parcours › Analyse des
 * demandes › Statistiques (unification du 08/11/2026) : /dashboard/statistiques
 * et ce qui vient dessous y mènent.
 */
export default function AnciennesStatistiquesDuSite() {
  redirect("/parcours?vue=statistiques");
}
