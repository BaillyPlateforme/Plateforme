import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { DevisPdf, type PdfTrajet } from "@/lib/DevisPdf";
import type { DevisRow, RequestRow } from "@/lib/types";
import { espacePourDevis } from "@/lib/espace-demande";

export interface EstimationPourEmail {
  devisId: string;
  reference: string;
  validite: string;
  montant_ht: number;
  montant_ttc: number;
  lignes: { label: string; amount: number }[];
  /**
   * Le PDF, prêt à joindre — rendu à la demande, et une seule fois.
   * Rien si le rendu échoue : le message part alors sans pièce jointe.
   */
  pdf: () => Promise<string | undefined>;
}

/**
 * L'estimation d'une demande, sous les deux formes dont l'e-mail a besoin :
 * ses lignes et ses montants, pour le détail affiché dans le message, et son
 * PDF, pour la pièce jointe. Le PDF coûte près d'une seconde à rendre : il ne
 * l'est que si un message le joint vraiment.
 *
 * Ne lève jamais : une estimation manquante ne doit pas empêcher le message
 * de partir — il part sans elle, et l'historique le dira.
 */
export async function estimationDeLaDemande(
  requestId: string | undefined,
): Promise<EstimationPourEmail | null> {
  if (!requestId) return null;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("devis")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const devis = data as DevisRow;

    const { data: req } = await supabase
      .from("requests")
      .select("depart_ville, arrivee_ville, volume_m3, date_souhaitee, flexibilite")
      .eq("id", requestId)
      .maybeSingle();
    const r = (req as Partial<RequestRow>) ?? {};
    const trajet: PdfTrajet = {
      depart: r.depart_ville ?? null,
      arrivee: r.arrivee_ville ?? null,
      volume: r.volume_m3 ?? null,
      quand: r.date_souhaitee
        ? new Date(r.date_souhaitee).toLocaleDateString("fr-FR")
        : (r.flexibilite ?? null),
    };

    let rendu: Promise<string | undefined> | null = null;
    const pdf = () =>
      (rendu ??= (async () => {
        try {
          const [settings, espace] = await Promise.all([getSettings(), espacePourDevis(requestId)]);
          const buffer = await renderToBuffer(DevisPdf({ devis, settings, trajet, espace }));
          return Buffer.from(buffer).toString("base64");
        } catch {
          return undefined; // le PDF a échoué : le message part sans pièce jointe
        }
      })());

    return {
      devisId: devis.id,
      reference: devis.reference,
      validite: devis.valid_until
        ? new Date(devis.valid_until).toLocaleDateString("fr-FR")
        : "",
      montant_ht: Number(devis.montant_ht),
      montant_ttc: Number(devis.montant_ttc),
      lignes: (devis.lignes ?? []).map((l) => ({ label: l.label, amount: l.amount })),
      pdf,
    };
  } catch {
    return null;
  }
}
