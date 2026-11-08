import { NextResponse } from "next/server";
import { q } from "@/crm/lib/db";
import { compterDemandesParEspace, lireRegles, listEspaces } from "@/lib/espaces-pro";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Les clients du CRM rattachés à chaque espace pro (crm.clients.espace_pro_id). Jamais bloquant. */
async function compterClientsParEspace(): Promise<Record<string, number>> {
  try {
    const rows = await q<{ id: string; n: number }>("select espace_pro_id as id, count(*)::int as n from clients where espace_pro_id is not null group by 1");
    return Object.fromEntries(rows.map((r) => [r.id, r.n]));
  } catch (e) {
    console.error("Espaces pro : comptage des clients rattachés impossible", e instanceof Error ? e.message : e);
    return {};
  }
}

export async function GET() {
  try {
    const [espaces, regles, demandes, clients, settings] = await Promise.all([
      listEspaces(),
      lireRegles(),
      compterDemandesParEspace().catch(() => ({}) as Record<string, number>),
      compterClientsParEspace(),
      getSettings(),
    ]);
    return NextResponse.json({
      espaces,
      // Les règles générales des grands comptes : l'écran les applique lui-même aux espaces qui les suivent.
      regles,
      demandes,
      // Les clients du CRM rattachés à chaque entreprise : ceux dont les dossiers paraissent dans son espace RH.
      clients,
      // L'adresse publique du site, pour composer le lien à transmettre.
      base: (settings.base_url || "").replace(/\/$/, ""),
      entreprise: {
        nom: settings.entreprise_nom,
        email: settings.entreprise_email,
        tel: settings.entreprise_tel,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
