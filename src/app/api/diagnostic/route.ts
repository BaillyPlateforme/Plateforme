import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Mesure, depuis le serveur qui sert l'application, le temps d'un aller-retour
 * vers la base.
 *
 * C'est le seul chiffre qui manque pour expliquer une lenteur en production :
 * si l'hébergement et Supabase ne sont pas dans la même région, chaque requête
 * paie 150 ms et plus, et aucune optimisation de code ne les récupère.
 */
export async function GET() {
  const supabase = createServiceClient();

  const mesures: Record<string, number> = {};
  const chrono = async (nom: string, f: () => PromiseLike<unknown>) => {
    const d = Date.now();
    await f();
    mesures[nom] = Date.now() - d;
  };

  await chrono("ping", () => supabase.from("settings").select("id").limit(1));
  await chrono("ping_2", () => supabase.from("settings").select("id").limit(1));
  await chrono("liste_demandes", () =>
    supabase.from("requests").select("id").order("created_at", { ascending: false }).limit(200),
  );

  return NextResponse.json({
    aller_retour_base_ms: mesures,
    lecture:
      "ping_2 est l'aller-retour à vide, connexion déjà chaude. Au-delà de 80 ms, " +
      "l'hébergement et la base ne sont probablement pas dans la même région.",
    region_hebergement: process.env.RAILWAY_REPLICA_REGION ?? process.env.VERCEL_REGION ?? "inconnue",
    service: process.env.RAILWAY_SERVICE_NAME ?? null,
  });
}
