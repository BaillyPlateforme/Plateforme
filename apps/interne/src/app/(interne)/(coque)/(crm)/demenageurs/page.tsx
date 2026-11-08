import { redirect } from "next/navigation";

/* Les comptes des déménageurs : une vue de l'annuaire des partenaires (simplification du 08/11/2026). */
export default function Demenageurs() {
  redirect("/partenaires?vue=demenageurs");
}
