import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/templates";
import { listAlerts } from "@/lib/alerts";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [templates, rules, settings] = await Promise.all([
      listTemplates(),
      listAlerts(),
      getSettings(),
    ]);
    return NextResponse.json({
      templates,
      rules,
      // L'aperçu des modèles s'en sert pour afficher le vrai logo.
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
