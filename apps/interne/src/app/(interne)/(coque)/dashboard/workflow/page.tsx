import { redirect } from "next/navigation";

/*
 * Le workflow des demandes s'ouvre désormais du Parcours (simplification du
 * 08/11/2026) : /parcours/automatismes.
 */
export default function AncienWorkflow() {
  redirect("/parcours/automatismes");
}
