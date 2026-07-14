import { renderToBuffer } from "@react-pdf/renderer";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { DevisPdf } from "@/lib/DevisPdf";
import type { DevisRow } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/devis/[id]/pdf → devis en PDF téléchargeable.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase.from("devis").select("*").eq("id", id).maybeSingle();
  if (!data) return new Response("Devis introuvable", { status: 404 });
  const devis = data as DevisRow;

  const settings = await getSettings();
  const buffer = await renderToBuffer(DevisPdf({ devis, settings }));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${devis.reference}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
