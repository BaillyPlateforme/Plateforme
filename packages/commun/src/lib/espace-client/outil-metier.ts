import "server-only";

/*
 * Le pont vers l'outil métier de Bailly (nom et API encore à confirmer).
 * Le devis prévoit une demande d'avis automatique dès la signature du
 * document de fin par le client : quand l'outil sera branché, c'est lui qui
 * le dira, et qui fournira le lien de dépôt d'avis. D'ici là, la fin de
 * chantier se déclare depuis le back-office, et le lien vient de
 * ESPACE_CLIENT_LIEN_AVIS (la page d'avis de Bailly, à fournir par Bailly).
 *
 * Sans lien, la demande d'avis est journalisée mais ne part pas : le modèle
 * dirait au client que « le lien sera fourni par l'outil métier », ce qui
 * n'a pas à sortir de chez Bailly.
 */

export interface OutilMetier {
  /** Déclenche la demande d'avis. Rend le lien de dépôt d'avis quand l'outil en fournit un. */
  demanderAvis(dossierId: string): Promise<{ ok: boolean; lien: string | null; message: string }>;
}

/** Le lien de dépôt d'avis réglé dans l'environnement, s'il est une adresse https. */
export function lienRegle(): string | null {
  const v = process.env.ESPACE_CLIENT_LIEN_AVIS?.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

class OutilMetierSimule implements OutilMetier {
  async demanderAvis(dossierId: string) {
    const lien = lienRegle();
    return lien
      ? { ok: true, lien, message: `Demande d'avis du dossier ${dossierId} : lien de dépôt d'avis réglé (ESPACE_CLIENT_LIEN_AVIS).` }
      : { ok: true, lien: null, message: `Demande d'avis journalisée pour le dossier ${dossierId} (outil métier non branché, aucun lien de dépôt d'avis).` };
  }
}

export const outilMetier: OutilMetier = new OutilMetierSimule();
