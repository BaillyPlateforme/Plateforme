import { redirect } from "next/navigation";

// Focus est devenu un sous-onglet de Demandes.
export default function FocusPage() {
  redirect("/dashboard?vue=focus");
}
