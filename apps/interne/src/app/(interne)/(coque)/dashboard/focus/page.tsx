import { redirect } from "next/navigation";

/* Focus (les demandes à fort potentiel) est devenu Demandes › Top demandes, filtre « Fort potentiel ». */
export default function FocusPage() {
  redirect("/demandes?vue=top&potentiel=fort");
}
