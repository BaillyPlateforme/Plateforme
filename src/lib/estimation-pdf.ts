import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { DevisPdf, type PdfTrajet } from "@/lib/DevisPdf";
import type { DevisRow, RequestRow } from "@/lib/types";

export interface EstimationPourEmail {
  devisId: string;
  reference: string;
  validite: string;
  lignes: { label: string; amount: number }[];
  /** Le PDF, prêt à joindre. Absent si le rendu a échoué. */
  pdfBase64?: string;
}

/**
 * L'estimation d'une demande, sous les deux formes dont l'e-mail a besoin :
 * ses lignes, pour le détail affiché dans le message, et son PDF, pour la
 * pièce jointe.
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

    const settings = await getSettings();
    let pdfBase64: string | undefined;
    try {
      const buffer = await renderToBuffer(DevisPdf({ devis, settings, trajet }));
      pdfBase64 = Buffer.from(buffer).toString("base64");
    } catch {
      /* le PDF a échoué : le message part sans pièce jointe */
    }

    return {
      devisId: devis.id,
      reference: devis.reference,
      validite: devis.valid_until
        ? new Date(devis.valid_until).toLocaleDateString("fr-FR")
        : "",
      lignes: (devis.lignes ?? []).map((l) => ({ label: l.label, amount: l.amount })),
      pdfBase64,
    };
  } catch {
    return null;
  }
}
