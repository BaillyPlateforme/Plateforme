import { NextResponse } from "next/server";
import { exigerPorteur } from "@/terrain/lib/acces";
import { peutOuvrir } from "@/terrain/lib/planning";
import { photoParId, urlSignee } from "@/terrain/lib/photos";

export const dynamic = "force-dynamic";

/*
 * GET /api/terrain/photos/<id>[?taille=vignette][&telecharger=1] — la porte
 * des photos de chantier, pour la galerie du CRM comme pour l'outil terrain.
 *
 * Elle vérifie la session et le droit au dossier (l'équipe du bureau : tout
 * dossier ; un déménageur : ceux du planning d'hier à demain), puis renvoie
 * vers une URL signée du seau privé, valable une minute. Une adresse de
 * photo recopiée hors de l'app ne mène donc nulle part.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let porteur;
  try {
    porteur = await exigerPorteur();
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse(null, { status: 404 });
  const photo = await photoParId(id);
  if (!photo) return new NextResponse(null, { status: 404 });
  if (!(await peutOuvrir(porteur, photo.dossierId))) return new NextResponse(null, { status: 403 });

  const url = new URL(req.url);
  const vignette = url.searchParams.get("taille") === "vignette" && photo.cheminVignette;
  const chemin = vignette ? photo.cheminVignette! : photo.chemin;
  // Au téléchargement, un nom qui dit ce qu'est la photo : BD-2026-0301_avant_2026-11-07_1403.jpg.
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(photo.priseLe)).replace(":", "");
  const nom = url.searchParams.has("telecharger") ? `${photo.ref}_${photo.categorie}_${photo.jour}_${heure}.${chemin.split(".").pop()}` : undefined;

  try {
    const cible = await urlSignee(chemin, nom);
    // Le navigateur peut reprendre ce renvoi pendant moins d'une minute, pas au-delà : l'URL signée aurait expiré.
    return NextResponse.redirect(cible, { status: 302, headers: { "Cache-Control": "private, max-age=45" } });
  } catch (e) {
    console.error("Outil terrain : lien d'une photo", e);
    return new NextResponse(null, { status: 502 });
  }
}
