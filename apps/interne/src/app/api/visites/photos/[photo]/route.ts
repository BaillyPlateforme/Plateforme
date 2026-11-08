import { NextResponse } from "next/server";
import { q1 } from "@/crm/lib/db";
import { journaliser } from "@/crm/lib/journal";
import { equipier, identifiant, refus } from "@/crm/visites/acces";
import { retirerFichiers, urlSignee } from "@/terrain/lib/photos";

export const dynamic = "force-dynamic";

/*
 * /api/visites/photos/<id>[?taille=vignette] — la porte des photos de visite.
 *
 * GET : un membre de l'équipe, et lui seul, est renvoyé vers une URL signée
 * du seau privé, valable une minute. Une adresse recopiée hors de l'app ne
 * mène nulle part.
 *
 * DELETE : retire une photo d'une visite en cours. Une fois le compte-rendu
 * signé, la base le refuse (déclencheur crm.photo_visite_figee).
 */

export async function GET(req: Request, { params }: { params: Promise<{ photo: string }> }) {
  if (!(await equipier())) return new NextResponse(null, { status: 401 });
  const id = identifiant((await params).photo);
  if (!id) return new NextResponse(null, { status: 404 });
  const p = await q1<{ chemin: string; chemin_vignette: string | null }>("select chemin, chemin_vignette from visite_photos where id = $1", [id]);
  if (!p) return new NextResponse(null, { status: 404 });
  const vignette = new URL(req.url).searchParams.get("taille") === "vignette" && p.chemin_vignette;
  try {
    const cible = await urlSignee(vignette ? p.chemin_vignette! : p.chemin);
    return NextResponse.redirect(cible, { status: 302, headers: { "Cache-Control": "private, max-age=45" } });
  } catch (e) {
    console.error("Visite technique : lien d'une photo", e);
    return new NextResponse(null, { status: 502 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ photo: string }> }) {
  if (!(await equipier())) return refus("Session expirée : reconnectez-vous.", 401);
  const id = identifiant((await params).photo);
  if (!id) return refus("Photo introuvable.", 404);
  try {
    const r = await q1<{ chemin: string; chemin_vignette: string | null; piece_nom: string | null; visite_id: number; dossier_id: number }>(
      `delete from visite_photos p using visites v where p.id = $1 and v.id = p.visite_id and v.statut = 'en_cours'
       returning p.chemin, p.chemin_vignette, p.piece_nom, p.visite_id, v.dossier_id`,
      [id],
    );
    if (!r) return refus("Cette photo ne peut plus être retirée.", 409);
    await retirerFichiers([r.chemin, r.chemin_vignette]).catch(() => undefined);
    await journaliser({
      action: "photo_visite.supprime", libelle: `Photo de visite technique retirée${r.piece_nom ? ` (${r.piece_nom})` : ""}`, objet: { type: "photo_visite", id },
      dossierId: r.dossier_id, details: { visite_id: r.visite_id, piece: r.piece_nom },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Visite technique : retrait d'une photo", e);
    return refus("Retrait impossible pour l'instant.", 502);
  }
}
