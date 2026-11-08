import { facturationDossier } from "./donnees";
import CarteFacturationClient from "./CarteFacturationClient";

/**
 * La carte « Facturation » d'un dossier, prête à poser sur la fiche : elle
 * lit elle-même ses données (règlements, factures, avoirs, client payeur,
 * situation du dossier) et porte toutes les fenêtres. Sur la fiche :
 *
 *   <CarteFacturation dossierId={id} />
 *
 * L'adresse `?encaisser=arrhes` (ou `reglement`) ouvre la fenêtre
 * d'encaissement à l'arrivée : un bouton ailleurs sur la fiche (la carte du
 * devis, par exemple) n'a besoin que d'un lien `?encaisser=arrhes#facturation`.
 */
export default async function CarteFacturation({ dossierId }: { dossierId: number }) {
  const d = await facturationDossier(dossierId);
  if (!d) return null;
  return <CarteFacturationClient d={d} />;
}
