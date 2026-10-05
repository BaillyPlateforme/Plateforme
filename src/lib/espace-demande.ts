import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getEspace, lireLogo } from "@/lib/espaces-pro";
import { COULEUR_BAILLY, espaceDeLaDemande, nomEnseigne, type EspaceDeDemande, type EspacePro } from "@/lib/espaces";
import type { PdfEspace } from "@/lib/DevisPdf";

/**
 * L'espace pro d'une demande : ce qu'elle en a retenu à sa création (la cote,
 * ce qu'on montre, ce qu'on envoie) et sa configuration d'aujourd'hui (le
 * logo, la couleur, les textes). L'habillage suit l'espace tel qu'il est ;
 * les règles, elles, restent celles du jour de la demande.
 */
export async function espaceDUneDemande(
  requestId: string | null | undefined,
): Promise<{ retenu: EspaceDeDemande; config: EspacePro | null } | null> {
  if (!requestId) return null;
  try {
    const { data } = await createServiceClient()
      .from("requests")
      .select("raw_payload")
      .eq("id", requestId)
      .maybeSingle();
    const retenu = espaceDeLaDemande(data);
    if (!retenu) return null;
    return { retenu, config: await getEspace(retenu.slug).catch(() => null) };
  } catch {
    return null;
  }
}

/** L'habillage du devis PDF pour une demande venue d'un espace pro. */
export async function espacePourDevis(requestId: string | null | undefined): Promise<PdfEspace | null> {
  const espace = await espaceDUneDemande(requestId);
  if (!espace) return null;
  const { retenu, config } = espace;
  return {
    nom: nomEnseigne({ slug: retenu.slug, nom: config?.nom ?? retenu.nom }),
    couleur: config?.couleur ?? COULEUR_BAILLY,
    logo: config ? await lireLogo(config).catch(() => null) : null,
    mention: config?.devis_mention,
  };
}
