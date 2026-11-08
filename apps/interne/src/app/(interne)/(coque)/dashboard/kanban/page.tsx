import { redirect } from "next/navigation";

// Kanban est devenu un sous-onglet de Demandes.
export default function KanbanPage() {
  redirect("/dashboard?vue=kanban");
}
