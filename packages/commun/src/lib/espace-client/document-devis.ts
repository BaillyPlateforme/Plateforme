import "server-only";
import { versInterne } from "@/lib/adresses";
import { desceller, sceller } from "./signature";

/*
 * Le devis complet d'un devis du CRM, tel que le CRM l'imprime : c'est ce
 * document que le client ouvre depuis « Mes devis », pas un résumé. Il est
 * mis en page par l'app interne (DevisBailly), sur une page publique
 * (/signature/document/<jeton>) que seul un lien signé ouvre :
 *   - le jeton porte le numéro du devis du CRM et une échéance de deux
 *     heures, scellés avec la clé de l'espace client (la même pour les deux
 *     apps, comme le jeton d'aperçu de l'équipe) ;
 *   - la page d'espace qui émet le lien a déjà vérifié que le devis est au
 *     client ; le jeton ne sert à rien d'autre qu'à lire ce devis.
 */

const USAGE = "document-devis";
const DUREE_MS = 2 * 60 * 60 * 1000;

export const lienDocumentDevis = (crmDevisId: number) =>
  versInterne(`/signature/document/${sceller({ exp: Date.now() + DUREE_MS, d: crmDevisId }, USAGE)}`);

/** Le devis du CRM que désigne le jeton, s'il est intact et pas échu. */
export function devisDuLienDocument(jeton: string): number | null {
  // Un « % » isolé dans l'adresse ferait lever decodeURIComponent : la page publique
  // doit dire « lien expiré », pas tomber en erreur.
  let brut: string;
  try {
    brut = decodeURIComponent(jeton);
  } catch {
    return null;
  }
  const c = desceller<{ exp: number; d: unknown }>(brut, USAGE);
  return c && typeof c.d === "number" && Number.isInteger(c.d) && c.d > 0 ? c.d : null;
}
