import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { DevisRow, RequestRow } from "@/lib/types";
import { espaceDeLaDemande } from "@/lib/espaces";

export const dynamic = "force-dynamic";

// GET /api/requests/[id]/devis — devis auto-généré d'une demande (pour l'affichage instantané côté client).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Un espace pro peut ne pas montrer le prix au client. Cette adresse est
  // publique : le refuser ici, et pas seulement à l'écran, c'est ce qui le
  // tient vraiment hors de portée.
  const { data: demande } = await supabase.from("requests").select("raw_payload").eq("id", id).maybeSingle();
  if (espaceDeLaDemande(demande)?.afficher_estimation === false) {
    return NextResponse.json({ error: "Estimation non communiquée" }, { status: 404 });
  }

  const { data: devis } = await supabase
    .from("devis")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!devis) return NextResponse.json({ error: "Devis en préparation" }, { status: 404 });

  const d = devis as DevisRow;
  const { data: req } = await supabase.from("requests").select("depart_ville, arrivee_ville, volume_m3, date_souhaitee").eq("id", id).maybeSingle();
  const r = (req as Partial<RequestRow>) ?? {};

  return NextResponse.json({
    id: d.id,
    reference: d.reference,
    montant_ht: d.montant_ht,
    montant_tva: d.montant_tva,
    montant_ttc: d.montant_ttc,
    lignes: d.lignes,
    valid_until: d.valid_until,
    ville_depart: r.depart_ville ?? null,
    ville_arrivee: r.arrivee_ville ?? null,
    volume_m3: r.volume_m3 ?? null,
  });
}
