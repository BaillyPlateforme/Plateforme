import { lireDonnees } from "@/lib/espace-client/depot";
import { equipeConnectee } from "@/lib/espace-client/equipe";
import { lienValide, lireFichier } from "@/lib/espace-client/fichiers";
import { pdfDevis, pdfFacture, pdfTemoin, reponsePdf } from "@/lib/espace-client/pdf";
import { clientConnecte } from "@/lib/espace-client/session";
import type { PieceJointe } from "@/lib/espace-client/types";

export const runtime = "nodejs";

const refus = (texte: string, status: number) => new Response(texte, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Le seul chemin par lequel un fichier sort de l'espace client. Il faut à la
 * fois un lien signé encore valable (cinq minutes) ET une session qui a
 * droit au dossier : le client titulaire — masquages respectés — ou
 * l'équipe. Un lien recopié ailleurs ne sert donc à rien.
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const url = new URL(req.url);
  if (!lienValide(type, id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return refus("Lien expiré ou invalide : rechargez la page pour en obtenir un nouveau.", 403);
  }
  const telecharger = url.searchParams.get("dl") === "1";
  const d = await lireDonnees();

  // Le dossier de la pièce demandée.
  let dossierId: string | undefined;
  let photo: PieceJointe | undefined;
  if (type === "doc") dossierId = d.documents.find((x) => x.id === id)?.dossier_id;
  else if (type === "devis") dossierId = d.devis.find((x) => x.id === id)?.dossier_id;
  else if (type === "facture") dossierId = d.factures.find((x) => x.id === id)?.dossier_id;
  else if (type === "photo") {
    for (const c of d.conditions_livraison) {
      const p = c.photos.find((x) => x.id === id);
      if (p) [photo, dossierId] = [p, c.dossier_id];
    }
    for (const s of d.sav_declarations) {
      const p = s.photos.find((x) => x.id === id);
      if (p) [photo, dossierId] = [p, s.dossier_id];
    }
  }
  const dossier = d.dossiers.find((x) => x.id === dossierId);
  const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
  if (!dossier || !client) return refus("Introuvable.", 404);

  const visiteur = await clientConnecte();
  const titulaire = visiteur?.id === client.id && !(type === "devis" && client.masquer_devis) && !(type === "facture" && client.masquer_factures);
  if (!titulaire && !(await equipeConnectee())) return refus("Introuvable.", 404);

  if (type === "devis") {
    const devis = d.devis.find((x) => x.id === id)!;
    return reponsePdf(await pdfDevis(client, dossier, devis), `devis-${devis.numero}.pdf`, telecharger);
  }
  if (type === "facture") {
    const f = d.factures.find((x) => x.id === id)!;
    return reponsePdf(await pdfFacture(client, dossier, f), `facture-${f.numero}.pdf`, telecharger);
  }

  const chemin = type === "doc" ? d.documents.find((x) => x.id === id)!.chemin : photo!.chemin;
  const nom = type === "doc" ? d.documents.find((x) => x.id === id)!.nom_fichier : photo!.nom;
  const fichier = await lireFichier(chemin);
  if (!fichier) {
    // Les documents du jeu de démonstration n'ont pas de fichier : une page témoin en tient lieu.
    if (type === "doc") return reponsePdf(await pdfTemoin(dossier, d.documents.find((x) => x.id === id)!), nom.replace(/\.\w+$/, "") + ".pdf", telecharger);
    return refus("Ce fichier n'est plus disponible.", 404);
  }
  const affichable = /^(application\/pdf|image\/(jpeg|png|webp))$/.test(fichier.type);
  return new Response(new Uint8Array(fichier.donnees), {
    headers: {
      "Content-Type": fichier.type,
      "Content-Disposition": `${affichable && !telecharger ? "inline" : "attachment"}; filename="${nom.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
