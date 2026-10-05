import { getEspaceParCodeOuJeton, lireLogo } from "@/lib/espaces-pro";

export const runtime = "nodejs";

// GET /api/espaces/[code]/logo — le logo d'un espace pro.
// Public : la page de l'espace l'affiche, et les e-mails le chargent par cette
// adresse (une boîte mail ne lit pas une image embarquée dans le message).
// L'adresse porte le code du lien, pas le nom de l'entreprise : on ne peut pas
// savoir qui a un espace en essayant des noms.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Le code du lien, ou le jeton remis à qui a saisi le nom de la société.
  const espace = await getEspaceParCodeOuJeton(code).catch(() => null);
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
