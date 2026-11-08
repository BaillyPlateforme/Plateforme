import { notFound } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import { commerciaux } from "@/crm/lib/data";
import FenetreVisite from "@/crm/planning/FenetreVisite";
import { lundiDuJour } from "@/crm/planning/grille";
import Planificateur from "@/crm/planning/planificateur/Planificateur";
import { dossierPlanif, instantPage, rdvPlanif, semainePlanif } from "@/crm/planning/planificateur/donnees";

export const dynamic = "force-dynamic";

/*
 * Un rendez-vous du planning, à modifier : le planificateur de visite
 * (src/crm/planning/planificateur) en modification, le seul écran qui
 * modifie un rendez-vous. Il repart de ce que le rendez-vous est — la
 * personne, sur place ou en visio, le créneau surligné dans la semaine de la
 * personne, la durée, l'adresse ou le lien, les observations — et changer de
 * personne, de type ou de créneau reste un clic. En tête : marquer la visite
 * effectuée, l'ouvrir sur la tablette, l'annuler.
 *
 * Tous les chemins mènent ici : un clic sur une visite du planning
 * (« Modifier »), « Modifier la visite » de la prochaine étape d'un dossier
 * (/planning/modifier?dossier=<id>), « Modifier » de l'onglet Visites.
 *
 * - ?retour=planning : on revient au planning après avoir enregistré ou
 *   annulé (sinon, à la fiche du dossier pour une visite de dossier) ;
 * - ?ok=adresses|etape : la fenêtre de visite vient d'être enregistrée.
 *
 * Sous le planificateur, pour un rendez-vous de dossier, la fenêtre de visite
 * de Créagidem (toutes les adresses et tous les accès), repliée.
 */
export default async function RendezVous({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ retour?: string; ok?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const [u, rdv] = await Promise.all([currentUser(), rdvPlanif(id)]);
  if (!rdv) notFound();
  const [coms, dossier] = await Promise.all([commerciaux(), rdv.dossierId ? dossierPlanif(rdv.dossierId) : Promise.resolve(null)]);

  // Les commerciaux, et la personne du rendez-vous si elle n'en est pas (un rendez-vous pris par la direction).
  const liste = coms.map((c) => ({ id: c.id as number, nom: c.nom as string }));
  if (!liste.some((c) => c.id === rdv.commercialId)) liste.push({ id: rdv.commercialId, nom: rdv.commercial });
  if (!liste.length) liste.push({ id: u.id, nom: u.nom });

  // La semaine du rendez-vous, dans le planning de sa personne ; son propre créneau ne la gêne pas.
  const semaine = await semainePlanif(rdv.commercialId, lundiDuJour(rdv.jour), rdv.dossierId, rdv.type, rdv.duree || 60, rdv.id);

  return (
    <Planificateur
      key={rdv.id}
      dossier={dossier}
      source={null}
      rdv={rdv}
      retourVers={sp.retour === "planning" ? "planning" : null}
      dossiers={[]}
      commerciaux={liste}
      commercialInitial={rdv.commercialId}
      semaineInitiale={semaine}
      maintenantInitial={instantPage()}
      typeInitial={rdv.type}
      apres={dossier ? <FenetreVisite rdvId={rdv.id} dossierId={dossier.id} reference={dossier.ref} ok={sp.ok} /> : null}
    />
  );
}
