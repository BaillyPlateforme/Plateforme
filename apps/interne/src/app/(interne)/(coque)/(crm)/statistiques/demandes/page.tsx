import { redirect } from "next/navigation";
import { vueDuSite } from "@/crm/statistiques/demandes/vues";

/*
 * Statistiques › Demandes du site a rejoint Demandes : ses huit analyses sont
 * dans Demandes › Statistiques. L'adresse reste, et mène à la même analyse
 * (?vue=… devient ?analyse=…).
 */
export default async function AnciennesStatistiquesDemandes({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const analyse = vueDuSite((await searchParams).vue);
  redirect(analyse === "ensemble" ? "/demandes?vue=statistiques" : `/demandes?vue=statistiques&analyse=${analyse}`);
}
