import { after } from "next/server";
import { servirPiece } from "@/lib/espace-client/discussion";
import { servirFichier } from "@/lib/espace-client/fichiers";
import { apercuEquipe, clientConnecte, lireDonneesClient } from "@/lib/espace-client/session";
import { noterPortail, requeteDe } from "@/lib/suivi-envois";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * La porte des fichiers du client. Il faut à la fois un lien signé encore
 * valable (cinq minutes) ET la session du client titulaire — masquages
 * respectés. La pièce est cherchée dans ce que la RLS rend au client : celle
 * d'un autre client n'y figure pas, et la réponse est la même qu'une pièce
 * qui n'existe pas. Le fichier lui-même sort par une URL signée du seau
 * privé, valable 60 secondes.
 *
 * Le PDF d'un devis ou d'une facture servi au client (jamais pendant un
 * aperçu de l'équipe) est noté au suivi : « a téléchargé le PDF du devis »
 * (lib/suivi-envois).
 *
 * L'équipe a sa propre porte, dans l'app interne (/api/data/espace-client/fichier).
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const client = await clientConnecte();
  if (!client) return new Response("Introuvable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const d = await lireDonneesClient();
  // La pièce jointe d'un message de la discussion : celle d'un dossier du client, et de lui seul.
  if (type === "msg") return servirPiece(id, new URL(req.url), (dossierId) => d.dossiers.some((x) => x.id === dossierId && x.client_id === client.id));
  const reponse = await servirFichier(d, type, id, new URL(req.url), (dossier, titulaire) => {
    if (dossier.client_id !== client.id || titulaire.id !== client.id) return false;
    if (type === "devis" && titulaire.masquer_devis) return false;
    if (type === "facture" && titulaire.masquer_factures) return false;
    return true;
  });
  if (reponse.ok && (type === "devis" || type === "facture") && !(await apercuEquipe())) {
    const piece = type === "devis" ? d.devis.find((p) => p.id === id) : d.factures.find((p) => p.id === id);
    const dossier = piece && d.dossiers.find((x) => x.id === piece.dossier_id);
    const r = requeteDe(req.headers);
    if (dossier) {
      after(() =>
        noterPortail({ page: type === "devis" ? "pdf_devis" : "pdf_facture", reference: dossier.reference, ecDossierId: dossier.id, crmDossierId: dossier.crm_dossier_id ?? null, envoiId: null }, r, "action"),
      );
    }
  }
  return reponse;
}
