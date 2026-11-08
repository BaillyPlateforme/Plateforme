import "server-only";
import { cache } from "react";
import { chargerEspace } from "@/lib/espace-client/espace";
import { apercuEquipe } from "@/lib/espace-client/session";
import { tutosVues } from "@/lib/espace-client/tutos";
import { lireTutosVus } from "@/lib/espace-client/tutos-vus";

/**
 * Ce que lisent les pages des tutos : l'espace du dossier (session et
 * propriété vérifiées par chargerEspace), les tutoriels publiés avec leur
 * contenu, et ceux que le client a vus — sous SA session (RLS), ou par la clé
 * de service pendant un aperçu de l'équipe, qui n'a pas de session de client.
 */
export const chargerTutos = cache(async (reference: string) => {
  const e = await chargerEspace(reference);
  const apercu = await apercuEquipe();
  const vus = await lireTutosVus(e.client.id, apercu ? "service" : "session");
  return { e, apercu, tutos: tutosVues(e.tutos, vus) };
});
