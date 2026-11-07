import "server-only";

/*
 * Le pont vers l'outil métier de Bailly (nom et API encore à confirmer).
 * Le devis prévoit une demande d'avis automatique dès la signature du
 * document de fin par le client : quand l'outil sera branché, c'est lui qui
 * le dira. D'ici là, la fin de chantier se déclare depuis le back-office, et
 * la demande d'avis est un événement journalisé.
 */

export interface OutilMetier {
  /** Déclenche la demande d'avis. Rend le lien de dépôt d'avis quand l'outil en fournit un. */
  demanderAvis(dossierId: string): Promise<{ ok: boolean; lien: string | null; message: string }>;
}

class OutilMetierSimule implements OutilMetier {
  async demanderAvis(dossierId: string) {
    return { ok: true, lien: null, message: `Demande d'avis journalisée pour le dossier ${dossierId} (outil métier non branché).` };
  }
}

export const outilMetier: OutilMetier = new OutilMetierSimule();
