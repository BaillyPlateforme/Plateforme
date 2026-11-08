import ReglagesFacturation from "@/crm/facturation/ReglagesFacturation";

export const metadata = { title: "Facturation — Réglages — Bailly" };

/*
 * Réglages › Facturation : les mentions et les conditions imprimées sur les
 * factures et les avoirs. Elles étaient au bas des Paramètres
 * (/dashboard/parametres#facturation, qui mène désormais ici) ; elles ont leur
 * page et leur entrée dans le menu de Réglages.
 */
export default function FacturationReglages() {
  return <ReglagesFacturation />;
}
