import "server-only";
import { randomUUID } from "node:crypto";
import { estDemo } from "./config";
import { lienValide, nomPropre, reponseDuSeau, SEAU_MODELES } from "./fichiers";
import { pdfTemoinModele, reponsePdf } from "./pdf";
import type { Donnees, DocumentRequirement, ModelePiece } from "./types";

/*
 * Les modèles à télécharger des pièces à fournir (migration 0021) : le
 * CERFA vierge et son exemple rempli, le certificat de non cession… L'équipe
 * les ajoute, les remplace et les retire depuis l'éditeur des pièces du
 * back-office ; le client les voit sur la pièce, « Télécharger le modèle ».
 *
 * Les fichiers vivent dans le seau privé « espace-client-modeles », jamais
 * dans le dépôt Git, qui est public. Ils sortent comme les autres fichiers de
 * l'espace : un lien signé de cinq minutes, une session qui y a droit, puis
 * une URL signée du seau valable 60 secondes. Un modèle n'est à aucun
 * dossier : il se sert au client dont un dossier demande sa pièce, et à
 * l'équipe.
 *
 * En démonstration (en mémoire), les modèles du jeu de départ n'ont pas de
 * fichier : une page témoin en tient lieu. Ceux que l'équipe dépose en
 * démonstration restent en mémoire, comme les autres fichiers.
 */

/** Où ranger un modèle dans le seau : sous sa pièce, avec un préfixe qui rend chaque dépôt unique. */
export function cheminModele(requirementId: string, nom: string) {
  return `modeles/${requirementId}/${randomUUID().slice(0, 8)}-${nomPropre(nom)}`;
}

/** Les modèles d'une pièce, dans leur ordre. */
export const modelesDe = (d: Pick<Donnees, "modeles_pieces">, requirementId: string): ModelePiece[] =>
  (d.modeles_pieces ?? []).filter((m) => m.requirement_id === requirementId).sort((a, b) => a.ordre - b.ordre || a.created_at.localeCompare(b.created_at));

const refus = (texte: string, status: number) =>
  new Response(texte, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Sert un modèle, une fois le lien vérifié et le droit établi. `autorise` a
 * le dernier mot sur la pièce du modèle : pour le client, un de ses dossiers
 * la demande ; pour l'équipe, toujours. Toujours en téléchargement : un
 * modèle se remplit, il ne se lit pas dans la page.
 */
export async function servirModele(d: Donnees, id: string, url: URL, autorise: (piece: DocumentRequirement) => boolean): Promise<Response> {
  if (!lienValide("modele", id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return refus("Lien expiré ou invalide : rechargez la page pour en obtenir un nouveau.", 403);
  }
  const m = (d.modeles_pieces ?? []).find((x) => x.id === id);
  const piece = m && d.document_requirements.find((r) => r.id === m.requirement_id);
  // Même réponse qu'il n'existe pas ou qu'il ne soit pas pour vous : rien ne se devine.
  if (!m || !piece || !autorise(piece)) return refus("Introuvable.", 404);
  const reponse = await reponseDuSeau(m.chemin, m.nom_fichier, true, SEAU_MODELES);
  if (reponse) return reponse;
  if (estDemo()) return reponsePdf(await pdfTemoinModele(piece.libelle, m), `${m.nom_fichier.replace(/\.\w+$/, "")}.pdf`, true);
  return refus("Ce modèle n'est plus disponible : demandez-le à votre conseiller.", 404);
}
