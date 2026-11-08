import { redirect } from "next/navigation";

/*
 * « Clients du site » a quitté les menus (simplification du 08/11/2026) : les
 * clients se trouvent dans le Parcours (vue liste). L'historique d'une adresse
 * e-mail (/dashboard/clients/<e-mail>) reste ouvert depuis la fiche de chaque
 * demande (« Historique du client »).
 */
export default function AnciensClientsDuSite() {
  redirect("/parcours?vue=liste");
}
