import { redirect } from "next/navigation";

/*
 * L'ancienne messagerie (onglets Templates, Alertes, Simulation) a rejoint
 * Réglages › Courriers et SMS le 08/11/2026 : chaque modèle y a sa carte, s'y
 * crée et s'y supprime, y porte sa règle et ses conditions, et tout message
 * s'y teste. L'adresse reste, et y mène.
 */
export default function AncienneMessagerie() {
  redirect("/modeles");
}
