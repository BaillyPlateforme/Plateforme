import type { Metadata } from "next";
import HorsLigne from "@/crm/visites/tablette/HorsLigne";

/*
 * La page de secours de la tablette (/tablette/hors-ligne) : une coque sans
 * aucune donnée, la même pour tous, que le service worker de la tablette
 * garde et sert quand le réseau manque (sw.js/route.ts). Ce qu'elle affiche
 * vient de la tablette elle-même (crm/visites/tablette/HorsLigne.tsx).
 */
export const dynamic = "force-static";
export const metadata: Metadata = { title: "Hors connexion" };

export default function PageHorsLigne() {
  return <HorsLigne />;
}
