import { nonLusParClient } from "@/lib/espace-client/discussion";
import { chargerEspace } from "@/lib/espace-client/espace";
import { apercuEquipe } from "@/lib/espace-client/session";
import { suiviActif } from "@/lib/suivi-envois";
import { jetonVisite } from "@/lib/suivi-envois/jetons";
import { BoutonDemo } from "../../_ui/BoutonDemo";
import { SuiviPortail } from "../../_ui/SuiviPortail";
import { BulleDiscussion } from "../../_ui/BulleDiscussion";
import { PiedDePage } from "../../_ui/Cadre";
import "../../_ui/discussion.css";

/**
 * Le cadre d'un dossier : chaque page pose son propre bandeau, celui-ci
 * ajoute le pied de page, la bulle « Une question ? » (la discussion avec le
 * conseiller, en lecture seule pendant un aperçu de l'équipe) et, pour un
 * profil fictif, le bouton des profils — sauf pendant un aperçu de l'équipe,
 * qui ne change pas d'identité. `chargerEspace` vérifie la session et la
 * propriété du dossier : un dossier qui n'est pas au client connecté répond
 * 404.
 */
export default async function DossierLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const apercu = await apercuEquipe();
  // La pastille de la bulle : les réponses pas encore lues. Illisible, rien — la bulle se relit d'elle-même.
  const nonLus = await nonLusParClient(e.dossier.id, apercu ? "service" : "session").catch(() => 0);
  // Le suivi des pages vues (lib/suivi-envois) : le jeton de visite n'est remis qu'à la session du client, jamais à un aperçu de l'équipe.
  const visite = !apercu && suiviActif() ? jetonVisite({ d: e.dossier.id, c: e.client.id, r: e.dossier.reference, k: e.dossier.crm_dossier_id ?? null }) : null;
  return (
    <>
      {visite && <SuiviPortail jeton={visite} />}
      {children}
      <PiedDePage e={e} />
      <BulleDiscussion reference={e.dossier.reference} conseiller={{ prenom: e.conseiller.prenom, nom: e.conseiller.nom }} contact={{ telephone: e.conseiller.telephone || null, email: e.conseiller.email || null }} nonLusInitial={nonLus} lectureSeule={!!apercu} />
      {!apercu && <BoutonDemo reference={e.dossier.reference} email={e.client.email} fictif={e.client.demo} />}
    </>
  );
}
