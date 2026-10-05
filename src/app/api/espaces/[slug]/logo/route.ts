import { getEspace, lireLogo } from "@/lib/espaces-pro";

export const runtime = "nodejs";

// GET /api/espaces/[slug]/logo — le logo d'un espace pro.
// Public : la page de l'espace l'affiche, et les e-mails le chargent par cette
// adresse (une boîte mail ne lit pas une image embarquée dans le message).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const espace = await getEspace(slug).catch(() => null);
  const logo = espace ? await lireLogo(espace) : null;
  if (!logo) return new Response("Logo introuvable", { status: 404 });

  return new Response(new Uint8Array(logo.donnees), {
    headers: {
      "Content-Type": logo.type,
      // L'adresse porte la date du dernier enregistrement : le fichier derrière
      // ne change jamais, il peut rester en cache longtemps.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
