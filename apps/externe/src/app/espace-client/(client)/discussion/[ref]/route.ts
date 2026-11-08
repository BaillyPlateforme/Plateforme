import { lireFil, marquerLu, versVue } from "@/lib/espace-client/discussion";
import type { FilVue } from "@/lib/espace-client/discussion-vue";
import { PORTE_FICHIERS_CLIENT } from "@/lib/espace-client/fichiers";
import { apercuEquipe, clientConnecte, lireDonneesClient } from "@/lib/espace-client/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * La discussion d'un dossier, lue par le navigateur du client : la bulle
 * ouverte et la page « Mon conseiller » la relisent toutes les douze
 * secondes. Une route plutôt qu'une action serveur : les actions passent une
 * à une, et une lecture en cours retarderait un envoi ou un clic.
 *
 *   GET   le fil (JSON) ;
 *   POST  le client a vu le fil : les messages de l'équipe sont marqués lus.
 *
 * Comme toute page du client : la session (au registre ec_sessions), puis le
 * dossier cherché dans ce que la RLS rend au client. Le fil se lit avec sa
 * session (RLS). Pendant un aperçu de l'équipe, il n'y a pas de session de
 * client : le fil du dossier vérifié se lit par la clé de service, en lecture
 * seule, et rien n'est marqué lu — les indicateurs restent ceux du client.
 */

const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { "Cache-Control": "no-store" } });

async function dossierDuClient(reference: string) {
  const client = await clientConnecte();
  if (!client) return null;
  const d = await lireDonneesClient();
  const dossier = d.dossiers.find((x) => x.reference === decodeURIComponent(reference) && x.client_id === client.id);
  return dossier ? { dossier, apercu: !!(await apercuEquipe()) } : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  try {
    const c = await dossierDuClient(ref);
    if (!c) return json({ erreur: "Introuvable." }, 404);
    const lignes = await lireFil(c.dossier.id, c.apercu ? "service" : "session");
    const vue: FilVue = { messages: lignes.map((l) => versVue(l, PORTE_FICHIERS_CLIENT)), lectureSeule: c.apercu };
    return json(vue);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Lecture impossible." }, 500);
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  try {
    const c = await dossierDuClient(ref);
    if (!c) return json({ erreur: "Introuvable." }, 404);
    if (c.apercu) return json({ lus: 0 });
    return json({ lus: await marquerLu(c.dossier.id, "client") });
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Enregistrement impossible." }, 500);
  }
}
