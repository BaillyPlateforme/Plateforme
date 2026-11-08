import { redirect } from "next/navigation";
import { vueDuSite } from "@/crm/statistiques/demandes/vues";

/*
 * Statistiques › Demandes du site a rejoint le Parcours (unification du
 * 08/11/2026) : ses huit analyses sont dans Parcours › Analyse des demandes ›
 * Statistiques. L'adresse reste, et mène à la même analyse (?vue=… devient
 * ?analyse=…).
 */
export default async function AnciennesStatistiquesDemandes({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const analyse = vueDuSite((await searchParams).vue);
  redirect(analyse === "ensemble" ? "/parcours?vue=statistiques" : `/parcours?vue=statistiques&analyse=${analyse}`);
}
