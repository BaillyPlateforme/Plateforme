import { redirect } from "next/navigation";

/* Les rappels sont une vue des Demandes (simplification du 08/11/2026). */
export default function AnciensRappels() {
  redirect("/dashboard?vue=rappels");
}
