import { createHash, timingSafeEqual } from "node:crypto";
import { executerVeille } from "@/taches/veille";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * La tâche de la veille, à appeler une fois par jour en fin d'après-midi par
 * le service cron de Railway (scripts/tache-veille.mjs) :
 *
 *   POST /api/taches/veille
 *   Authorization: Bearer <TACHES_SECRET>
 *
 * Hors du proxy de session (un cron n'a pas de session) : c'est le secret
 * qui ouvre la route, comparé à temps constant. Sans la variable
 * TACHES_SECRET, la route n'existe pas (404) ; sans le bon secret, 401.
 *
 * Idempotente par jour : un second appel le même jour répond « déjà
 * exécutée » sans rien relancer (voir src/taches/veille.ts).
 */

/** Deux secrets égaux ? Comparés par leurs empreintes, de même longueur : ni la longueur ni le contenu ne fuient par le temps de réponse. */
function egal(recu: string, attendu: string) {
  const a = createHash("sha256").update(recu).digest();
  const b = createHash("sha256").update(attendu).digest();
  return timingSafeEqual(a, b) && recu.length > 0;
}

export async function POST(req: Request) {
  const secret = process.env.TACHES_SECRET?.trim();
  if (!secret) return new Response("Introuvable.", { status: 404 });
  const recu = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!egal(recu, secret)) return Response.json({ error: "Accès refusé." }, { status: 401 });

  try {
    const r = await executerVeille({ declenchement: "planifie", par: "tâche planifiée" });
    const e = r.execution;
    return Response.json({
      lancee: r.lancee,
      ...(r.lancee ? {} : { raison: r.raison }),
      execution: e ? { id: e.id, jour: e.jour, cible: e.cible, statut: e.statut, debut: e.debut, fin: e.fin, taches: (e.resultat.taches ?? []).map((t) => ({ cle: t.cle, statut: t.statut, resume: t.resume })) } : null,
    });
  } catch (err) {
    console.error("Veille : exécution impossible", err instanceof Error ? err.message : err);
    return Response.json({ error: err instanceof Error ? err.message : "Exécution impossible." }, { status: 500 });
  }
}
