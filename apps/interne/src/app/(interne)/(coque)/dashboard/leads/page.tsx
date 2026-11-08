import { redirect } from "next/navigation";

/*
 * Le suivi des leads est devenu une vue du Parcours (simplification du
 * 08/11/2026) : /parcours?vue=leads.
 */
export default function AncienSuiviLeads() {
  redirect("/parcours?vue=leads");
}
