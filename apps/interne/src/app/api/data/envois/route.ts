import { NextResponse } from "next/server";
import { etatEnvois } from "@/lib/envois";
import { lireEnvois } from "@/lib/envois/journal";
import { stripeConfigure } from "@/lib/espace-client/stripe-config";
import { exigerEquipe } from "@/lib/supabase/auth";
import { TACHES_VEILLE } from "@/taches/registre";
import { historiqueVeille } from "@/taches/veille";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Le suivi des envois et de la veille, pour Réglages › Envois et veille :
 * l'état réel des envois, le journal des derniers messages (toute la
 * plateforme), les dernières exécutions de la veille. Le proxy garde déjà
 * /api/data ; la route revérifie que c'est l'équipe.
 */
export async function GET() {
  try {
    await exigerEquipe();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Accès refusé" }, { status: 403 });
  }
  try {
    const [envois, executions] = await Promise.all([lireEnvois({ limite: 300 }), historiqueVeille(12)]);
    return NextResponse.json(
      {
        etat: etatEnvois(),
        paiement: stripeConfigure() ? "stripe" : "simule",
        veille: {
          secret: !!process.env.TACHES_SECRET?.trim(),
          taches: TACHES_VEILLE.map((t) => ({ cle: t.cle, libelle: t.libelle })),
          executions,
        },
        envois,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lecture impossible" }, { status: 500 });
  }
}
