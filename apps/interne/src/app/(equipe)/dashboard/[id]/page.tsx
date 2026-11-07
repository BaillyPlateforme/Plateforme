import { notFound } from "next/navigation";
import { getRequestDetail } from "@/lib/requests";
import { dossierDeLaDemande } from "@/lib/espace-client/demandes";
import { createServiceClient } from "@/lib/supabase/server";
import { qualifyRequest } from "@/lib/qualification";
import { env } from "@/lib/env";
import { q1 } from "@/crm/lib/db";
import RequestDetail from "./RequestDetail";

export const dynamic = "force-dynamic";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  // Le dossier du CRM et l'espace client déjà ouverts pour cette demande : la fiche y mène plutôt que d'en créer d'autres.
  const [espaceClient, dossierCrm] = await Promise.all([
    dossierDeLaDemande(id),
    q1<{ id: number; ref: string }>("select id, ref from dossiers where request_id=$1", [id]).catch(() => undefined),
  ]);

  return (
    <div>
      <RequestDetail detail={detail} photoUrls={photoUrls} espaceClient={espaceClient} dossierCrm={dossierCrm ?? null} />
    </div>
  );
}
