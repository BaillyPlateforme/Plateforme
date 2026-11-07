import { NextResponse } from "next/server";
import { q, q1 } from "@/crm/lib/db";
import { equipier, identifiant, refus } from "@/crm/visites/acces";
import { assurerSeau, deposer, retirerFichiers, typeImage } from "@/terrain/lib/photos";
import { PLAFOND_PHOTO, PLAFOND_VIGNETTE } from "@/terrain/regles";

export const dynamic = "force-dynamic";

/*
 * POST /api/visites/<id>/photos — une photo de la visite, rangée dans une
 * pièce. Le formulaire porte : cle (tirée par la tablette), piece (la clé de
 * la pièce), photo et vignette (préparées dans le navigateur, comme celles de
 * l'outil terrain), largeur, hauteur.
 *
 * Les fichiers rejoignent le seau privé de l'outil terrain, sous
 * visites/<dossier>/<visite>/ : aucune adresse publique, une URL signée d'une
 * minute à chaque affichage. Une photo renvoyée avec la même clé n'est
 * gardée qu'une fois. Une visite signée n'en accepte plus.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function nombre(v: FormDataEntryValue | null, min: number, max: number) {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await equipier();
  if (!u) return refus("Session expirée : reconnectez-vous.", 401);
  const visiteId = identifiant((await params).id);
  if (!visiteId) return refus("Visite introuvable.", 404);

  const form = await req.formData().catch(() => null);
  if (!form) return refus("Envoi illisible : réessayez.", 400);
  const cle = String(form.get("cle") ?? "").toLowerCase();
  const pieceCle = String(form.get("piece") ?? "").toLowerCase();
  const photo = form.get("photo");
  const vignette = form.get("vignette");
  if (!UUID.test(cle) || !UUID.test(pieceCle)) return refus("Envoi incomplet.", 400);
  if (!(photo instanceof File) || photo.size === 0) return refus("La photo manque.", 400);
  if (photo.size > PLAFOND_PHOTO) return refus("Photo trop lourde (15 Mo au plus).", 413);
  if (vignette instanceof File && vignette.size > PLAFOND_VIGNETTE) return refus("Vignette trop lourde.", 413);

  const v = await q1<{ dossier_id: number; statut: string }>("select dossier_id, statut from visites where id = $1", [visiteId]);
  if (!v) return refus("Visite introuvable.", 404);
  if (v.statut === "signee") return refus("Le compte-rendu est signé : la visite ne prend plus de photos.", 409);
  const piece = await q1<{ nom: string }>("select nom from pieces where cle = $1 and dossier_id = $2", [pieceCle, v.dossier_id]);
  if (!piece) return refus("Cette pièce n'est pas encore enregistrée : réessayez dans un instant.", 409);

  const deja = await q1<{ id: number; visite_id: number }>("select id, visite_id from visite_photos where cle = $1", [cle]);
  if (deja) return deja.visite_id === visiteId ? NextResponse.json({ id: deja.id, deja: true }) : refus("Clé déjà utilisée.", 409);

  const octets = Buffer.from(await photo.arrayBuffer());
  const genre = typeImage(octets);
  if (!genre) return refus("Ce fichier n'est pas une photo (JPEG, PNG, WebP ou HEIC).", 415);
  const octetsV = vignette instanceof File && vignette.size > 0 ? Buffer.from(await vignette.arrayBuffer()) : null;
  const vignetteOk = octetsV && typeImage(octetsV)?.type === "image/jpeg" ? octetsV : null;

  const base = `visites/${v.dossier_id}/${visiteId}/${cle}`;
  const chemin = `${base}.${genre.ext}`;
  const cheminVignette = vignetteOk ? `${base}-v.jpg` : null;
  try {
    await assurerSeau();
    await deposer(chemin, octets, genre.type);
    if (vignetteOk && cheminVignette) await deposer(cheminVignette, vignetteOk, "image/jpeg");
    const [r] = await q<{ id: number }>(
      `insert into visite_photos (cle, visite_id, piece_cle, piece_nom, chemin, chemin_vignette, type, taille, largeur, hauteur, auteur_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (cle) do nothing returning id`,
      [cle, visiteId, pieceCle, piece.nom, chemin, cheminVignette, genre.type, octets.length, nombre(form.get("largeur"), 1, 20_000), nombre(form.get("hauteur"), 1, 20_000), u.id],
    ).catch(async (e) => {
      await retirerFichiers([chemin, cheminVignette]).catch(() => undefined);
      throw e;
    });
    if (!r) return refus("La photo n'a pas pu être enregistrée : réessayez.", 500);
    return NextResponse.json({ id: r.id, vignette: !!cheminVignette }, { status: 201 });
  } catch (e) {
    console.error("Visite technique : envoi d'une photo", e);
    return refus("Le serveur n'a pas pu garder la photo : réessayez dans un instant.", 502);
  }
}
