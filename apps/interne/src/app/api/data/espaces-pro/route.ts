import { NextResponse } from "next/server";
import { compterDemandesParEspace, lireRegles, listEspaces } from "@/lib/espaces-pro";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [espaces, regles, demandes, settings] = await Promise.all([
      listEspaces(),
      lireRegles(),
      compterDemandesParEspace().catch(() => ({}) as Record<string, number>),
      getSettings(),
    ]);
    return NextResponse.json({
      espaces,
      // Les règles générales des grands comptes : l'écran les applique lui-même aux espaces qui les suivent.
      regles,
      demandes,
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
