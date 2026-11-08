import { redirect } from "next/navigation";

/*
 * Le Workflow des demandes (l'ancienne page /dashboard/workflow) est supprimé
 * (choix de David, 08/11/2026 : « elle n'a plus de sens ») : l'adresse mène
 * au Parcours. Les règles d'envoi automatique restent dans Réglages, « Modèles
 * et règles d'alerte » (/dashboard/messagerie), et partent toujours aux mêmes
 * étapes (fireEvent, src/lib/alerts.ts).
 */
export default function AncienWorkflow() {
  redirect("/parcours");
}
