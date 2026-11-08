import { redirect } from "next/navigation";

/*
 * Les Commandes (devis signés, avec ou sans date) sont devenues un filtre du
 * Parcours : la liste, à l'étape « Commandes » (signés et planifiés).
 */
export default function AnciennesCommandes() {
  redirect("/parcours?vue=liste&etape=commande");
}
