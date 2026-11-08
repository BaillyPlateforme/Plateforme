import { redirect } from "next/navigation";

/*
 * Le suivi des leads est devenu une vue du Parcours (simplification du
 * 08/11/2026) : /demandes?vue=leads (Demandes › Suivi des leads).
 */
export default function AncienSuiviLeads() {
  redirect("/demandes?vue=leads");
}
