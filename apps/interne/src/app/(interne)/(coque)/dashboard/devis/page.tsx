import { redirect } from "next/navigation";

/*
 * « Devis du site » a quitté les menus (simplification du 08/11/2026) : le
 * devis d'une demande se lit, change de statut et se supprime dans l'onglet
 * Devis de sa page ; Demandes › Liste donne l'estimation et l'étape.
 */
export default function AnciensDevisDuSite() {
  redirect("/demandes?vue=liste");
}
