import { redirect } from "next/navigation";

/*
 * L'agenda des demandes du site (leurs dates souhaitées, au mois) est une vue
 * du planning commercial depuis la simplification du 08/11/2026.
 */
export default function AncienAgenda() {
  redirect("/planning?vue=dates");
}
