import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { verifierConnexionEnvois } from "@/lib/connexion-envois";
import { refusHorsEquipe } from "@/crm/lib/garde-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const refus = await refusHorsEquipe();
  if (refus) return refus;
  try {
    // La connexion du fournisseur des envois en vigueur (SendGrid et Twilio, ou Brevo avant la bascule) : jamais une clé.
    const [settings, connexion] = await Promise.all([getSettings(), verifierConnexionEnvois()]);
    return NextResponse.json({ settings, connexion });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lecture impossible" },
      { status: 500 },
    );
  }
}
