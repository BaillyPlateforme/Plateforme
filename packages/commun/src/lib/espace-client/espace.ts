import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { conseillerDe, dossiersDuClient, snapshotClient } from "./lectures";
import { calculerFrise, visibilite } from "./progression";
import { exigerClient, lireDonneesClient } from "./session";
import { photoDe } from "./photos";

/*
 * Le point d'entrée de toutes les pages du client. Il vérifie la session,
 * charge le dossier SEULEMENT s'il appartient au client connecté — sinon
 * 404, sans dire s'il existe — puis calcule la frise et ce qui est visible.
 * Les données viennent de `lireDonneesClient()` : en base, la RLS ne rend que
 * les lignes du client, et le filtre par client ci-dessous n'est qu'une
 * seconde vérification.
 *
 * `cache` : la mise en page et la page d'une même requête le demandent tous
 * les deux, il ne se calcule qu'une fois.
 */
export const chargerEspace = cache(async (reference: string) => {
  const client = await exigerClient();
  const d = await lireDonneesClient();
  const s = snapshotClient(d, client.id, decodeURIComponent(reference));
  if (!s) notFound();
  const frise = calculerFrise(s);
  return {
    ...s,
    frise,
    vis: visibilite(s, frise),
    conseiller: conseillerDe(d, client.conseiller_id),
    photo: photoDe(s.dossier.photo),
    autresDossiers: dossiersDuClient(d, client.id).filter((x) => x.id !== s.dossier.id),
    // Les modèles à télécharger des pièces demandées à ce dossier (migration 0021).
    modeles: (d.modeles_pieces ?? []).filter((m) => s.requirements.some((r) => r.id === m.requirement_id)).sort((a, b) => a.ordre - b.ordre),
    tutos: d.tutos.filter((t) => t.actif).sort((a, b) => a.ordre - b.ordre),
    services: d.services.filter((x) => x.actif).sort((a, b) => a.ordre - b.ordre),
  };
});

export type Espace = Awaited<ReturnType<typeof chargerEspace>>;
