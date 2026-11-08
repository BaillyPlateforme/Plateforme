import "server-only";
import { espaceEffectif, type EspacePro } from "@/lib/espaces";
import { listEspaces, lireRegles } from "@/lib/espaces-pro";
import { aUnEspaceRh } from "@/lib/rh";
import { getAcces, type Acces } from "@/lib/supabase/auth";

export type EspaceDeSession =
  | { ok: true; acces: Acces; espace: EspacePro }
  /** L'équipe, sans espace choisi : elle reçoit la liste des espaces à ouvrir. */
  | { ok: true; acces: Acces; espace: null; espaces: EspacePro[] }
  | { ok: false; statut: 401 | 404; erreur: string };

/**
 * L'espace RH qu'une requête a le droit de lire — la seule porte des routes
 * de l'espace RH. Un compte RH reçoit SON entreprise : l'espace vient de son
 * compte (`app_metadata.espace_id`, que seul le serveur écrit), jamais de
 * l'adresse appelée — le paramètre `apercu` est ignoré pour lui. L'équipe
 * Bailly, elle, peut regarder l'espace de n'importe quel client (?apercu=).
 */
export async function espaceDeLaSession(req: Request): Promise<EspaceDeSession> {
  const acces = await getAcces();
  if (!acces) return { ok: false, statut: 401, erreur: "Non authentifié" };

  const [espaces, regles] = await Promise.all([listEspaces(), lireRegles()]);
  const voulu = acces.role === "rh" ? acces.espaceId : new URL(req.url).searchParams.get("apercu");
  if (!voulu) {
    if (acces.role === "rh") return { ok: false, statut: 404, erreur: "Votre compte n'est rattaché à aucune entreprise. Contactez Bailly Déménagement." };
    return { ok: true, acces, espace: null, espaces: espaces.filter(aUnEspaceRh) };
  }
  const brut = espaces.find((e) => e.id === voulu);
  if (!brut || !aUnEspaceRh(brut)) return { ok: false, statut: 404, erreur: "Cet espace n'existe plus. Contactez Bailly Déménagement." };
  return { ok: true, acces, espace: espaceEffectif(brut, regles) };
}
