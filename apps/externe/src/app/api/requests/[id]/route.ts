import { NextResponse, after } from "next/server";
import { createRequestSchema } from "@/lib/schemas";
import { ModificationRefusee, modifierDemande } from "@/lib/requests";
import { adresseIp, fenetres, reponseTropDeDemandes, reserver } from "@/lib/limites";

/*
 * PUT /api/requests/[id] — le client corrige sa demande depuis l'écran de son
 * estimation (« Modifier ma demande »). Le jeton remis à la création
 * (en-tête x-jeton-modification) est la seule clé ; la même demande est mise
 * à jour, et l'estimation recalculée après la réponse, comme à la création.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jeton = req.headers.get("x-jeton-modification") ?? "";
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const parsed = createRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });
  const refus = reserver([{ cle: `modification:ip:${adresseIp(req.headers)}`, fenetres: fenetres("MODIFICATIONS", { minute: 5, heure: 20, jour: 40 }) }]);
  if (refus) return reponseTropDeDemandes(refus, "Votre demande vient déjà d'être modifiée plusieurs fois.");
  try {
    const { demande, suite } = await modifierDemande(id, jeton, parsed.data);
    after(() => suite().catch((e) => console.error(`[demande ${demande.id}] suite de la modification en échec :`, e instanceof Error ? e.message : e)));
    return NextResponse.json({ id: demande.id, status: demande.status });
  } catch (e) {
    if (e instanceof ModificationRefusee) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}
