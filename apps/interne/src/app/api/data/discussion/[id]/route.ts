import { currentUser } from "@/crm/lib/auth";
import { PORTE_EQUIPE_FICHIERS } from "@/crm/discussion/donnees";
import { lireFil, marquerLu, versVue } from "@/lib/espace-client/discussion";
import type { FilVue } from "@/lib/espace-client/discussion-vue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * La discussion d'un dossier de l'espace client, lue par le fil du CRM
 * (src/crm/discussion/FilClient) toutes les quinze secondes. Le proxy garde
 * déjà /api/data (session d'un compte de l'équipe) ; la route le revérifie.
 *
 *   GET   le fil (JSON), dossier de l'espace client par son identifiant ;
 *   POST  l'équipe a vu le fil : les messages du client sont marqués lus.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await currentUser();
  const { id } = await params;
  if (!UUID.test(id)) return json({ erreur: "Introuvable." }, 404);
  try {
    const vue: FilVue = { messages: (await lireFil(id, "service")).map((l) => versVue(l, PORTE_EQUIPE_FICHIERS)) };
    return json(vue);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Lecture impossible." }, 500);
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await currentUser();
  const { id } = await params;
  if (!UUID.test(id)) return json({ erreur: "Introuvable." }, 404);
  try {
    return json({ lus: await marquerLu(id, "equipe") });
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Enregistrement impossible." }, 500);
  }
}
