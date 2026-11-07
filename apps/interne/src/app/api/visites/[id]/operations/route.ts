import { NextResponse } from "next/server";
import { projeterEspace } from "@/crm/lib/espace";
import { equipier, identifiant, refus } from "@/crm/visites/acces";
import { appliquerOperations, ErreurSaisie, lireOperations } from "@/crm/visites/operations";
import { retirerFichiers } from "@/terrain/lib/photos";

export const dynamic = "force-dynamic";

/*
 * POST /api/visites/<id>/operations — l'enregistrement continu de la
 * tablette : un lot d'opérations ({ ops: [...] }), appliqué d'un seul
 * tenant. Rend le volume du dossier recalculé et l'heure de l'enregistrement.
 *
 * La tablette l'appelle par fetch (keepalive) et, quand l'onglet se ferme,
 * par navigator.sendBeacon : le corps arrive alors en text/plain, il se lit
 * de la même façon.
 */

/** Le volume du dossier vu du client ne suit pas chaque frappe : une projection toutes les 20 secondes au plus. */
const DERNIERE_PROJECTION = new Map<number, number>();
const INTERVALLE_MS = 20_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await equipier())) return refus("Session expirée : reconnectez-vous.", 401);
  const id = identifiant((await params).id);
  if (!id) return refus("Visite introuvable.", 404);

  let corps: unknown;
  try {
    corps = JSON.parse(await req.text());
  } catch {
    return refus("Envoi illisible.", 400);
  }

  try {
    const ops = lireOperations(corps);
    const r = await appliquerOperations(id, ops);
    if (r.photosRetirees.length) await retirerFichiers(r.photosRetirees).catch(() => undefined);
    const derniere = DERNIERE_PROJECTION.get(r.dossierId) ?? 0;
    if (r.volume !== r.volumeAvant && Date.now() - derniere > INTERVALLE_MS) {
      DERNIERE_PROJECTION.set(r.dossierId, Date.now());
      await projeterEspace(r.dossierId);
    }
    return NextResponse.json({ ok: true, volume: r.volume, majLe: r.majLe, recus: ops.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErreurSaisie) return refus(e.message, e.statut);
    console.error("Visite technique : enregistrement de la saisie", e);
    return refus("Le serveur n'a pas pu enregistrer : nouvel essai dans un instant.", 502);
  }
}
