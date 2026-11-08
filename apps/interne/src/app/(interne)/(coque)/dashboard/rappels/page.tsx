import { redirect } from "next/navigation";

/* Les rappels sont une vue de Demandes (Analyse › À rappeler). */
export default function AnciensRappels() {
  redirect("/demandes?vue=rappels");
}
