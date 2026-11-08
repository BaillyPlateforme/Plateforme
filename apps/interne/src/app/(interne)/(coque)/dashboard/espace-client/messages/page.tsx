import BoiteMessages from "@/crm/discussion/BoiteMessages";
import { conversationVide, conversations } from "@/crm/discussion/donnees";
import { currentUser } from "@/crm/lib/auth";
import Filtres, { type Filtre } from "@/ui/Filtres";
import EnTeteSection from "../../EnTeteSection";

export const metadata = { title: "Messages — Espace client — Bailly" };
export const dynamic = "force-dynamic";

/*
 * Espace client › Messages : la boîte de réception des discussions des
 * clients (src/crm/discussion). Une vue du menu de gauche de la section,
 * comme les dossiers, les cartons et le SAV ; le bandeau garde les filtres
 * (à répondre, non lus, conseiller), sans tuiles de chiffres.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ dossier?: string; etat?: string; conseiller?: string }> }) {
  await currentUser();
  const sp = await searchParams;
  const toutes = await conversations();

  const lignes = toutes.filter(
    (c) =>
      (sp.etat !== "a_repondre" || c.sansReponse) &&
      (sp.etat !== "non_lus" || c.nonLus > 0) &&
      (!sp.conseiller || c.conseillerId === sp.conseiller),
  );
  // Le dossier demandé par l'adresse (lien de l'e-mail, « Écrire au client ») hors de la liste : ouvert quand même.
  const supplement = sp.dossier && !lignes.some((c) => c.dossierId === sp.dossier) ? (toutes.find((c) => c.dossierId === sp.dossier) ?? (await conversationVide(sp.dossier))) : null;

  const aRepondre = toutes.filter((c) => c.sansReponse).length;
  const nonLus = toutes.reduce((n, c) => n + c.nonLus, 0);
  const conseillers = [...new Map(toutes.filter((c) => c.conseillerId && c.conseiller).map((c) => [c.conseillerId!, c.conseiller!])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const filtres: Filtre[] = [
    { cle: "etat", libelle: "Toutes les conversations", options: [{ valeur: "a_repondre", libelle: "À répondre" }, { valeur: "non_lus", libelle: "Avec des non lus" }] },
    ...(conseillers.length > 1 ? [{ cle: "conseiller", libelle: "Tous les conseillers", options: conseillers.map(([valeur, libelle]) => ({ valeur, libelle })) }] : []),
  ];

  return (
    <>
      <EnTeteSection
        propre
        surtitre="Espace client"
        titre="Espace client"
        texte={`Messages · ${aRepondre ? `${aRepondre} conversation${aRepondre > 1 ? "s" : ""} à répondre` : "tout est répondu"}${nonLus ? ` · ${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}` : ""}`}
        bas={<Filtres filtres={filtres} garder={["dossier"]} />}
        nombres={{ "/dashboard/espace-client/messages": nonLus || undefined }}
      />
      <BoiteMessages key={`${sp.etat ?? ""}|${sp.conseiller ?? ""}`} conversations={lignes} selection={sp.dossier ?? null} supplement={supplement} />
    </>
  );
}
