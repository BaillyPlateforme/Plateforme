import { notFound } from "next/navigation";
import { getRequestDetail } from "@/lib/requests";
import { dossierDeLaDemande } from "@/lib/espace-client/demandes";
import { createServiceClient } from "@/lib/supabase/server";
import { qualifyRequest } from "@/lib/qualification";
import { env } from "@/lib/env";
import { q1 } from "@/crm/lib/db";
import { parcoursDossier } from "@/crm/parcours/donnees";
import { sousStatut } from "@/crm/parcours/demandes-commun";
import { etapesDeLaDemande } from "@/crm/parcours/etapes";
import { araigneeDeLaDemande } from "@/crm/demandes/donnees";
import RequestDetail from "./RequestDetail";

export const dynamic = "force-dynamic";

/*
 * La page d'une demande du site : la première étape du Parcours (unification
 * du 08/11/2026). Même forme que la page d'un dossier — le bandeau au nom du
 * client, puis, à cheval sur la bande, la carte du parcours de A à Z, la
 * décision à son pied —, puis le détail de la demande, en onglets.
 *
 * Une demande acceptée a son dossier : la carte montre alors le parcours de
 * ce dossier, et la page y mène (bandeau et pied de la carte). Elle reste
 * ouverte, pour ses photos, son analyse et ses messages, que la page du
 * dossier n'affiche pas.
 */
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail = await getRequestDetail(id);
  if (!detail) notFound();

  // Filet de sécurité : si la demande est complète mais pas encore analysée
  // (ancienne demande), on génère l'estimation + l'évaluation automatiquement.
  const r = detail.request;
  const complete = r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville;
  const hasAnalysis = detail.events.some((e) => e.type === "analysis");
  if (complete && !hasAnalysis) {
    await qualifyRequest(id);
    detail = (await getRequestDetail(id)) ?? detail;
  }

  // URLs signées pour afficher les photos du bucket privé.
  const supabase = createServiceClient();
  const bucket = env.storageBucket();
  const photoUrls: Record<string, string> = {};
  await Promise.all(
    detail.photos.map(async (p) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(p.storage_path, 3600);
      if (data?.signedUrl) photoUrls[p.id] = data.signedUrl;
    }),
  );

  // Le dossier du CRM et l'espace client déjà ouverts pour cette demande : la page y mène plutôt que d'en créer d'autres.
  const [espaceClient, dossierCrm] = await Promise.all([
    dossierDeLaDemande(id),
    q1<{ id: number; ref: string; statut: string }>("select id, ref, statut from dossiers where request_id=$1", [id]).catch(() => undefined),
  ]);

  // Le parcours : celui du dossier si la demande est acceptée ; sinon, la demande en première étape.
  const demande = detail.request;
  const duDossier = dossierCrm
    ? await parcoursDossier(dossierCrm.id).catch((e) => {
        console.error("Demande : lecture du parcours du dossier impossible", e instanceof Error ? e.message : e);
        return null;
      })
    : null;
  const qualifieLe =
    sousStatut(demande.status) === "qualified"
      ? (detail.events
          .filter((e) => e.type === "analysis" || (e.type === "status_changed" && ["qualified", "quoted", "won"].includes(String((e.payload as { status?: unknown } | null)?.status))))
          .map((e) => e.created_at)
          .sort()[0] ?? null)
      : null;
  const parcours = duDossier
    ? { etapes: duDossier.etapes, perdu: dossierCrm!.statut === "perdu", dossier: true }
    : { etapes: etapesDeLaDemande({ le: demande.created_at, source: demande.source, statut: demande.status, qualifieLe }), perdu: demande.status === "lost" || demande.status === "archived", dossier: false };

  // L'araignée de la demande (carte Évaluation), la même que dans Demandes › Top demandes ; jamais bloquante.
  const araignee = await araigneeDeLaDemande(id).catch((e) => {
    console.error("Demande : araignée illisible", e instanceof Error ? e.message : e);
    return null;
  });

  return (
    <div>
      <RequestDetail detail={detail} photoUrls={photoUrls} espaceClient={espaceClient} dossierCrm={dossierCrm ?? null} parcours={parcours} araignee={araignee} />
    </div>
  );
}
