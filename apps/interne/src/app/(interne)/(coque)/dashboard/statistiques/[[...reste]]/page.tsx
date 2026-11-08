import { redirect } from "next/navigation";

/*
 * Les statistiques des demandes du site sont dans Demandes › Statistiques :
 * /dashboard/statistiques et ce qui vient dessous y mènent.
 */
export default function AnciennesStatistiquesDuSite() {
  redirect("/demandes?vue=statistiques");
}
