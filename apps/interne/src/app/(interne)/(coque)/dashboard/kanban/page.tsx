import { redirect } from "next/navigation";

/*
 * Le Kanban des demandes : depuis la simplification du 08/11/2026, les
 * demandes du site pas encore entrées au CRM ouvrent les colonnes du
 * Parcours (« Nouvelles demandes »), suivies des dossiers, étape par étape.
 */
export default function AncienKanbanDemandes() {
  redirect("/parcours");
}
