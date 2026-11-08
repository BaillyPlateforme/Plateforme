import type { Metadata } from "next";
import { currentUser } from "@/crm/lib/auth";
import { apercuCopilote } from "@/crm/copilote/apercu";
import Bandeau from "@/ui/Bandeau";
import Copilote, { ActionsCopilote, PucesCopilote } from "./Copilote";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copilote" };

/*
 * Le Copilote : on pose une question en français, il consulte le CRM (en
 * lecture seule) et répond avec les fiches à ouvrir. Troisième page de
 * l'Accueil, après l'Accueil et les Statistiques.
 *
 * La bande porte l'historique, « Nouvelle conversation » et, dans sa rangée
 * du bas, « En ce moment » (quelques nombres du CRM, un clic pose la
 * question). Le panneau de la conversation se pose à cheval sur son bas et
 * remplit l'écran. Les conversations sont gardées dans le navigateur, une
 * clé par membre de l'équipe.
 */
export default async function PageCopilote() {
  const [u, apercu] = await Promise.all([currentUser(), apercuCopilote().catch(() => ({ puces: [], clientRecent: null }))]);
  const cle = `bailly.copilote.v1.${u.id}`;
  return (
    <div className="view">
      <Bandeau
        surtitre="Accueil · Copilote"
        titre="Copilote"
        texte="Vos questions sur les dossiers, l’agenda, les devis, les chiffres et les demandes du site."
        etiquettes={["Lecture seule"]}
        bas={<PucesCopilote cle={cle} puces={apercu.puces} />}
      >
        <ActionsCopilote cle={cle} />
      </Bandeau>
      <Copilote cle={cle} prenom={u.nom.split(" ")[0]} clientRecent={apercu.clientRecent} />
    </div>
  );
}
