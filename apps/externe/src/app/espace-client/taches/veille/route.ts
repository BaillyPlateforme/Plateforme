import { timingSafeEqual } from "node:crypto";
import { lireDonnees } from "@/lib/espace-client/depot";
import { aujourdhui } from "@/lib/espace-client/format";
import { plusJours } from "@/lib/espace-client/cartons";
import { calculerTourneeDuSamedi, envoyerCreneauxDuSamedi } from "@/lib/espace-client/samedi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * L'envoi automatique de la veille, à appeler une fois par jour en fin
 * d'après-midi par une tâche planifiée (Railway Cron, n8n…) :
 *
 *   POST /espace-client/taches/veille
 *   Authorization: Bearer <ESPACE_CLIENT_CRON_SECRET>
 *
 * Si demain est un samedi de livraison, la tournée est calculée quand elle
 * ne l'est pas encore, puis chaque client prêt reçoit son créneau (SMS et
 * e-mail). Sans la variable ESPACE_CLIENT_CRON_SECRET, la route n'existe pas.
 */
export async function POST(req: Request) {
  const secret = process.env.ESPACE_CLIENT_CRON_SECRET;
  if (!secret) return new Response("Introuvable.", { status: 404 });
  const recu = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const attendu = Buffer.from(secret);
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) return new Response("Accès refusé.", { status: 401 });

  const demain = plusJours(aujourdhui(), 1);
  const d = await lireDonnees();
  const livraisons = d.livraisons_cartons.filter((l) => l.date_samedi === demain && l.statut !== "livree");
  if (!livraisons.length) return Response.json({ demain, livraisons: 0, envoyes: 0 });
  if (livraisons.some((l) => !l.creneau_debut)) await calculerTourneeDuSamedi(demain);
  const r = await envoyerCreneauxDuSamedi(demain);
  return Response.json({ demain, livraisons: livraisons.length, ...r });
}
