import { redirect } from "next/navigation";

/* Les rappels sont une vue de Parcours › Analyse des demandes (unification du 08/11/2026). */
export default function AnciensRappels() {
  redirect("/parcours?vue=rappels");
}
