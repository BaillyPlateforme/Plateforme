import type { Metadata } from "next";
import { currentUser } from "@/crm/lib/auth";
import Bandeau from "@/ui/Bandeau";
import Copilote from "./Copilote";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copilote" };

/*
 * Le Copilote : on pose une question en français, il consulte le CRM (en
 * lecture seule) et répond, avec des liens vers les fiches. Troisième page de
 * l'Accueil, après le Pilotage et le tableau de bord du jour.
 */
export default async function PageCopilote() {
  const u = await currentUser();
  return (
    <div className="view">
      <Bandeau
        surtitre="Accueil · Copilote"
        titre="Copilote"
        texte="Vos questions sur les dossiers, l’agenda, les devis et les demandes du site. Il consulte le CRM sans rien y modifier."
      />
      <Copilote prenom={u.nom.split(" ")[0]} />
    </div>
  );
}
