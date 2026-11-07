import { redirect } from "next/navigation";

/*
 * L'ancienne vitrine de BaillyCRM. Le CRM occupe désormais la racine de l'app
 * interne, avec sa propre mise en page : un lien déjà envoyé vers
 * /dashboard/crm y mène.
 */
export default function AncienneVitrineCrm() {
  redirect("/");
}
