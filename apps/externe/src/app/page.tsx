import Accueil from "./Accueil";
import type { Choix, Filtre } from "./Vitrine";
import { listLibraryPhotos } from "@/lib/library";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Bailly Déménagement — devis en ligne",
  description:
    "Décrivez votre déménagement, recevez une estimation immédiate établie sur notre grille tarifaire.",
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  /**
   * `integre=1` : la page est affichée dans un cadre, sur le site officiel.
   * `parcours=particulier|mutation|entreprise` ouvre une seule porte ;
   * `mode=express|complet` et `transfert=simple|projet` en choisissent la branche.
   */
  searchParams: Promise<{ mode?: string; integre?: string; parcours?: string; transfert?: string }>;
}) {
  const [{ mode, integre, parcours, transfert }, library, settings] = await Promise.all([
    searchParams,
    listLibraryPhotos(),
    getSettings(),
  ]);

  return (
    <Accueil
      library={library}
      instant={settings.resultat_instantane}
      annee={new Date().getFullYear()}
      {...entree(parcours, mode, transfert)}
      integre={integre === "1"}
    />
  );
}

/** Ce que l'adresse demande : un questionnaire précis, ou une porte et ses branches. */
function entree(
  parcours?: string,
  mode?: string,
  transfert?: string,
): { initial: Choix | null; filtre: Filtre } {
  // `mode` seul ouvrait déjà le devis express ou complet : les liens envoyés le restent.
  if ((parcours === "particulier" || !parcours) && (mode === "express" || mode === "complet"))
    return { initial: { parcours: "particulier", mode }, filtre: parcours ? "particulier" : null };
  if (parcours === "mutation") return { initial: { parcours: "mutation" }, filtre: null };
  if (parcours === "entreprise")
    return transfert === "simple" || transfert === "projet"
      ? { initial: { parcours: "entreprise", transfert }, filtre: "entreprise" }
      : { initial: null, filtre: "entreprise" };
  if (parcours === "particulier") return { initial: null, filtre: "particulier" };
  return { initial: null, filtre: null };
}
