import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { secretPresente } from "@/lib/secret-partage";
import { adresseIp } from "@/lib/limites";

export const dynamic = "force-dynamic";

/**
 * Mesure, depuis le serveur qui sert l'application, le temps d'un aller-retour
 * vers la base.
 *
 * C'est le seul chiffre qui manque pour expliquer une lenteur en production :
 * si l'hébergement et Supabase ne sont pas dans la même région, chaque requête
 * paie 150 ms et plus, et aucune optimisation de code ne les récupère.
 *
 * Réservée au dépannage : INACTIVE sans DIAGNOSTIC_SECRET (404), puis
 * « Authorization: Bearer <secret> ». Publique, elle révélait le service et
 * la région, et lançait trois requêtes en base à chaque appel.
 */
export async function GET(req: Request) {
  const secret = process.env.DIAGNOSTIC_SECRET?.trim();
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!secretPresente(req, secret)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
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
    // L'adresse du visiteur telle que l'hébergeur la transmet : de quoi vérifier que les limites
    // par adresse IP lisent la vraie (et qu'un en-tête forgé par le visiteur n'y change rien).
    adresse: {
      retenue: adresseIp(req.headers),
      x_forwarded_for: req.headers.get("x-forwarded-for"),
      x_real_ip: req.headers.get("x-real-ip"),
      x_envoy_external_address: req.headers.get("x-envoy-external-address"),
      forwarded: req.headers.get("forwarded"),
    },
  });
}
