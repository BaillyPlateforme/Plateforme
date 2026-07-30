import { renderToBuffer } from "@react-pdf/renderer";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { DevisPdf, type PdfTrajet } from "@/lib/DevisPdf";
import type { DevisRow, RequestRow } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/devis/[id]/pdf → estimation en PDF téléchargeable.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase.from("devis").select("*").eq("id", id).maybeSingle();
  if (!data) return new Response("Devis introuvable", { status: 404 });
  const devis = data as DevisRow;

  let trajet: PdfTrajet | undefined;
  if (devis.request_id) {
    const { data: req } = await supabase.from("requests").select("depart_ville, arrivee_ville, volume_m3, date_souhaitee, flexibilite").eq("id", devis.request_id).maybeSingle();
    const r = (req as Partial<RequestRow>) ?? {};
    trajet = {
      depart: r.depart_ville ?? null,
      arrivee: r.arrivee_ville ?? null,
      volume: r.volume_m3 ?? null,
      quand: r.date_souhaitee ? new Date(r.date_souhaitee).toLocaleDateString("fr-FR") : (r.flexibilite ?? null),
    };
  }

  const settings = await getSettings();
  const buffer = await renderToBuffer(DevisPdf({ devis, settings, trajet }));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${devis.reference}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
