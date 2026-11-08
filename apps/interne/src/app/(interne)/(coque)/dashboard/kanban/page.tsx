import { redirect } from "next/navigation";

/* Le Kanban des demandes : Demandes › Kanban, ses étapes détaillées jusqu'au dossier. */
export default function AncienKanbanDemandes() {
  redirect("/demandes");
}
