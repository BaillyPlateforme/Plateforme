import { redirect } from "next/navigation";

/*
 * Le Workflow des demandes est supprimé (choix de David, 08/11/2026) : son
 * ancienne adresse mène au Parcours. Les règles d'envoi automatique restent
 * dans Réglages, « Modèles et règles d'alerte » (/dashboard/messagerie).
 */
export default function AncienWorkflow() {
  redirect("/parcours");
}
