/*
 * Ce que le client répond à un devis depuis « Mes devis » : il ne retient pas
 * une formule, il demande une modification, ou — le devis expiré — un nouveau
 * devis. Chaque réponse est un message de sa discussion avec le conseiller
 * (ec_messages) : la conversation continue là, et le conseiller y répond
 * depuis le CRM.
 *
 * Ce module, pur (navigateur et serveur), écrit le message et le relit. La
 * première phrase dit toujours le geste et le numéro du devis de la même
 * façon : c'est elle qui permet à la page de retrouver la réponse dans le fil,
 * sans colonne ni table nouvelle (rien ne dépend d'une migration). Changer
 * une ouverture ci-dessous fait oublier les réponses écrites avec l'ancienne :
 * la page ne les marque plus, le fil les garde.
 *
 * Textes à valider par Bailly.
 */

export type GesteDevis = "refus" | "modification" | "renouvellement";

export const GESTES_DEVIS: GesteDevis[] = ["refus", "modification", "renouvellement"];

const OUVERTURE: Record<GesteDevis, string> = {
  refus: "Je ne retiens pas le devis",
  modification: "Je souhaite une modification du devis",
  renouvellement: "Pourriez-vous renouveler le devis",
};

interface DevisCite {
  numero: string;
  formule: string;
}

/** Le message posté dans la discussion, au nom du client. */
export function corpsReponse(geste: GesteDevis, devis: DevisCite, texte: string | null | undefined): string {
  const t = (texte ?? "").trim();
  const objet = `${OUVERTURE[geste]} ${devis.numero} (formule ${devis.formule})`;
  switch (geste) {
    case "refus":
      return t ? `${objet}.\n\nMotif : ${t}` : `${objet}.`;
    case "modification":
      return `${objet} :\n\n${t}`;
    case "renouvellement":
      return `${objet}, qui a expiré ?${t ? `\n\n${t}` : ""}`;
  }
}

/** Le geste d'un message du client sur ce devis, s'il en est un. */
export function gesteDuMessage(corps: string, numero: string): GesteDevis | null {
  for (const g of GESTES_DEVIS) if (corps.startsWith(`${OUVERTURE[g]} ${numero} `)) return g;
  return null;
}

export interface MessageDuFil {
  auteur: "client" | "equipe";
  corps: string;
  /** ISO. */
  le: string;
}

/** Ce que le client a déjà répondu sur un devis, et si l'équipe a écrit depuis. */
export interface SuiviReponse {
  refus: string | null;
  modification: string | null;
  /** Les demandes de modification envoyées, la plus récente comprise. */
  modifications: number;
  renouvellement: string | null;
  /** La dernière réponse du client, quel qu'en soit le geste. */
  derniere: { geste: GesteDevis; le: string } | null;
  /** L'équipe a écrit dans la discussion après cette dernière réponse. */
  reponduLe: string | null;
}

/** Les réponses du client, devis par devis, lues dans le fil (du plus ancien au plus récent). */
export function suiviDesReponses(fil: MessageDuFil[], devis: { id: string; numero: string }[]): Record<string, SuiviReponse> {
  const out: Record<string, SuiviReponse> = {};
  for (const v of devis) {
    const s: SuiviReponse = { refus: null, modification: null, modifications: 0, renouvellement: null, derniere: null, reponduLe: null };
    for (const m of fil) {
      if (m.auteur === "equipe") {
        if (s.derniere && m.le > s.derniere.le && !s.reponduLe) s.reponduLe = m.le;
        continue;
      }
      const g = gesteDuMessage(m.corps, v.numero);
      if (!g) continue;
      if (g === "modification") s.modifications++;
      s[g] = m.le;
      s.derniere = { geste: g, le: m.le };
      s.reponduLe = null;
    }
    out[v.id] = s;
  }
  return out;
}
