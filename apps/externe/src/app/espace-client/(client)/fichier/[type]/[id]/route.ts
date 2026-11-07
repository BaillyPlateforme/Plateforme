import { servirFichier } from "@/lib/espace-client/fichiers";
import { clientConnecte, lireDonneesClient } from "@/lib/espace-client/session";

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
 * L'équipe a sa propre porte, dans l'app interne (/api/data/espace-client/fichier).
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const client = await clientConnecte();
  if (!client) return new Response("Introuvable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const d = await lireDonneesClient();
  return servirFichier(d, type, id, new URL(req.url), (dossier, titulaire) => {
    if (dossier.client_id !== client.id || titulaire.id !== client.id) return false;
    if (type === "devis" && titulaire.masquer_devis) return false;
    if (type === "facture" && titulaire.masquer_factures) return false;
    return true;
  });
}
