import { redirect } from "next/navigation";

/* Focus est devenu le filtre « Fort potentiel » de Parcours › Analyse des demandes (unification du 08/11/2026). */
export default function FocusPage() {
  redirect("/parcours?vue=demandes&potentiel=fort&tri=potentiel");
}
