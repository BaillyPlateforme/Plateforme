import "server-only";
import { createHash } from "node:crypto";
import { CGV, VERSIONS } from "@/lib/espace-client/textes";

/** La case de la page de signature, telle qu'on l'inscrit dans la preuve de signature. */
export const TEXTE_ACCORD = "J'ai lu le devis et les conditions générales de vente, et je les accepte.";

/**
 * Les CGV que lit le client avec son devis (page de signature, devis complet
 * ouvert depuis l'espace client) :
 *   - celles des paramètres du devis (Devis › Paramètres), dès que Bailly les
 *     a saisies, avec une version tirée du texte lui-même : un texte modifié
 *     est une nouvelle version ;
 *   - sinon les CGV de l'espace client (textes.ts), provisoires elles aussi,
 *     pour que le client lise et accepte le même texte partout.
 * La version est celle qu'on inscrit avec la signature.
 */
export function cgvDuClient(cgvParametre: string | null | undefined): { texte: string; version: string; provisoires: boolean } {
  const t = (cgvParametre ?? "").trim();
  if (t) return { texte: t, version: `CGV-CRM-${createHash("sha256").update(t).digest("hex").slice(0, 8)}`, provisoires: false };
  return { texte: CGV.map((a) => `${a.titre}\n${a.texte}`).join("\n\n"), version: VERSIONS.cgv, provisoires: true };
}
