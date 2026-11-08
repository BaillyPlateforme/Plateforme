import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { photoCaisse } from "@/crm/garde-meuble/donnees";
import { urlSignee } from "@/terrain/lib/photos";

export const dynamic = "force-dynamic";

/*
 * GET /api/garde-meuble/photos/<id> — la photo d'une caisse de garde-meuble.
 * Le proxy exige déjà une session de l'équipe ; la route la revérifie, puis
 * renvoie vers une URL signée du seau privé, valable une minute.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await currentUser();
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse(null, { status: 404 });
  const p = await photoCaisse(id);
  if (!p) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.redirect(await urlSignee(p.chemin), { status: 302, headers: { "Cache-Control": "private, max-age=45" } });
  } catch (e) {
    console.error("Garde-meuble : lien d'une photo", e);
    return new NextResponse(null, { status: 502 });
  }
}
